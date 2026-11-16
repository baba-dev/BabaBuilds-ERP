"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { RefreshCw, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFormat } from "@/hooks/use-format";
import { getCurrentFinancialYear } from "@/lib/financial-year";
import { resolveDashboardLaunchTarget } from "@/lib/launch-routing";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { PageErrorState } from "@/components/states/PageErrorState";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { FirstLookWelcome } from "@/components/onboarding/FirstLookWelcome";
import { PersonaPicker } from "@/components/onboarding/PersonaPicker";
import { GuidedFlowsHub } from "@/components/dashboard/GuidedFlowsHub";
import TrialStatusPill from "@/components/dashboard/TrialStatusPill";
import { StartWithRealBusinessCTA } from "@/components/demo/StartWithRealBusinessCTA";
import { parseDashboardResponse } from "./parse-dashboard-response";
import { formatMoneyWhole } from "./dashboard-format";
import { DASHBOARD_ROUTES } from "./dashboard-routes";
import { DashboardActivity } from "./dashboard-activity";
import { DashboardAgenda } from "./dashboard-agenda";
import { DashboardAskBar } from "./dashboard-ask-bar";
import { DashboardAttention } from "./dashboard-attention";
import { DashboardCashFlowSummary } from "./dashboard-cash-flow-summary";
import { DashboardKpis } from "./dashboard-kpis";
import { DashboardModules } from "./dashboard-modules";
import { DashboardPaymentDialog } from "./dashboard-payment-dialog";
import { DashboardQuickActions } from "./dashboard-quick-actions";
import { DashboardReceivables } from "./dashboard-receivables";
import { DashboardRecentInvoices } from "./dashboard-recent-invoices";
import { DashboardReportCards } from "./dashboard-report-cards";
import { DashboardSetup } from "./dashboard-setup";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { DashboardTrend } from "./dashboard-trend";
import { LockedNote, Panel, focusRing } from "./dashboard-ui";
import type { DashboardData, RecentInvoiceRow } from "./types";

/** Figures older than this are refreshed when the tab comes back into view. */
const STALE_AFTER_MS = 2 * 60_000;
const DEMO_COUNT_KEY = "demo_action_count";
const DEMO_TARGET = 3;

// The demo step counter lives in localStorage; reading it through an external store keeps server and first client render identical.
const demoListeners = new Set<() => void>();
const subscribeDemo = (listener: () => void) => {
  demoListeners.add(listener);
  return () => {
    demoListeners.delete(listener);
  };
};
const readDemoCount = () => {
  try {
    const stored = Number(window.localStorage.getItem(DEMO_COUNT_KEY) ?? "0");
    return Number.isFinite(stored) ? stored : 0;
  } catch {
    return 0;
  }
};
const bumpDemoCount = () => {
  try {
    const next = readDemoCount() + 1;
    window.localStorage.setItem(DEMO_COUNT_KEY, String(next));
    if (next >= DEMO_TARGET) window.localStorage.setItem("demo_actions_completed", "1");
  } catch {
    // Private mode: the counter simply does not persist.
  }
  demoListeners.forEach((listener) => listener());
};

type LoadResult = { data: DashboardData; loadedAt: number };

async function fetchDashboard(fy: string, signal: AbortSignal): Promise<LoadResult> {
  const res = await fetch(`/api/dashboard?fy=${encodeURIComponent(fy)}`, { cache: "no-store", signal });
  const json: unknown = await res.json().catch(() => null);
  const parsed = res.ok ? parseDashboardResponse(json) : null;
  if (!parsed) throw new Error("dashboard unavailable");
  return { data: parsed, loadedAt: Date.now() };
}

function greetingKey(loadedAt: number): "morning" | "afternoon" | "evening" {
  const hour = new Date(loadedAt).getHours();
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}

export default function Dashboard() {
  const t = useTranslations("DashboardHome");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const { currency, locale } = useFormat();
  const onboarding = useOnboarding();

  const [fy, setFy] = useState(() => getCurrentFinancialYear(new Date(), "local"));
  const [reloadKey, setReloadKey] = useState(0);
  const [result, setResult] = useState<LoadResult | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(true);
  const [payInvoice, setPayInvoice] = useState<RecentInvoiceRow | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboard(fy, controller.signal)
      .then((next) => {
        setResult(next);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [fy, reloadKey]);

  const refresh = () => {
    setBusy(true);
    setReloadKey((key) => key + 1);
  };
  const changeFy = (next: string) => {
    if (next === fy) return;
    setBusy(true);
    setFy(next);
  };

  const loadedAt = result?.loadedAt ?? 0;
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible" && loadedAt > 0 && Date.now() - loadedAt > STALE_AFTER_MS) {
        setBusy(true);
        setReloadKey((key) => key + 1);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadedAt]);

  useEffect(() => {
    const launchTarget = resolveDashboardLaunchTarget(new URLSearchParams(searchParams.toString()));
    if (launchTarget) router.replace(launchTarget);
  }, [router, searchParams]);

  const money = useMemo(() => (value: number) => formatMoneyWhole(value, currency, locale), [currency, locale]);

  const data = result?.data ?? null;
  const enabledModules = useMemo(() => new Set(data?.optionalModules.map((m) => m.moduleKey) ?? []), [data]);

  const fyOptions = useMemo(() => {
    const startYear = 2000 + Number(getCurrentFinancialYear(new Date(), "local").slice(0, 2));
    return Array.from({ length: 4 }, (_, i) => {
      const year = startYear - i;
      return `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
    });
  }, []);
  const fyLabel = t("fy", { fy: `20${fy}` });

  const isDemoTour = searchParams.get("demo") === "1";
  const demoCount = useSyncExternalStore(subscribeDemo, readDemoCount, () => 0);
  const showFirstLook = !onboarding.isLoading && !onboarding.isDemoUser && !onboarding.disabled && (onboarding.isFirstLogin || searchParams.get("fromSignup") === "1");

  const firstName = (session?.user?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const title = data ? (firstName ? t(`greeting.${greetingKey(loadedAt)}Name`, { name: firstName }) : t(`greeting.${greetingKey(loadedAt)}`)) : t("title");
  const description = data?.workspace.name ? `${data.workspace.name} · ${fyLabel}` : fyLabel;
  const isTrialing = data?.health.subscriptionState === "TRIALING";

  const headerActions = (
    <div className="flex items-center gap-2">
      {data && isTrialing ? <TrialStatusPill trialEndsAt={data.health.trialEndsAt} isTrialing /> : null}
      <Select value={fy} onValueChange={changeFy}>
        <SelectTrigger className="h-10 w-[132px] md:h-9" aria-label={t("fySelect")}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {fyOptions.map((option) => (
            <SelectItem key={option} value={option}>
              {t("fy", { fy: `20${option}` })}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 md:h-9 md:w-9" onClick={refresh} disabled={busy} aria-label={t("refresh")} title={t("refresh")}>
        <RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} aria-hidden />
      </Button>
    </div>
  );

  return (
    <DashboardPageShell title={title} description={description} secondaryActions={headerActions}>
      {!data && failed ? (
        <PageErrorState title={t("error.title")} description={t("error.description")} retryLabel={t("error.retry")} className="min-h-[50dvh]" onRetry={refresh} />
      ) : !data ? (
        <DashboardSkeleton label={t("loading")} />
      ) : (
        <div className={cn("space-y-4 transition-opacity duration-200", busy && "opacity-60")} aria-busy={busy}>
          {failed ? (
            <div role="alert" className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm text-foreground">
              <span className="flex min-w-0 items-center gap-2">
                <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden />
                <span className="min-w-0">{t("error.stale")}</span>
              </span>
              <Button size="sm" variant="outline" onClick={refresh}>
                {t("error.retry")}
              </Button>
            </div>
          ) : null}

          <DashboardQuickActions />

          {isDemoTour ? (
            <section aria-label={t("demo.title")} className="rounded-2xl border border-orange-500/25 bg-orange-500/[0.06] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-sm font-semibold text-foreground">{t("demo.title")}</p>
                <p className="text-xs tabular-nums text-muted-foreground">{t("demo.progress", { done: Math.min(demoCount, DEMO_TARGET), total: DEMO_TARGET })}</p>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{t("demo.hint")}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(
                  [
                    ["proposal", DASHBOARD_ROUTES.proposals],
                    ["tax", DASHBOARD_ROUTES.tax],
                    ["invoice", DASHBOARD_ROUTES.invoices],
                  ] as const
                ).map(([key, href]) => (
                  <Link
                    key={key}
                    href={href}
                    onClick={bumpDemoCount}
                    className={cn("inline-flex h-10 items-center rounded-full border border-border/70 bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 md:h-9", focusRing)}
                  >
                    {t(`demo.step.${key}`)}
                  </Link>
                ))}
              </div>
              {demoCount >= DEMO_TARGET ? <StartWithRealBusinessCTA demoTemplate={searchParams.get("demoTemplate") ?? "dm_agency"} actionCount={demoCount} /> : null}
            </section>
          ) : null}

          {showFirstLook ? (
            <>
              {!onboarding.persona ? <PersonaPicker /> : null}
              <FirstLookWelcome companyName={data.workspace.name || null} persona={onboarding.persona} />
            </>
          ) : null}

          {/* A demo workspace is somebody else's sample data: nagging the visitor to "finish setup" on it makes no sense. */}
          {onboarding.isDemoUser ? null : <DashboardSetup health={data.health} />}

          {data.permissions.canViewAccounting ? (
            <>
              <DashboardKpis data={data} money={money} hasCollections={enabledModules.has("AR_COLLECTIONS")} />
              <DashboardAskBar aiReady={data.health.integrationReadiness.integrations.groq?.configured === true} />

              {/* On a phone the things to act on come before the charts; from lg they sit in a rail beside them. */}
              <div className="grid gap-3 lg:grid-cols-3">
                <div className="contents lg:order-last lg:flex lg:min-w-0 lg:flex-col lg:gap-3">
                  <div className="order-1 min-w-0">
                    <DashboardAttention data={data} money={money} enabledModules={enabledModules} />
                  </div>
                  <div className="order-2 min-w-0">
                    <DashboardAgenda upcoming={data.upcoming} money={money} locale={locale} />
                  </div>
                  <div className="order-4 min-w-0 lg:order-3 lg:flex lg:flex-1 lg:flex-col [&>section]:flex-1">
                    <DashboardActivity activity={data.activity} locale={locale} />
                  </div>
                </div>
                <div className="order-3 flex min-w-0 flex-col gap-3 lg:order-none lg:col-span-2">
                  <DashboardTrend charts={data.charts} fyLabel={fyLabel} currency={currency} locale={locale} money={money} />
                  <div className={cn("grid flex-1 gap-3", enabledModules.has("CASH_FLOW") && "md:grid-cols-2")}>
                    <DashboardReceivables receivables={data.receivables} money={money} hasCollections={enabledModules.has("AR_COLLECTIONS")} />
                    {enabledModules.has("CASH_FLOW") ? <DashboardCashFlowSummary money={money} reloadKey={reloadKey} /> : null}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
            <DashboardAskBar aiReady={data.health.integrationReadiness.integrations.groq?.configured === true} />
            <div className="grid gap-3 lg:grid-cols-3">
              <Panel labelledBy="dash-finance-locked" title={t("locked.financeTitle")} className="lg:col-span-2">
                <LockedNote title={t("locked.title")} hint={t("locked.accounting")} />
              </Panel>
              <DashboardAttention data={data} money={money} enabledModules={enabledModules} />
            </div>
            </>
          )}

          <DashboardModules data={data} money={money} locale={locale} enabledModules={enabledModules} onModuleEnabled={refresh} />

          {data.permissions.canViewRecentLedger ? <DashboardRecentInvoices invoices={data.recentInvoices} locale={locale} onRecordPayment={setPayInvoice} /> : null}

          <DashboardReportCards />
          <GuidedFlowsHub />
        </div>
      )}

      <DashboardPaymentDialog invoice={payInvoice} locale={locale} onClose={() => setPayInvoice(null)} onRecorded={refresh} />
    </DashboardPageShell>
  );
}
