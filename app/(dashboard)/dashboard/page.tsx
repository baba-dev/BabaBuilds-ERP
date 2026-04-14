"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Download, LayoutDashboard, Send, Sparkles, ArrowRight, Users, Briefcase, ReceiptText, X, Building } from "lucide-react";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import { DashboardSalesAndShopPanel } from "./dashboard-sales-shop-panel";
import { DashboardOperationsPanel } from "./dashboard-operations-panel";
import { DashboardTrustPanel } from "./dashboard-trust-panel";
import { DashboardRightRail } from "./dashboard-right-rail";
import type { DashboardData, RecentInvoiceRow } from "./types";

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

  const { fCurrency, currency } = useFormat();
  const currencySymbol = getCurrencySymbol(currency);

  const tr = (key: string, fallback: string, values?: Record<string, any>) => {
    if (typeof (t as any).has === "function" && !(t as any).has(key)) return fallback;
    try {
      const translation = t(key as any, values);
      if (translation === key || translation === `Dashboard.${key}`) return fallback;
      return translation;
    } catch {
      return fallback;
    }
  };

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
          <span className="font-bold text-zinc-900 dark:text-zinc-100 leading-tight">{row.invoiceNumber}</span>
          <span className="text-xxs text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-tighter sm:hidden">
            {format(new Date(row.invoiceDate), "dd MMM yyyy")}
          </span>
        </div>
      ),
    },
    {
      id: "client",
      header: tr("table_client", "Client"),
      accessor: (row) => row.clientName,
      cell: (row) => <span className="text-zinc-600 dark:text-zinc-300 font-medium">{row.clientName}</span>,
    },
    {
      id: "date",
      header: tr("table_date", "Date"),
      cell: (row) => <span className="text-zinc-400 dark:text-zinc-500 text-xs tabular-nums">{format(new Date(row.invoiceDate), "dd MMM yyyy")}</span>,
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
              ? "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20"
              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
        return <Badge variant="outline" className={`h-5 text-xxs font-bold uppercase tracking-wider ${className}`}>{tr(key, status)}</Badge>;
      },
    },
    {
      id: "amount",
      header: <div className="text-right pr-2">{tr("table_amount", "Amount")}</div>,
      className: "text-right",
      cell: (row) => <span className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums pr-2">{fCurrency(row.totalAmount)}</span>,
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
                className="h-7 px-2.5 text-xxs font-semibold uppercase tracking-wider bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800"
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

  if (isInitialLoad) {
    return <PageLoadingState title={tr("loading", "Loading dashboard")} description={tr("loading_desc", "Preparing command center")} className="min-h-screen" />;
  }

  if (error && Object.keys(data).length === 0) {
    return <PageErrorState title={tr("sync_issue_title", "Dashboard unavailable")} description={error} className="min-h-screen" onRetry={() => loadAllData(selectedFy)} />;
  }

  const d = data as DashboardData;
  const isReady = Boolean(
    d.health &&
      d.attention &&
      d.financialPulse &&
      d.salesAndShop &&
      d.operations &&
      d.trust &&
      d.charts &&
      d.recentInvoices,
  );

  const selectedInvoiceBilled = Number(selectedInvoice?.totalAmount ?? 0);
  const selectedInvoiceReceived = Number(selectedInvoice?.amountReceived ?? 0);
  const selectedInvoiceRemaining = Math.max(0, selectedInvoiceBilled - selectedInvoiceReceived);

  const SkeletonBlock = ({ className }: { className?: string }) => (
    <div className={`rounded-2xl bg-zinc-100 dark:bg-zinc-800 animate-pulse ${className}`} />
  );

  // 2.3 FIX: show a getting-started checklist for new workspaces (zero revenue = fresh account)
  const showGettingStarted =
    !gettingStartedDismissed &&
    !isInitialLoad &&
    (d.financialPulse?.billedRevenue ?? 1) === 0 &&
    (d.recentInvoices?.length ?? 1) === 0;

  const dismissGettingStarted = () => {
    localStorage.setItem("erp_getting_started_dismissed", "1");
    setGettingStartedDismissed(true);
  };

  return (
    <DashboardPageShell
      title={tr("financial_overview", "Business command center")}
      description={tr("global_command_center", "Finance, compliance, shop, and operations in one decisive view.", { countryCode: data.countryCode })}
      icon={<LayoutDashboard className="w-5 h-5 text-indigo-500" />}
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
        {/* 2.3 FIX — Getting Started checklist: shows for brand-new workspaces with zero activity */}
        {showGettingStarted && (
          <div className="relative rounded-2xl border border-indigo-200 dark:border-indigo-800/50 bg-gradient-to-br from-indigo-50 to-white dark:from-indigo-950/30 dark:to-zinc-900/60 p-5 shadow-sm animate-in fade-in slide-in-from-top-2 duration-500">
            <button
              type="button"
              onClick={dismissGettingStarted}
              className="absolute top-3 right-3 p-1 rounded-lg text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
              aria-label="Dismiss getting started guide"
            >
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-2 mb-4">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <p className="text-xs font-extrabold uppercase tracking-widest text-indigo-700 dark:text-indigo-400">
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
                  color: "indigo",
                },
                {
                  icon: <Briefcase className="w-4 h-4" />,
                  label: tr("step_add_service", "Add a service"),
                  desc: tr("step_add_service_desc", "What will you charge for?"),
                  href: "/services",
                  color: "violet",
                },
                {
                  icon: <ReceiptText className="w-4 h-4" />,
                  label: tr("step_create_invoice", "Create your first invoice"),
                  desc: tr("step_create_invoice_desc", "Generate and send a PDF invoice."),
                  href: "/income",
                  color: "emerald",
                },
              ].map((step, i) => (
                <Link
                  key={i}
                  href={step.href}
                  className="flex items-start gap-3 p-3.5 rounded-xl bg-white dark:bg-zinc-900/60 border border-zinc-100 dark:border-zinc-800/60 hover:border-indigo-200 dark:hover:border-indigo-700/50 hover:shadow-md transition-all group"
                >
                  <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 shrink-0 group-hover:scale-110 transition-transform">
                    {step.icon}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-zinc-800 dark:text-zinc-200 leading-tight">{step.label}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 font-medium">{step.desc}</p>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 text-zinc-300 dark:text-zinc-600 shrink-0 mt-1 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all ml-auto" />
                </Link>
              ))}
            </div>
          </div>
        )}

        {!d.health ? <SkeletonBlock className="h-12 w-full" /> : <DashboardHealthStrip health={d.health} />}

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

        <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-6">
          <div className="lg:col-span-1 2xl:col-span-2 space-y-6">
            {!d.salesAndShop ? <SkeletonBlock className="h-64" /> : <DashboardSalesAndShopPanel salesAndShop={d.salesAndShop} fCurrency={fCurrency} />}

            {!d.operations ? <SkeletonBlock className="h-48" /> : <DashboardOperationsPanel operations={d.operations} />}

            {!d.trust ? <SkeletonBlock className="h-48" /> : <DashboardTrustPanel trust={d.trust} />}

            {!d.charts ? (
              <SkeletonBlock className="h-80" />
            ) : islandsEnabled ? (
              <ChartsIsland charts={d.charts} fCurrency={fCurrency} />
            ) : (
              <Card className="p-5 border-zinc-200 dark:border-zinc-800">
                <CardTitle className="text-base">{tr("charts_disabled_title", "Charts are in fallback mode")}</CardTitle>
                <p className="text-sm text-zinc-500 mt-2">
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
              <CardTitle className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">{tr("recent_ledger", "Recent ledger activity")}</CardTitle>
              <p className="text-xxs font-medium text-zinc-400 dark:text-zinc-500">{tr("recent_ledger_subtitle", "Your most recent billing and payment operations")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-white dark:bg-zinc-950 text-[10px] font-bold text-zinc-400 border-zinc-200/60 dark:border-zinc-800/60 uppercase">
                Live Feed
              </Badge>
            </div>
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
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
                <p className="text-sm text-zinc-500">{tr("no_recent_ledger", "No recent invoices")}</p>
              ) : (
                d.recentInvoices.slice(0, 5).map((invoice) => (
                  <div key={invoice.id} className="rounded-xl border border-zinc-200 dark:border-zinc-800/80 p-4 bg-white dark:bg-zinc-900/40 shadow-sm space-y-3 relative group">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{invoice.invoiceNumber}</p>
                        <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mt-0.5">{invoice.clientName}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold tabular-nums text-zinc-900 dark:text-zinc-100">{fCurrency(invoice.totalAmount)}</p>
                        <div className="mt-1">
                          <Badge variant="outline" className="text-[10px] uppercase h-5 font-bold tracking-wider border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50">
                            {tr(getInvoiceStatusBadgeKey(toInvoiceStatus(invoice.status)), toInvoiceStatus(invoice.status))}
                          </Badge>
                        </div>
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
          className="group relative flex flex-col sm:flex-row items-center justify-between gap-4 p-3 px-5 rounded-2xl border border-zinc-200/50 dark:border-zinc-800/50 bg-white/50 dark:bg-zinc-900/30 backdrop-blur-sm transition-all hover:shadow-lg hover:shadow-indigo-500/5 hover:border-indigo-500/20"
        >
          <div className="flex items-center gap-3">
            <div className="flex-shrink-0 p-2 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-500 dark:text-indigo-400 group-hover:scale-110 transition-transform duration-300">
              <Building className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
                {orgName ?? "Organisation"}
              </p>
              <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                Premium Enterprise Workspace
              </p>
            </div>
          </div>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="flex-shrink-0 h-8 text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/50 dark:hover:bg-indigo-500/20 gap-2 border border-transparent hover:border-indigo-100 dark:hover:border-indigo-500/30"
          >
            <Link href="https://erp.bababuilds.com/settings/profile" className="flex items-center gap-2">
              User Session Settings
              <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>

          <div className="absolute left-0 top-1/4 bottom-1/4 w-0.5 rounded-full bg-indigo-500/50 opacity-0 group-hover:opacity-100 transition-opacity" />
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
    </DashboardPageShell>
  );
}