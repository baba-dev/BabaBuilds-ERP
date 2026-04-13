"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { AlertCircle, Download, LayoutDashboard, Send } from "lucide-react";
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
import { PageEmptyState } from "@/components/states/PageEmptyState";
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
import { DashboardActivityFeed } from "./dashboard-activity-feed";
import { DashboardQuickActions } from "./dashboard-quick-actions";
import type { DashboardData, RecentInvoiceRow } from "./types";

export default function Dashboard() {
  const t = useTranslations("Dashboard");
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedFy, setSelectedFy] = useState(getCurrentFinancialYear(new Date(), "local"));
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [islandsEnabled, setIslandsEnabled] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<RecentInvoiceRow | null>(null);
  const [amountReceived, setAmountReceived] = useState("0");
  const [dateReceived, setDateReceived] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  const { fCurrency, currency } = useFormat();
  const currencySymbol = getCurrencySymbol(currency);
  const tr = (key: string, fallback: string, values?: any) => {
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
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
    loadFlags().catch(() => undefined);
  }, []);

  const loadData = async (fy: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard?fy=${fy}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || tr("toast.error.load_dashboard", "Unable to load dashboard"));
      }
      const parsed = parseDashboardResponse(json) as DashboardData | null;
      if (!parsed) throw new Error("Dashboard payload malformed");
      setData(parsed);
    } catch (e: any) {
      setError(e?.message ?? "Unable to load dashboard");
      toast.error(tr("toast.error.load_dashboard_refresh", "Failed to load dashboard"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedFy);
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
      loadData(selectedFy);
    } catch {
      toast.error(tr("toast.error.log_payment", "Unable to log payment"));
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const fyOptions = Array.from({ length: 4 }).map((_, idx) => {
    const year = new Date().getFullYear() - 2 + idx;
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
          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 font-medium uppercase tracking-tighter sm:hidden">
            {format(new Date(row.invoiceDate), "dd MMM yyyy")}
          </span>
        </div>
      )
    },
    { 
      id: "client", 
      header: tr("table_client", "Client"), 
      accessor: (row) => row.clientName, 
      cell: (row) => <span className="text-zinc-600 dark:text-zinc-300 font-medium">{row.clientName}</span> 
    },
    { 
      id: "date", 
      header: tr("table_date", "Date"), 
      cell: (row) => <span className="text-zinc-400 dark:text-zinc-500 text-xs tabular-nums">{format(new Date(row.invoiceDate), "dd MMM yyyy")}</span> 
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
        return <Badge variant="outline" className={`h-5 text-[10px] font-bold uppercase tracking-wider ${className}`}>{tr(key, status)}</Badge>;
      },
    },
    { 
      id: "amount", 
      header: <div className="text-right pr-2">{tr("table_amount", "Amount")}</div>, 
      className: "text-right", 
      cell: (row) => <span className="font-bold text-zinc-900 dark:text-zinc-100 tabular-nums pr-2">{fCurrency(row.totalAmount)}</span> 
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
              <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px] font-semibold uppercase tracking-wider bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800" onClick={() => openPayModal(row)}>
                {tr("record_payment", "Record payment")}
              </Button>
            )}
            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400" onClick={() => handleResendEmail(row)} disabled={resendingId === row.id}><Send className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7 text-zinc-400" asChild><a href={getBustedUrl(row.pdfPath, row.updatedAt)} target="_blank" rel="noreferrer"><Download className="w-3.5 h-3.5" /></a></Button>
          </div>
        ),
    },
  ];

  if (loading) return <PageLoadingState title={tr("loading", "Loading dashboard")} description={tr("loading_desc", "Preparing command center")} className="min-h-screen" />;
  if (error && !data) return <PageErrorState title={tr("sync_issue_title", "Dashboard unavailable")} description={error} className="min-h-screen" onRetry={() => loadData(selectedFy)} />;
  if (!data) return <PageEmptyState title={tr("empty_title", "No dashboard data")} description={tr("empty_desc", "Start by creating invoices, proposals, or service orders.")} className="min-h-screen" />;

  const selectedInvoiceBilled = Number(selectedInvoice?.totalAmount ?? 0);
  const selectedInvoiceReceived = Number(selectedInvoice?.amountReceived ?? 0);
  const selectedInvoiceRemaining = Math.max(0, selectedInvoiceBilled - selectedInvoiceReceived);

  return (
    <DashboardPageShell
      title={tr("financial_overview", "Business command center")}
      description={tr("global_command_center", "Finance, compliance, shop, and operations in one decisive view.", { countryCode: data.countryCode })}
      icon={<LayoutDashboard className="w-5 h-5 text-indigo-500" />}
      secondaryActions={
        <Select value={selectedFy} onValueChange={setSelectedFy}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>{fyOptions.map((fy) => <SelectItem key={fy} value={fy}>FY 20{fy}</SelectItem>)}</SelectContent>
        </Select>
      }
    >
      <div className="space-y-6">
        <DashboardHealthStrip health={data.health} />
        <DashboardAttentionCenter attention={data.attention} />
        <DashboardFinancialPulse financialPulse={data.financialPulse} fCurrency={fCurrency} />

        <div className="grid grid-cols-1 2xl:grid-cols-3 gap-6">
          <div className="2xl:col-span-2 space-y-6">
            <DashboardSalesAndShopPanel salesAndShop={data.salesAndShop} fCurrency={fCurrency} />
            <DashboardOperationsPanel operations={data.operations} />
            <DashboardTrustPanel trust={data.trust} />
            {islandsEnabled ? (
              <ChartsIsland charts={data.charts} fCurrency={fCurrency} />
            ) : (
              <Card className="p-5 border-zinc-200 dark:border-zinc-800">
                <CardTitle className="text-base">{tr("charts_disabled_title", "Charts are in fallback mode")}</CardTitle>
                <p className="text-sm text-zinc-500 mt-2">
                  {tr("charts_disabled_desc", "Runtime flag disabled dashboard islands. Financial and operational values remain available above.")}
                </p>
              </Card>
            )}
          </div>
          <div className="space-y-6">
            <DashboardQuickActions />
            <DashboardActivityFeed activity={data.activity} />
          </div>
        </div>

        <Card className="border-0 shadow-xl shadow-zinc-200/20 dark:shadow-black/20 ring-1 ring-zinc-200 dark:ring-zinc-800/60 bg-white dark:bg-zinc-900/50 overflow-hidden">
          <CardHeader className="border-b border-zinc-100 dark:border-zinc-800/50 bg-zinc-50/70 dark:bg-zinc-900/80 px-6 py-4 flex flex-row items-center justify-between relative overflow-hidden">
            <div className="space-y-0.5 relative z-10">
              <CardTitle className="text-sm font-bold tracking-tight text-zinc-900 dark:text-zinc-100 uppercase">{tr("recent_ledger", "Recent ledger activity")}</CardTitle>
              <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{tr("recent_ledger_subtitle", "Your most recent billing and payment operations")}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-white dark:bg-zinc-950 text-[10px] font-bold text-zinc-400 border-zinc-200/60 dark:border-zinc-800/60 uppercase">Live Feed</Badge>
            </div>
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-indigo-500" />
          </CardHeader>
          <CardContent className={isMobile ? "p-4 space-y-3" : "p-0"}>
            {isMobile ? (
              data.recentInvoices.length === 0 ? (
                <p className="text-sm text-zinc-500">{tr("no_recent_ledger", "No recent invoices")}</p>
              ) : (
                data.recentInvoices.slice(0, 5).map((invoice) => (
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
                data={data.recentInvoices} 
                rowId={(row) => row.id} 
                emptyTitle={tr("no_recent_ledger", "No recent invoices")} 
                emptyDescription={tr("recent_ledger_desc", "Recent billing activity will appear here.")} 
                className="[&_table]:border-0 [&_thead]:bg-zinc-50/50 dark:[&_thead]:bg-zinc-900/30" 
              />
            )}
          </CardContent>
        </Card>

        <Card className="p-4 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60">
          <p className="text-sm text-zinc-600 inline-flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {tr("mobile_focus_note", "Mobile/PWA focus: urgent actions and health are intentionally above charts for faster launch scanning.")}</p>
          <Button asChild variant="link" className="px-0 mt-1"><Link href="/settings">{tr("review_notifications", "Review notifications")}</Link></Button>
        </Card>
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
