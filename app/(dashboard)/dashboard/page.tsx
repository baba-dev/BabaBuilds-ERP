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
  const tr = (key: string, fallback: string) => {
    try {
      return t(key as any);
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
    { id: "invoice", header: tr("table_invoice", "Invoice"), accessor: (row) => row.invoiceNumber, cell: (row) => row.invoiceNumber },
    { id: "client", header: tr("table_client", "Client"), accessor: (row) => row.clientName, cell: (row) => row.clientName },
    { id: "date", header: tr("table_date", "Date"), cell: (row) => format(new Date(row.invoiceDate), "dd MMM yyyy") },
    {
      id: "status",
      header: tr("table_status", "Status"),
      cell: (row) => {
        const status = toInvoiceStatus(row.status);
        const key = getInvoiceStatusBadgeKey(status);
        const className =
          status === INVOICE_STATUS.PAID
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/60"
            : status === INVOICE_STATUS.PARTIALLY_PAID
              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60";
        return <Badge className={className}>{tr(key, status)}</Badge>;
      },
    },
    { id: "amount", header: <div className="text-right">{tr("table_billed", "Amount")} ({currency})</div>, className: "text-right", cell: (row) => fCurrency(row.totalAmount) },
    {
      id: "actions",
      header: <div className="text-right">{tr("table_actions", "Actions")}</div>,
      className: "text-right",
      cell: (row) =>
        islandsEnabled ? (
          <TableActions invoice={row} t={tr} onOpenPayModal={openPayModal} onResendEmail={handleResendEmail} resending={resendingId === row.id} />
        ) : (
          <div className="flex items-center justify-end gap-2">
            {!isPaidInvoiceStatus(row.status) && <Button size="sm" variant="outline" onClick={() => openPayModal(row)}>Mark paid</Button>}
            <Button size="icon" variant="outline" onClick={() => handleResendEmail(row)} disabled={resendingId === row.id}><Send className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="secondary" asChild><a href={getBustedUrl(row.pdfPath, row.updatedAt)} target="_blank" rel="noreferrer"><Download className="w-3.5 h-3.5" /></a></Button>
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
      description={tr("global_command_center", "Finance, compliance, shop, and operations in one decisive view.")}
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
            <ChartsIsland charts={data.charts} fCurrency={fCurrency} />
          </div>
          <div className="space-y-6">
            <DashboardQuickActions />
            <DashboardActivityFeed activity={data.activity} />
          </div>
        </div>

        <Card className="border-zinc-200 dark:border-zinc-800">
          <CardHeader>
            <CardTitle className="text-base">{tr("recent_ledger", "Recent invoices")}</CardTitle>
          </CardHeader>
          <CardContent className={isMobile ? "p-4 space-y-2" : "p-0"}>
            {isMobile ? (
              data.recentInvoices.length === 0 ? (
                <p className="text-sm text-zinc-500">{tr("no_recent_ledger", "No recent invoices")}</p>
              ) : (
                data.recentInvoices.slice(0, 5).map((invoice) => (
                  <div key={invoice.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 p-3">
                    <p className="text-sm font-semibold">{invoice.invoiceNumber}</p>
                    <p className="text-xs text-zinc-500">{invoice.clientName}</p>
                    <p className="text-xs mt-1">{fCurrency(invoice.totalAmount)}</p>
                    <div className="mt-2">
                      <TableActions invoice={invoice} t={tr} onOpenPayModal={openPayModal} onResendEmail={handleResendEmail} resending={resendingId === invoice.id} />
                    </div>
                  </div>
                ))
              )
            ) : (
              <DataTable columns={columns} data={data.recentInvoices} rowId={(row) => row.id} emptyTitle={tr("no_recent_ledger", "No recent invoices")} emptyDescription={tr("recent_ledger_desc", "Recent billing activity will appear here.")} />
            )}
          </CardContent>
        </Card>

        <Card className="p-4 border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60">
          <p className="text-sm text-zinc-600 inline-flex items-center gap-1"><AlertCircle className="w-4 h-4" /> Mobile/PWA focus: urgent actions and health are intentionally above charts for faster launch scanning.</p>
          <Button asChild variant="link" className="px-0 mt-1"><Link href="/notifications">Review notifications</Link></Button>
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
