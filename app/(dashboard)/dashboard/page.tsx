"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Download, LayoutDashboard, Send, Sparkles, ArrowRight, Users, Briefcase, ReceiptText, X, Building, CircleAlert, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { getBustedUrl } from "@/lib/cache-buster";
import { getCurrencySymbol } from "@/lib/currency";
import { getCurrentFinancialYear } from "@/lib/financial-year";
import { resolveDashboardLaunchTarget } from "@/lib/launch-routing";
import { DataTable, type DataTableColumnDef } from "@/components/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { PageErrorState } from "@/components/states/PageErrorState";
import { PageLoadingState } from "@/components/states/PageLoadingState";
import { getInvoiceStatusBadgeKey, INVOICE_STATUS, isPaidInvoiceStatus, toInvoiceStatus } from "@/lib/invoice-status";
import { parseDashboardResponse } from "./parse-dashboard-response";
import { TableActions } from "./table-actions";
import { PaymentModalIsland } from "./payment-modal-island";
import { ChartsIsland } from "./charts-island";
import { DashboardHealthStrip } from "./dashboard-health-strip";
import { DashboardAttentionCenter } from "./dashboard-attention-center";
import { DashboardFinancialPulse } from "./dashboard-financial-pulse";
import { DashboardCashFlowSummary } from "./dashboard-cash-flow-summary";
import { DashboardSalesAndShopPanel } from "./dashboard-sales-shop-panel";
import { DashboardOperationsPanel } from "./dashboard-operations-panel";
import { DashboardTrustPanel } from "./dashboard-trust-panel";
import { DashboardRightRail } from "./dashboard-right-rail";
import { dashboardTypography as ty } from "./dashboard-typography";
import type { DashboardData, RecentInvoiceRow } from "./types";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { FirstLookWelcome } from "@/components/onboarding/FirstLookWelcome";
import { PersonaPicker } from "@/components/onboarding/PersonaPicker";
import { GuidedFlowsHub } from "@/components/dashboard/GuidedFlowsHub";
import { StartWithRealBusinessCTA } from "@/components/demo/StartWithRealBusinessCTA";

export default function Dashboard() {
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedFy, setSelectedFy] = useState(getCurrentFinancialYear(new Date(), "local"));
  const [data, setData] = useState<Partial<DashboardData>>({});
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncHealthLoading, setSyncHealthLoading] = useState(false);
  const [syncHealthError, setSyncHealthError] = useState<string | null>(null);
  const [islandsEnabled, setIslandsEnabled] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<RecentInvoiceRow | null>(null);
  const [amountReceived, setAmountReceived] = useState("0");
  const [dateReceived, setDateReceived] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [gettingStartedDismissed, setGettingStartedDismissed] = useState(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("erp_getting_started_dismissed") === "1";
  });
  const {
    isFirstLogin,
    disabled: onboardingDisabled,
    isDemoUser,
    isLoading: onboardingLoading,
    persona: onboardingPersona,
  } = useOnboarding();

  const { fCurrency, currency } = useFormat();
  const currencySymbol = getCurrencySymbol(currency);

  const tr = useCallback((key: string, fallback: string, values?: Record<string, any>) => {
    if (typeof (t as any).has === "function" && !(t as any).has(key)) return fallback;
    try {
      const translation = t(key as any, values);
      if (translation === key || translation === `Dashboard.${key}`) return fallback;
      return translation;
    } catch {
      return fallback;
    }
  }, [t]);

  const isMobile = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      const media = window.matchMedia("(max-width: 768px)");
      const handler = () => onStoreChange();
      media.addEventListener("change", handler);
      return () => media.removeEventListener("change", handler);
    },
    () => (typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false),
    () => false,
  );

  useEffect(() => {
    const loadFlags = async () => {
      const response = await fetch("/api/runtime-flags", { cache: "no-store" });
      if (response.ok) {
        const runtimeFlags = (await response.json()) as { dashboardIslands?: boolean };
        setIslandsEnabled(Boolean(runtimeFlags.dashboardIslands));
      }
    };
    loadFlags().catch((e) => {
      console.warn("Failed to load runtime flags", e);
    });
  }, []);

  useEffect(() => {
    fetch("/api/settings", { cache: "no-store" })
      .then((r) => r.json())
      .then((d: { companyName?: string }) => {
        if (d.companyName) setOrgName(d.companyName);
      })
      .catch((e) => {
        console.warn("Failed to load org name", e);
      });
  }, []);

  const fetchDashboardData = async (fy: string) => {
    const res = await fetch(`/api/dashboard?fy=${fy}`, { cache: "no-store" });
    const json = await res.json();
    if (!res.ok || json.error) {
      throw new Error(json.error || tr("toast.error.load_dashboard", "Unable to load dashboard"));
    }
    const parsed = parseDashboardResponse(json) as DashboardData | null;
    if (!parsed) throw new Error("Dashboard payload malformed");
    return parsed;
  };

  const loadAllData = async (fy: string, signal?: AbortSignal) => {
    setError(null);
    setIsInitialLoad(true);

    try {
      const res = await fetch(`/api/dashboard?fy=${fy}`, { cache: "no-store", signal });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || tr("toast.error.load_dashboard", "Unable to load dashboard"));
      }
      const parsed = parseDashboardResponse(json) as DashboardData | null;
      if (!parsed) throw new Error("Dashboard payload malformed");
      if (signal?.aborted) return;
      setData(parsed);
      if (signal?.aborted) return;
      setIsInitialLoad(false);
    } catch (e: any) {
      if (e.name === "AbortError") return;
      setError(e?.message ?? "Unable to load dashboard");
      toast.error(tr("toast.error.load_dashboard_refresh", "Failed to load dashboard"));
      setIsInitialLoad(false);
    }
  };

  useEffect(() => {
    const controller = new AbortController();
    loadAllData(selectedFy, controller.signal);
    return () => controller.abort();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional trigger list; callbacks are re-created each render and must not retrigger the effect
  }, [selectedFy]);

  useEffect(() => {
    const launchTarget = resolveDashboardLaunchTarget(new URLSearchParams(searchParams.toString()));
    if (launchTarget) router.replace(launchTarget);
  }, [router, searchParams]);

  const handleResendEmail = async (invoice: RecentInvoiceRow) => {
    setResendingId(invoice.id);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/resend`, { method: "POST" });
      if (!res.ok) throw new Error();
      toast.success(tr("toast.success.email_sent", "Invoice email sent"));
    } catch {
      toast.error(tr("toast.error.send_email", "Unable to resend invoice email"));
    } finally {
      setResendingId(null);
    }
  };

  const openPayModal = (invoice: RecentInvoiceRow) => {
    setSelectedInvoice(invoice);
    const remaining = Math.max(0, Number(invoice.totalAmount) - Number(invoice.amountReceived ?? 0));
    setAmountReceived(String(remaining));
    setPayModalOpen(true);
  };

  const handleMarkPaid = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedInvoice) return;

    setIsSubmittingPayment(true);
    try {
      const res = await fetch(`/api/invoices/${selectedInvoice.id}/pay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountReceived, dateReceived }),
      });
      if (!res.ok) throw new Error();
      toast.success(tr("toast.success.payment_logged", "Payment logged"));
      setPayModalOpen(false);
      loadAllData(selectedFy);
    } catch {
      toast.error(tr("toast.error.log_payment", "Unable to log payment"));
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleRefreshSyncImportHealth = async () => {
    setSyncHealthLoading(true);
    setSyncHealthError(null);
    try {
      const refreshed = await fetchDashboardData(selectedFy);
      setData((prev) => ({
        ...prev,
        ...refreshed,
        attention: {
          ...prev.attention,
          ...refreshed.attention,
        },
        health: {
          ...prev.health,
          ...refreshed.health,
        },
      }));
    } catch (e: any) {
      setSyncHealthError(e?.message ?? tr("toast.error.load_dashboard", "Unable to load dashboard"));
    } finally {
      setSyncHealthLoading(false);
    }
  };

  const showDemoUpgradePrompt = searchParams.get("demo") === "1";
  const [demoActionCount, setDemoActionCount] = useState(0);
  const [showDemoConversionCta, setShowDemoConversionCta] = useState(false);
  const [setupDetailsOpen, setSetupDetailsOpen] = useState(false);
  useEffect(() => {
    if (!showDemoUpgradePrompt || typeof window === "undefined") return;
    const storedCount = Number(window.localStorage.getItem("demo_action_count") ?? "0");
    setDemoActionCount(Number.isFinite(storedCount) ? storedCount : 0);
    setShowDemoConversionCta(window.localStorage.getItem("demo_actions_completed") === "1");
  }, [showDemoUpgradePrompt]);

  const trackDemoAction = (action: string) => {
    if (!showDemoUpgradePrompt || typeof window === "undefined") return;
    const next = demoActionCount + 1;
    setDemoActionCount(next);
    window.localStorage.setItem("demo_action_count", String(next));
    if (next >= 3) {
      window.localStorage.setItem("demo_actions_completed", "1");
      setShowDemoConversionCta(true);
    }
    if (next <= 3) {
      toast.success(`Demo progress: ${next}/3 actions`, {
        description: `You completed: ${action}.`,
      });
    }
  };

  const baseYear = new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1;
  const fyOptions = Array.from({ length: 4 }).map((_, idx) => {
    const year = baseYear - 3 + idx;
    const yy = String(year).slice(-2);
    const n = String(year + 1).slice(-2);
    return `${yy}-${n}`;
  });

  const columns: DataTableColumnDef<RecentInvoiceRow>[] = [
    {
      id: "invoice",
      header: tr("table_invoice", "Invoice"),
      accessor: (row) => row.invoiceNumber,
      cell: (row) => (
        <div className="flex flex-col py-1">
          <span className={ty.cardTitle}>{row.invoiceNumber}</span>
          <span className={`${ty.labelUpper} sm:hidden`}>
            {format(new Date(row.invoiceDate), "dd MMM yyyy")}
          </span>
        </div>
      ),
    },
    {
      id: "client",
      header: tr("table_client", "Client"),
      accessor: (row) => row.clientName,
      cell: (row) => (
        <span className={`${ty.helper} font-medium text-muted-foreground`}>
          {row.clientName}
        </span>
      ),
    },
    {
      id: "date",
      header: tr("table_date", "Date"),
      cell: (row) => (
        <span className={`${ty.helperXs} text-muted-foreground tabular-nums`}>
          {format(new Date(row.invoiceDate), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      id: "status",
      header: tr("table_status", "Status"),
      cell: (row) => {
        const status = toInvoiceStatus(row.status);
        const key = getInvoiceStatusBadgeKey(status);
        const className =
          status === INVOICE_STATUS.PAID
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            : status === INVOICE_STATUS.PARTIALLY_PAID
              ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/20"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
        return (
          <Badge variant="outline" className={`${ty.kpiBadge} ${className}`}>
            {tr(key, status)}
          </Badge>
        );
      },
    },
    {
      id: "amount",
      header: <div className="text-right pr-2">{tr("table_amount", "Amount")}</div>,
      className: "text-right",
      cell: (row) => <span className={`${ty.valueSmBold} pr-2`}>{fCurrency(row.totalAmount)}</span>,
    },
    {
      id: "actions",
      header: <div className="text-right pr-2">{tr("table_actions", "Actions")}</div>,
      className: "text-right p-0",
      cell: (row) =>
        islandsEnabled ? (
          <div className="pr-2">
            <TableActions invoice={row} t={tr} onOpenPayModal={openPayModal} onResendEmail={handleResendEmail} resending={resendingId === row.id} />
          </div>
        ) : (
          <div className="flex items-center justify-end gap-2 pr-2">
            {!isPaidInvoiceStatus(row.status) && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2.5 text-[11px] font-semibold tracking-tight bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
                onClick={() => openPayModal(row)}
              >
                {tr("record_payment", "Record payment")}
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400" onClick={() => handleResendEmail(row)} disabled={resendingId === row.id}>
              <Send className="w-3.5 h-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400" asChild>
              <a href={getBustedUrl(row.pdfPath, row.updatedAt)} target="_blank" rel="noreferrer">
                <Download className="w-3.5 h-3.5" />
              </a>
            </Button>
          </div>
        ),
    },
  ];

  const d = data as DashboardData;
  const enabledModulesSet = useMemo(() => new Set(d.optionalModules?.map(m => m.moduleKey) ?? []), [d.optionalModules]);
  const handleModuleEnabled = () => {
    void loadAllData(selectedFy);
  };

  const selectedInvoiceBilled = Number(selectedInvoice?.totalAmount ?? 0);
  const selectedInvoiceReceived = Number(selectedInvoice?.amountReceived ?? 0);
  const selectedInvoiceRemaining = Math.max(0, selectedInvoiceBilled - selectedInvoiceReceived);

  const SkeletonBlock = ({ className }: { className?: string }) => (
    <div className={`rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse ${className}`} />
  );

  // 2.3 FIX: show a getting-started checklist for new workspaces (zero revenue = fresh account)
  const fromSignup = searchParams.get("fromSignup") === "1";
  const showFirstLook =
    !onboardingLoading &&
    !isDemoUser &&
    !onboardingDisabled &&
    (isFirstLogin || fromSignup);
  const showGettingStarted =
    !showFirstLook &&
    !gettingStartedDismissed &&
    !isInitialLoad &&
    (d.financialPulse?.billedRevenue ?? 1) === 0 &&
    (d.recentInvoices?.length ?? 1) === 0;

  const dismissGettingStarted = () => {
    localStorage.setItem("erp_getting_started_dismissed", "1");
    setGettingStartedDismissed(true);
  };
  const permissionFlags = d.permissions ?? {
    canViewSales: true,
    canViewOperations: true,
    canViewTrust: true,
    canViewCharts: true,
  };

  const lockOverlayClassName =
    "relative before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:bg-zinc-200/35 before:dark:bg-zinc-950/55 before:backdrop-blur-[1px]";

  const moduleLockTooltip = tr(
    "permission_locked_module",
    "You don't have permission to view this module.",
  );

  const setupChecklist = useMemo(() => {
    const checks = [
      {
        id: "setup-profile",
        title: tr("setup_profile_title", "Business profile"),
        description: tr(
          "setup_profile_desc",
          "Complete company profile details in Settings.",
        ),
        href: "/settings/profile",
        done: Boolean(orgName),
      },
      {
        id: "setup-integrations",
        title: tr("setup_integrations_title", "Core integrations"),
        description: tr(
          "setup_integrations_desc",
          "Configure payment + SMTP integrations for billing workflow.",
        ),
        href: "/settings",
        done: (d.health?.integrationReadiness?.summary?.healthy ?? 0) >= 2,
      },
      {
        id: "setup-clients",
        title: tr("setup_clients_title", "Client and service setup"),
        description: tr(
          "setup_clients_desc",
          "Add at least one client and service before invoicing.",
        ),
        href: "/clients",
        done: (d.recentInvoices?.length ?? 0) > 0 || (d.salesAndShop?.publishedProducts ?? 0) > 0,
      },
      {
        id: "setup-first-invoice",
        title: tr("setup_invoice_title", "First invoice"),
        description: tr(
          "setup_invoice_desc",
          "Create and send your first invoice to activate ledger flow.",
        ),
        href: "/income",
        done: (d.recentInvoices?.length ?? 0) > 0,
      },
    ];
    return checks;
  }, [d.health?.integrationReadiness?.summary?.healthy, d.recentInvoices?.length, d.salesAndShop?.publishedProducts, orgName, tr]);

  const pendingSetupChecklist = setupChecklist.filter((item) => !item.done);
  

  if (isInitialLoad) {
    return <PageLoadingState title={tr("loading", "Loading dashboard")} description={tr("loading_desc", "Preparing command center")} className="min-h-screen" />;
  }

  if (error && Object.keys(data).length === 0) {
    return <PageErrorState title={tr("sync_issue_title", "Dashboard unavailable")} description={error} className="min-h-screen" onRetry={() => loadAllData(selectedFy)} />;
  }

  return (
    <DashboardPageShell
      title={tr("financial_overview", "Business command center")}
      description={tr("global_command_center", "Finance, compliance, shop, and operations in one decisive view.", { countryCode: data.countryCode })}
      icon={<LayoutDashboard className="w-5 h-5 text-orange-500" />}
      secondaryActions={
        <Select value={selectedFy} onValueChange={setSelectedFy}>
          <SelectTrigger className="w-[120px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {fyOptions.map((fy) => (
              <SelectItem key={fy} value={fy}>
                FY 20{fy}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      }
    >
      <div className="space-y-6">
        {showDemoUpgradePrompt && (
          <div className="rounded-2xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-4 dark:border-orange-900/50 dark:from-orange-950/35 dark:to-amber-950/25">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-700 dark:text-orange-300">
                  Interactive demo active
                </p>
                <p className="mt-1 text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                  Complete 3 core actions, then move to your real business workspace.
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => trackDemoAction("Opened proposal flow")}>
                Logged proposal flow
              </Button>
              <Button size="sm" variant="outline" onClick={() => trackDemoAction("Opened tax overview")}>
                Logged tax review
              </Button>
              <Button size="sm" variant="outline" onClick={() => trackDemoAction("Opened invoice actions")}>
                Logged invoice action
              </Button>
            </div>
            {showDemoConversionCta ? (
              <StartWithRealBusinessCTA
                demoTemplate={searchParams.get("demoTemplate") ?? "dm_agency"}
                actionCount={demoActionCount}
              />
            ) : (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                Complete 3 demo actions to unlock a guided &quot;Start with my real business&quot; path.
              </p>
            )}
          </div>
        )}

        {showFirstLook && (
          <>
            {!onboardingPersona ? <PersonaPicker /> : null}
            <FirstLookWelcome companyName={orgName} persona={onboardingPersona} />
          </>
        )}
        {/* 2.3 FIX — Getting Started checklist: shows for brand-new workspaces with zero activity */}
        {showGettingStarted && (
          <div className="relative rounded-2xl border border-orange-200 dark:border-orange-800/50 bg-gradient-to-br from-orange-50 to-white dark:from-orange-950/30 dark:to-zinc-900/60 p-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
            <button
              type="button"
              onClick={dismissGettingStarted}
              className="absolute top-3 right-3 p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              aria-label="Dismiss getting started guide"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-orange-500" />
              <p className={`${ty.labelUpperStrong} text-orange-700 dark:text-orange-400`}>
                {tr("getting_started_title", "Get started — 3 steps to your first invoice")}
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {[
                {
                  icon: <Users className="w-4 h-4" />,
                  label: tr("step_add_client", "Add a client"),
                  desc: tr("step_add_client_desc", "Who will you bill?"),
                  href: "/clients",
                  color: "orange",
                },
                {
                  icon: <Briefcase className="w-4 h-4" />,
                  label: tr("step_add_service", "Add a service"),
                  desc: tr("step_add_service_desc", "What will you charge for?"),
                  href: "/shop",
                  color: "amber",
                },
                {
                  icon: <ReceiptText className="w-4 h-4" />,
                  label: tr("step_create_invoice", "Create your first invoice"),
                  desc: tr("step_create_invoice_desc", "Generate and send a PDF invoice."),
                  href: "/income",
                  color: "emerald",
                },
              ].map((step, i) => {
                const stepIconClass =
                  step.color === "emerald"
                    ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                    : step.color === "amber"
                      ? "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"
                      : "bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400";
                return (
                <Link
                  key={i}
                  href={step.href}
                  className="flex items-start gap-3 p-3.5 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/60 hover:border-orange-200 dark:hover:border-orange-700/50 hover:shadow-md transition-all group"
                >
                  <div className={`p-2 rounded-lg shrink-0 group-hover:scale-110 transition-transform ${stepIconClass}`}>
                    {step.icon}
                  </div>
                  <div className="min-w-0">
                    <p className={`${ty.cardTitle} leading-tight`}>{step.label}</p>
                    <p className={`${ty.helperXs} mt-0.5`}>{step.desc}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 shrink-0 mt-1 group-hover:text-orange-500 group-hover:translate-x-0.5 transition-all ml-auto" />
                </Link>
                );
              })}
            </div>
          </div>
        )}

        {!d.health ? (
          <SkeletonBlock className="h-12 w-full" />
        ) : (
          <DashboardHealthStrip health={d.health} onOpenSetupDetails={() => setSetupDetailsOpen(true)} />
        )}

        {!d.attention ? (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonBlock key={i} className="h-24" />
            ))}
          </div>
        ) : (
          <DashboardAttentionCenter attention={d.attention} />
        )}

        {!d.financialPulse ? <SkeletonBlock className="h-32" /> : <DashboardFinancialPulse financialPulse={d.financialPulse} fCurrency={fCurrency} />}

        <GuidedFlowsHub />

        <DashboardCashFlowSummary onModuleEnabled={handleModuleEnabled} />

        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
          <div className="lg:col-span-1 2xl:col-span-2 space-y-6">
            {!d.salesAndShop ? (
              <SkeletonBlock className="h-64" />
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={!permissionFlags.canViewSales ? lockOverlayClassName : undefined}
                      aria-disabled={!permissionFlags.canViewSales}
                    >
                      <DashboardSalesAndShopPanel salesAndShop={d.salesAndShop} fCurrency={fCurrency} enabledModules={enabledModulesSet} onModuleEnabled={handleModuleEnabled} />
                    </div>
                  </TooltipTrigger>
                  {!permissionFlags.canViewSales ? (
                    <TooltipContent>{moduleLockTooltip}</TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            )}

            {!d.operations ? (
              <SkeletonBlock className="h-48" />
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={!permissionFlags.canViewOperations ? lockOverlayClassName : undefined}
                      aria-disabled={!permissionFlags.canViewOperations}
                    >
                      <DashboardOperationsPanel operations={d.operations} enabledModules={enabledModulesSet} onModuleEnabled={handleModuleEnabled} />
                    </div>
                  </TooltipTrigger>
                  {!permissionFlags.canViewOperations ? (
                    <TooltipContent>{moduleLockTooltip}</TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            )}

            {!d.trust ? (
              <SkeletonBlock className="h-48" />
            ) : (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={!permissionFlags.canViewTrust ? lockOverlayClassName : undefined}
                      aria-disabled={!permissionFlags.canViewTrust}
                    >
                      <DashboardTrustPanel trust={d.trust} enabledModules={enabledModulesSet} onModuleEnabled={handleModuleEnabled} />
                    </div>
                  </TooltipTrigger>
                  {!permissionFlags.canViewTrust ? (
                    <TooltipContent>{moduleLockTooltip}</TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            )}

            {!d.charts ? (
              <SkeletonBlock className="h-80" />
            ) : islandsEnabled ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={!permissionFlags.canViewCharts ? lockOverlayClassName : undefined}
                      aria-disabled={!permissionFlags.canViewCharts}
                    >
                      <ChartsIsland charts={d.charts} fCurrency={fCurrency} />
                    </div>
                  </TooltipTrigger>
                  {!permissionFlags.canViewCharts ? (
                    <TooltipContent>{moduleLockTooltip}</TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            ) : (
              <Card className="p-5 border-zinc-200 dark:border-zinc-800">
                <CardTitle className={ty.sectionTitle}>
                  {tr("charts_disabled_title", "Charts are in fallback mode")}
                </CardTitle>
                <p className={`mt-2 ${ty.helper}`}>
                  {tr("charts_disabled_desc", "Runtime flag disabled dashboard islands. Financial and operational values remain available above.")}
                </p>
              </Card>
            )}
          </div>

          {!d.health || !d.attention ? (
            <SkeletonBlock className="h-[600px]" />
          ) : (
            <DashboardRightRail
              data={d}
              fCurrency={fCurrency}
              onRefreshSyncImportHealth={handleRefreshSyncImportHealth}
              syncImportHealthLoading={syncHealthLoading}
              syncImportHealthError={syncHealthError}
            />
          )}
        </div>

        <Card className="border-0 shadow-xl shadow-zinc-200/20 dark:shadow-black/20 ring-1 ring-zinc-200 dark:ring-zinc-800/60 bg-white dark:bg-zinc-900/50 overflow-hidden">
          <CardHeader className="border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/70 dark:bg-zinc-900/80 px-6 py-4 flex flex-row items-center justify-between relative overflow-hidden">
            <div className="space-y-0.5 relative z-10">
              <CardTitle className={ty.sectionTitle}>{tr("recent_ledger", "Recent ledger activity")}</CardTitle>
              <p className={ty.labelUpper}>{tr("recent_ledger_subtitle", "Your most recent billing and payment operations")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`bg-white dark:bg-zinc-950 text-zinc-400 border-zinc-200/60 dark:border-zinc-800/60 ${ty.kpiBadge}`}>
                Live Feed
              </Badge>
            </div>
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-orange-500" />
          </CardHeader>
          <CardContent className={isMobile ? "p-4 space-y-3" : "p-0"}>
            {!d.recentInvoices ? (
              <div className="p-8 space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 w-full rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
                ))}
              </div>
            ) : isMobile ? (
              d.recentInvoices.length === 0 ? (
                <p className={ty.helper}>{tr("no_recent_ledger", "No recent invoices")}</p>
              ) : (
                d.recentInvoices.slice(0, 5).map((invoice) => (
                  <div key={invoice.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 p-4 bg-white dark:bg-zinc-900/40 shadow-sm space-y-3 relative group">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className={ty.cardTitle}>{invoice.invoiceNumber}</p>
                        <p className={`${ty.labelUpper} mt-0.5`}>{invoice.clientName}</p>
                      </div>
                      <div className="text-right">
                        <p className={ty.valueSmBold}>{fCurrency(invoice.totalAmount)}</p>
                        <div className="mt-1">
                          <Badge variant="outline" className={`border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 ${ty.kpiBadge}`}>
                            {tr(getInvoiceStatusBadgeKey(toInvoiceStatus(invoice.status)), toInvoiceStatus(invoice.status))}
                          </Badge>
                        </div>
                        {toInvoiceStatus(invoice.status) === INVOICE_STATUS.PAID ? (
                          <Badge className="mt-2 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-[0.16em]">
                            PAID
                          </Badge>
                        ) : null}
                      </div>
                    </div>
                    <div className="pt-2.5 border-t border-zinc-100 dark:border-zinc-800/50">
                      <TableActions invoice={invoice} t={tr} onOpenPayModal={openPayModal} onResendEmail={handleResendEmail} resending={resendingId === invoice.id} />
                    </div>
                  </div>
                ))
              )
            ) : (
              <DataTable
                columns={columns}
                data={d.recentInvoices}
                rowId={(row) => row.id}
                emptyTitle={tr("no_recent_ledger", "No recent invoices")}
                emptyDescription={tr("recent_ledger_desc", "Recent billing activity will appear here.")}
                className="[&_table]:border-0 [&_thead]:bg-zinc-50/50 dark:[&_thead]:bg-zinc-900/30"
              />
            )}
          </CardContent>
        </Card>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ y: -2 }}
          className="group relative flex flex-col sm:flex-row items-center justify-between gap-4 p-3 px-5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-900/30 backdrop-blur-sm transition-all hover:shadow-lg hover:shadow-orange-500/5 hover:border-orange-500/20"
        >
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 p-2 rounded-xl bg-orange-50 dark:bg-orange-500/10 text-orange-500 dark:text-orange-400 group-hover:scale-110 transition-transform duration-300">
              <Building className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <p className={`${ty.cardTitle} font-bold leading-tight`}>
                {orgName ?? "Organisation"}
              </p>
              <p className={`${ty.helperXs} font-medium`}>
                Premium Enterprise Workspace
              </p>
            </div>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className={`flex-shrink-0 h-8 text-orange-600 dark:text-orange-400 hover:bg-orange-100/50 dark:hover:bg-orange-500/20 gap-2 border border-transparent hover:border-orange-100 dark:hover:border-orange-500/30 ${ty.labelUpperStrong}`}
          >
            <Link href="/settings/profile" className="flex items-center gap-2">
              User Session Settings
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>

          <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-full bg-orange-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
        </motion.div>
      </div>

      <PaymentModalIsland
        open={payModalOpen}
        onOpenChange={setPayModalOpen}
        onSubmit={handleMarkPaid}
        t={tr}
        currency={currency}
        currencySymbol={currencySymbol}
        amountReceived={amountReceived}
        setAmountReceived={setAmountReceived}
        dateReceived={dateReceived}
        setDateReceived={setDateReceived}
        isSubmittingPayment={isSubmittingPayment}
        selectedInvoice={selectedInvoice}
        selectedInvoiceBilled={selectedInvoiceBilled}
        selectedInvoiceReceived={selectedInvoiceReceived}
        selectedInvoiceRemaining={selectedInvoiceRemaining}
        fCurrency={fCurrency}
      />

      <Dialog open={setupDetailsOpen} onOpenChange={setSetupDetailsOpen}>
        <DialogContent className="max-w-2xl border-zinc-200 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="text-foreground">
              {tr("setup_dialog_title", "Complete your workspace setup")}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {pendingSetupChecklist.length > 0
                ? tr(
                    "setup_dialog_desc_pending",
                    "Here is exactly what is still missing and where to configure it.",
                  )
                : tr(
                    "setup_dialog_desc_done",
                    "Great news. Your setup is complete and all core workspace prerequisites are configured.",
                  )}
            </DialogDescription>
          </DialogHeader>

          {pendingSetupChecklist.length === 0 ? (
            <div className="rounded-xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/60 dark:bg-emerald-950/20 p-4 text-emerald-700 dark:text-emerald-300 text-sm flex items-start gap-2">
              <ShieldCheck className="h-4 w-4 mt-0.5" />
              {tr("setup_dialog_done_note", "Nothing is missing. Your workspace is fully configured.")}
            </div>
          ) : (
            <div className="space-y-3">
              {pendingSetupChecklist.map((item) => (
                <div key={item.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900/30">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{item.description}</p>
                    </div>
                    <CircleAlert className="h-4 w-4 text-amber-500 mt-0.5" />
                  </div>
                  <Button asChild size="sm" variant="outline" className="mt-3">
                    <Link href={item.href} onClick={() => setSetupDetailsOpen(false)}>
                      {tr("setup_fix_now", "Fix now")}
                      <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </DashboardPageShell>
  );
}
