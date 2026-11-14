"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, RefreshCw, Waves } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { OverviewPanel } from "./_components/OverviewPanel";
import { TimelinePanel } from "./_components/TimelinePanel";
import { ScenariosPanel } from "./_components/ScenariosPanel";
import { PlanPanel } from "./_components/PlanPanel";
import { AccuracyPanel } from "./_components/AccuracyPanel";
import { api, HORIZONS, SCENARIOS, type Forecast, type Horizon, type LineRow, type Scenario } from "./_components/shared";

const TABS = ["overview", "timeline", "scenarios", "plan", "accuracy"] as const;
type Tab = (typeof TABS)[number];

export default function CashFlowPage() {
  const t = useTranslations("CashFlow");
  const { fCurrency, currency, locale } = useFormat();
  const router = useRouter();
  const sp = useSearchParams();
  const horizon = (HORIZONS as string[]).includes(sp.get("horizonType") ?? "") ? (sp.get("horizonType") as Horizon) : "WEEKLY_13";
  const scenario = (SCENARIOS as string[]).includes(sp.get("scenarioTag") ?? "") ? (sp.get("scenarioTag") as Scenario) : "BASE";
  const tab = (TABS as readonly string[]).includes(sp.get("tab") ?? "") ? (sp.get("tab") as Tab) : "overview";

  const [data, setData] = useState<Forecast | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const setParam = useCallback((patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) next.set(k, v);
    if (patch.horizonType || patch.scenarioTag) setLoading(true);
    router.replace(`/cash-flow?${next.toString()}`, { scroll: false });
  }, [router, sp]);
  const reload = useCallback(() => { setLoading(true); setTick((n) => n + 1); }, []);

  useEffect(() => {
    let cancelled = false;
    api<Forecast>(`/api/cash-flow/forecast?horizonType=${horizon}&scenarioTag=${scenario}`)
      .then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "error"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [horizon, scenario, tick]);

  const money = useMemo(() => (n: number) => fCurrency(n), [fCurrency]);
  const onPlanChanged = (key: string, status: LineRow["planStatus"], note: string | null) =>
    setData((d) => (d ? { ...d, lines: d.lines.map((l) => (l.key === key ? { ...l, planStatus: status, planNote: note } : l)) } : d));

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("subtitle")}
      icon={<Waves className="h-6 w-6 text-primary" />}
      pageActions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label={t("horizonLabel")}>
            {HORIZONS.map((h) => <button key={h} type="button" aria-pressed={h === horizon} onClick={() => setParam({ horizonType: h })} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", h === horizon ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground")}>{t(`horizon.${h}`)}</button>)}
          </div>
          <div className="inline-flex rounded-lg border bg-muted/40 p-0.5" role="group" aria-label={t("scenarioLabel")}>
            {SCENARIOS.map((s) => <button key={s} type="button" aria-pressed={s === scenario} onClick={() => setParam({ scenarioTag: s })} className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", s === scenario ? "bg-background shadow-xs" : "text-muted-foreground hover:text-foreground")}>{t(`scenario.${s}`)}</button>)}
          </div>
          <Button variant="outline" size="sm" onClick={() => reload()} disabled={loading} className="gap-1.5">{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}{t("refresh")}</Button>
        </div>
      }
    >
      <div className="space-y-5">
        <nav className="-mx-1 flex gap-1 overflow-x-auto px-1" aria-label={t("title")}>
          {TABS.map((k) => <button key={k} type="button" onClick={() => setParam({ tab: k })} aria-current={tab === k ? "page" : undefined} className={cn("shrink-0 rounded-full px-4 py-1.5 text-sm transition-colors", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>{t(`tab.${k}`)}</button>)}
        </nav>

        {tab === "accuracy" ? <AccuracyPanel locale={locale} money={money} /> : tab === "plan" ? (
          <PlanPanel locale={locale} money={money} canEdit={data?.canManage ?? false} onChanged={() => reload()} />
        ) : error && !data ? (
          <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-8 text-center"><p className="font-medium">{t("loadFailed")}</p><p className="mt-1 text-sm text-muted-foreground">{error}</p><Button className="mt-4" variant="outline" onClick={() => reload()}>{t("retry")}</Button></div>
        ) : !data ? (
          <div className="space-y-4"><Skeleton className="h-40 rounded-3xl" /><div className="grid grid-cols-2 gap-3 lg:grid-cols-6">{[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div><Skeleton className="h-80 rounded-3xl" /></div>
        ) : (
          <div className={cn(loading && "opacity-70 transition-opacity")}>
            {tab === "overview" ? <OverviewPanel data={data} locale={locale} currency={currency} money={money} onGoTimeline={() => setParam({ tab: "timeline" })} onGoPlan={() => setParam({ tab: "plan" })} />
              : tab === "timeline" ? <TimelinePanel data={data} locale={locale} money={money} canEdit onChanged={onPlanChanged} />
              : <ScenariosPanel data={data} locale={locale} currency={currency} money={money} />}
          </div>
        )}
      </div>
    </DashboardPageShell>
  );
}
