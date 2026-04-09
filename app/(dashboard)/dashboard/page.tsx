"use client";

import { useState, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { animate, useMotionValue } from "framer-motion";
import {
  TrendingUp, Landmark, FileText, Users, Calculator, AlertTriangle,
  ArrowUpRight, Sparkles, Activity, CheckCircle2, AlertCircle, ShieldAlert,
  ArrowRight, Link as LinkIcon, Mail, Banknote, Send, Download, Info
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { TooltipProvider, Tooltip as UiTooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { getBustedUrl } from "@/lib/cache-buster";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { PageLoadingState } from "@/components/states/PageLoadingState";
import { PageErrorState } from "@/components/states/PageErrorState";
import { PageEmptyState } from "@/components/states/PageEmptyState";
import { ChartCard } from "@/components/charts/ChartCard";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { ChartLegend } from "@/components/charts/ChartLegend";
import { withChartTokenColors } from "@/components/charts/chart-colors";
import { DataTable, type DataTableColumnDef } from "@/components/data-table";
import { getInvoiceStatusBadgeKey, INVOICE_STATUS, isPaidInvoiceStatus, toInvoiceStatus } from "@/lib/invoice-status";
import { parseDashboardResponse } from "./parse-dashboard-response";
import { getCurrentFinancialYear } from "@/lib/financial-year";



function AnimatedValue({
  value,
  formatter,
  className,
}: {
  value: number;
  formatter: (value: number) => string;
  className?: string;
}) {
  const motionValue = useMotionValue(value);
  const [displayValue, setDisplayValue] = useState(value);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration: 0.75,
      ease: "easeOut",
      onUpdate: (latest) => setDisplayValue(latest),
    });
    return () => controls.stop();
  }, [motionValue, value]);

  return <span className={className}>{formatter(displayValue)}</span>;
}

type RecentInvoiceRow = {
  id: string;
  invoiceDate: string | Date;
  invoiceNumber: string;
  clientName: string;
  billingMonth?: string | null;
  status: string;
  totalAmount: number;
  amountReceived?: number | null;
  pdfPath: string;
  updatedAt?: string | Date | null;
};

type IntegrationStatus = "healthy" | "partial" | "missing";

type DashboardData = {
  kpis: {
    totalRevenue: number;
    totalWealth: number;
    estimatedTax: number;
    activeClients: number;
  };
  mrr: {
    total: number;
    retainers: Array<{
      clientName: string;
      serviceName: string;
      amount: number;
      health: "good" | "warning" | "danger" | "pending";
    }>;
  };
  charts: {
    revenue: Array<{ name: string; revenue: number }>;
    wealth: Array<{ name: string; value: number; color: string }>;
  };
  readiness?: {
    integrations: Record<"groq" | "payment" | "smtp", { configured: boolean; status: IntegrationStatus }>;
    summary: Record<IntegrationStatus, number>;
  };
  recentInvoices: RecentInvoiceRow[];
};

const statusStyles: Record<IntegrationStatus, string> = {
  healthy: "bg-emerald-500 dark:bg-emerald-400 shadow-emerald-500/40 dark:shadow-emerald-400/40",
  partial: "bg-amber-500 dark:bg-amber-400 shadow-amber-500/40 dark:shadow-amber-400/40",
  missing: "bg-rose-500 dark:bg-rose-400 shadow-rose-500/40 dark:shadow-rose-400/40",
};

function StatusDot({ status }: { status: IntegrationStatus }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-2.5 w-2.5 rounded-full shadow-sm motion-safe:animate-pulse motion-reduce:animate-none ${statusStyles[status]}`}
    />
  );
}

export default function Dashboard() {
  const t = useTranslations('Dashboard');
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- FINANCIAL YEAR LOGIC ---
  const [selectedFy, setSelectedFy] = useState(getCurrentFinancialYear(new Date(), 'local'));

  // Generate FY Options for the last 3 years
  const getFyOptions = () => {
    const currentYear = new Date().getFullYear();
    const options = [];
    for (let i = -2; i <= 1; i++) {
      const year = currentYear + i;
      const shortYear = year.toString().slice(-2);
      const nextShortYear = (year + 1).toString().slice(-2);
      options.push(`${shortYear}-${nextShortYear}`);
    }
    return options;
  };

  // --- GLOBALIZATION ENGINE ---
  const {
    fCurrency,
    currency,
    locale,
    dateFormat = "dd/MM/yyyy",
    taxLabel,
    countryCode = "Global"
  } = useFormat();
  const currencySymbol = getCurrencySymbol(currency, locale);
  const safeDateFormat = (dateFormat ?? "dd/MM/yyyy").replace(/D/g, 'd').replace(/Y/g, 'y');

  // --- PAYMENT & LEDGER ACTION STATE ---
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<RecentInvoiceRow | null>(null);
  const [amountReceived, setAmountReceived] = useState("");
  const [dateReceived, setDateReceived] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [resendingId, setResendingId] = useState<string | null>(null);

  useEffect(() => {
    fetchDashboardData(selectedFy);
  }, [selectedFy]);

  const fetchDashboardData = async (fy: string) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/dashboard?fy=${fy}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.error || t("toast.error.load_dashboard"));
      }
      const parsed = parseDashboardResponse(json);
      if (!parsed) {
        throw new Error("Dashboard payload was malformed.");
      }
      setData(parsed as DashboardData);
    } catch (err: any) {
      console.error("Failed to fetch dashboard", err);
      const message = err?.message || t("toast.error.load_dashboard_refresh");
      setFetchError(message);
      toast.error(t("toast.error.load_dashboard_refresh"));
    } finally {
      setIsLoading(false);
    }
  };

  // --- LEDGER ACTIONS ---
  const handleMarkAsPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    setIsSubmittingPayment(true);
    try {
      const res = await fetch(`/api/invoices/${selectedInvoice.id}/pay`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountReceived, dateReceived }),
      });

      if (res.ok) {
        setPayModalOpen(false);
        toast.success(t("toast.success.payment_logged"));
        fetchDashboardData(selectedFy); // Refresh the dashboard data
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || t("toast.error.log_payment"));
      }
    } catch (error) {
      console.error("Payment logging failed");
      toast.error(t("toast.error.network"));
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  const handleResendEmail = async (invoice: RecentInvoiceRow) => {
    setResendingId(invoice.id);
    const toastId = toast.loading(t("toast.loading.send_invoice", { invoiceNumber: invoice.invoiceNumber }));
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/resend`, { method: 'POST' });
      const data = await res.json();

      if (res.ok) {
        toast.success(t("toast.success.email_sent"), { id: toastId });
      } else {
        toast.error(data.error || t("toast.error.send_email"), { id: toastId });
      }
    } catch (error) {
      toast.error(t("toast.error.network"), { id: toastId });
    } finally {
      setResendingId(null);
    }
  };

  const openPayModal = (invoice: RecentInvoiceRow) => {
    const alreadyReceived = Number(invoice.amountReceived ?? 0);
    const remaining = Math.max(0, Number(invoice.totalAmount) - alreadyReceived);
    setSelectedInvoice(invoice);
    setAmountReceived(remaining.toString());
    setPayModalOpen(true);
  };

  const wealthSeries = useMemo(
    () => withChartTokenColors(data?.charts?.wealth || []),
    [data?.charts?.wealth]
  );
  const [isCompactCharts, setIsCompactCharts] = useState(false);


  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const onChange = (event: MediaQueryListEvent) => setIsCompactCharts(event.matches);
    setIsCompactCharts(mediaQuery.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 transition-colors duration-200">
        <PageLoadingState title={t('loading')} description={t("loading_desc")} className="min-h-screen" />
      </div>
    );
  }

  if (fetchError && !data) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 transition-colors duration-200">
        <PageErrorState
          title={t("sync_issue_title")}
          description={fetchError}
          onRetry={() => fetchDashboardData(selectedFy)}
          className="min-h-screen"
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 transition-colors duration-200">
        <PageEmptyState
          title={t("empty_title")}
          description={t("empty_desc")}
          className="min-h-screen"
        />
      </div>
    );
  }

  // Safe Fallbacks
  const kpi = data?.kpis || { totalRevenue: 0, totalWealth: 0, estimatedTax: 0, activeClients: 0 };
  const thresholdValue = countryCode === "IN" ? 2000000 : 10000000;
  const compliancePercentage = Math.min((kpi.totalRevenue / thresholdValue) * 100, 100);

  const mrrTotal = data?.mrr?.total || 0;
  const arrTotal = mrrTotal * 12;
  const activeRetainers = data?.mrr?.retainers || [];
  const recentInvoices: RecentInvoiceRow[] = data?.recentInvoices || [];
  const selectedInvoiceBilled = Number(selectedInvoice?.totalAmount ?? 0);
  const selectedInvoiceReceived = Number(selectedInvoice?.amountReceived ?? 0);
  const selectedInvoiceRemaining = Math.max(0, selectedInvoiceBilled - selectedInvoiceReceived);
  const readinessIntegrations = data?.readiness?.integrations;
  const readinessSummary = data?.readiness?.summary ?? { healthy: 0, partial: 0, missing: 3 };
  const configuredConnections = readinessSummary.healthy;
  const apiReadinessRows = [
    {
      id: "groq" as const,
      label: t("api_status.integrations.groq"),
      status: readinessIntegrations?.groq?.status ?? "missing",
    },
    {
      id: "payment" as const,
      label: t("api_status.integrations.payment"),
      status: readinessIntegrations?.payment?.status ?? "missing",
    },
    {
      id: "smtp" as const,
      label: t("api_status.integrations.smtp"),
      status: readinessIntegrations?.smtp?.status ?? "missing",
    },
  ] as const;
  const apiReadinessHelpText: Record<(typeof apiReadinessRows)[number]["id"], string> = {
    groq: t("api_status.tooltips.groq"),
    payment: t("api_status.tooltips.payment"),
    smtp: t("api_status.tooltips.smtp"),
  };
  const recentInvoiceColumns: DataTableColumnDef<RecentInvoiceRow>[] = [
    {
      id: "date",
      header: t('table_date'),
      sortable: true,
      sortAccessor: (inv) => new Date(inv.invoiceDate || new Date()).getTime(),
      className: "text-zinc-600 dark:text-zinc-400 text-xs font-medium py-5 px-6",
      cell: (inv) => format(new Date(inv.invoiceDate || new Date()), safeDateFormat),
    },
    {
      id: "invoice",
      header: t('table_invoice'),
      accessor: (inv) => inv.invoiceNumber,
      className: "font-bold text-zinc-900 dark:text-zinc-200 text-sm py-5 px-6",
      cell: (inv) => inv.invoiceNumber,
    },
    {
      id: "client",
      header: t('table_client'),
      accessor: (inv) => inv.clientName,
      className: "py-5 px-6",
      cell: (inv) => (
        <>
          <span className="font-bold text-zinc-900 dark:text-zinc-100 text-sm block">{inv.clientName}</span>
          <span className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-wide mt-0.5 block">{inv.billingMonth}</span>
        </>
      ),
    },
    {
      id: "status",
      header: t('table_status'),
      accessor: (inv) => inv.status,
      className: "py-5 px-6",
      cell: (inv) => {
        const canonicalStatus = toInvoiceStatus(inv.status);
        const badgeKey = getInvoiceStatusBadgeKey(canonicalStatus);
        const badgeClassName =
          canonicalStatus === INVOICE_STATUS.PAID
            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-100 uppercase text-xs font-bold tracking-widest px-2 py-0.5 shadow-none"
            : canonicalStatus === INVOICE_STATUS.PARTIALLY_PAID
              ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400 border border-blue-200 dark:border-blue-800/50 hover:bg-blue-100 uppercase text-xs font-bold tracking-widest px-2 py-0.5 shadow-none"
              : "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400 border border-amber-200 dark:border-amber-800/50 hover:bg-amber-100 uppercase text-xs font-bold tracking-widest px-2 py-0.5 shadow-none";

        return <Badge className={badgeClassName}>{t(badgeKey)}</Badge>;
      },
    },
    {
      id: "amount",
      header: <div className="text-right">{t('table_billed', { currency })}</div>,
      sortable: true,
      sortAccessor: (inv) => inv.totalAmount,
      className: "text-zinc-900 dark:text-zinc-200 font-bold text-sm text-right py-5 px-6",
      cell: (inv) => fCurrency(inv.totalAmount),
    },
    {
      id: "actions",
      header: <div className="text-right">{t('table_actions')}</div>,
      className: "text-right py-5 px-6",
      cell: (inv) => (
        <div className="flex items-center justify-end gap-2 opactiy-100 sm:opacity-70 sm:group-hover:opacity-100 transition-opacity">
          {isPaidInvoiceStatus(inv.status) === false && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openPayModal(inv)}
              className="bg-white dark:bg-zinc-900 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 hover:text-emerald-700 dark:hover:text-emerald-400 border-zinc-200 dark:border-zinc-700 transition-colors text-xs font-bold uppercase tracking-wider h-8 active:scale-95"
              aria-label={`Log payment for ${inv.invoiceNumber}`}
            >
              <Banknote className="w-3.5 h-3.5 sm:mr-1.5" /> <span className="hidden sm:inline">{t('log_pay')}</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleResendEmail(inv)}
            disabled={resendingId === inv.id}
            className="bg-white dark:bg-zinc-900 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 hover:text-indigo-700 dark:hover:text-indigo-400 border-zinc-200 dark:border-zinc-700 transition-colors w-8 h-8 p-0 flex justify-center active:scale-95"
            title={t("actions.resend_invoice_title")}
            aria-label={`Resend email for ${inv.invoiceNumber}`}
          >
            <Send className={`w-3.5 h-3.5 ${resendingId === inv.id ? 'animate-pulse text-indigo-400' : ''}`} />
          </Button>
          <Button variant="secondary" size="sm" asChild title={t("actions.download_pdf_title")} className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-600 dark:text-zinc-300 w-8 h-8 p-0 flex justify-center active:scale-95 transition-colors">
            <a href={getBustedUrl(inv.pdfPath, inv.updatedAt)} target="_blank" rel="noopener noreferrer" aria-label={t("actions.download_pdf_aria", { invoiceNumber: inv.invoiceNumber })}>
              <Download className="h-3.5 w-3.5" />
            </a>
          </Button>
        </div>
      ),
    },
  ];
  const revenueSeries = data?.charts?.revenue || [];

  return (
    <DashboardPageShell
      title={t('financial_overview')}
      description={t('global_command_center', { countryCode })}
      icon={<Landmark className="w-6 h-6 text-indigo-700 dark:text-indigo-400" />}
      kpiCard={{
        label: t('billed_revenue'),
        value: fCurrency(kpi.totalRevenue),
        tone: "positive"
      }}
      secondaryActions={
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-zinc-400 uppercase tracking-widest hidden sm:inline">{t("fy_label")}</span>
          <Select value={selectedFy} onValueChange={setSelectedFy}>
            <SelectTrigger className="w-[120px] h-9 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm backdrop-blur-sm font-bold text-xs">
              <SelectValue placeholder={t("select_fy")} />
            </SelectTrigger>
            <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
              {getFyOptions().map(fy => (
                <SelectItem key={fy} value={fy} className="text-xs font-medium">
                  FY 20{fy}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      }
    >



        {/* --- MRR COMMAND CENTER --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* 1. MRR Metric Card */}
          <Card className="shadow-sm border-emerald-200/60 dark:border-emerald-900/40 bg-gradient-to-br from-emerald-50/80 to-emerald-100/50 dark:from-emerald-950/30 dark:to-zinc-950 flex flex-col justify-between relative overflow-hidden group transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
            <div className="absolute top-0 right-0 p-4 opacity-5 dark:opacity-10 group-hover:opacity-20 pointer-events-none transition-opacity duration-700">
              <TrendingUp className="w-32 h-32 text-emerald-600 dark:text-emerald-400 -mr-4 -mt-4 transform group-hover:scale-110 transition-transform duration-700" />
            </div>
            <CardHeader className="pb-4 relative z-10">
              <CardTitle className="text-sm font-bold text-emerald-800 dark:text-emerald-400 flex items-center gap-2 uppercase tracking-wider">
                <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-500" /> {t('guaranteed_mrr')}
              </CardTitle>
            </CardHeader>
            <CardContent className="relative z-10 pb-6 flex-1 flex flex-col justify-end">
              <div className="text-4xl lg:text-5xl font-extrabold tracking-tight text-emerald-950 dark:text-zinc-50 mb-2 drop-shadow-sm">
                <AnimatedValue value={mrrTotal} formatter={fCurrency} />
              </div>
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-emerald-200/50 dark:border-emerald-900/50">
                <span className="text-xs font-bold text-emerald-700/80 dark:text-emerald-400/80 uppercase tracking-widest">
                  {t('annual_run_rate')}
                </span>
                <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300 bg-emerald-100/50 dark:bg-emerald-900/30 px-2 py-0.5 rounded-md">
                  <AnimatedValue value={arrTotal} formatter={fCurrency} />
                </span>
              </div>
            </CardContent>
          </Card>

          {/* 2. AI Health Radar */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col group hover:shadow-md transition-all duration-300">
            <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-zinc-100 dark:border-zinc-800/80">
              <div className="space-y-1.5">
                <CardTitle className="text-sm font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2 uppercase tracking-wider">
                  <Sparkles className="w-4 h-4 text-indigo-500 animate-pulse" /> {t('retainer_radar')}
                </CardTitle>
                <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                  {t('payment_velocity')}
                </CardDescription>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" asChild aria-label={t("a11y.view_retainers")}>
                <Link href="/retainers"><ArrowRight className="w-4 h-4" /></Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col justify-center bg-zinc-50/30 dark:bg-zinc-950/30 min-h-[140px]">
              {activeRetainers.length > 0 ? (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/50">
                  {activeRetainers.slice(0, 3).map((ret: any, i: number) => (
                    <div key={i} className="p-4 flex items-center justify-between bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800/80 transition-colors cursor-default">
                      <div className="flex items-center gap-3">
                        {ret.health === 'good' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" aria-label={t("a11y.health_good")} />
                        ) : ret.health === 'warning' ? (
                          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0" aria-label={t("a11y.health_warning")} />
                        ) : (
                          <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" aria-label={t("a11y.health_critical")} />
                        )}
                        <div className="min-w-0">
                          <p className="font-bold text-sm text-zinc-900 dark:text-zinc-100 truncate">{ret.clientName}</p>
                          <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 truncate uppercase tracking-wide">{ret.serviceName}</p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="block font-bold text-sm text-zinc-900 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-md">{fCurrency(ret.amount)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 text-center flex flex-col items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mb-3">
                    <Activity className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
                  </div>
                  <p className="text-xs font-bold text-zinc-600 dark:text-zinc-400">{t('no_active_retainers')}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* 3. API connections status */}
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col hover:shadow-md transition-all duration-300">
            <CardHeader className="pb-4 border-b border-zinc-100 dark:border-zinc-800 space-y-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-sm font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2 uppercase tracking-wider">
                  <LinkIcon className="w-4 h-4 text-indigo-500" /> {t("api_status.title")}
                </CardTitle>
                <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/50 hover:bg-indigo-100 text-xs font-bold">
                  {t("api_status.badge", { configured: configuredConnections, total: 3 })}
                </Badge>
              </div>
              <CardDescription className="text-xs text-zinc-500 dark:text-zinc-400">
                {t("api_status.description")}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0 flex-1 flex flex-col justify-between bg-white dark:bg-zinc-900">
              <TooltipProvider delayDuration={150}>
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                  {apiReadinessRows.map((integration) => (
                    <div key={integration.id} className="px-5 py-3.5 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 inline-flex items-center gap-1.5">
                          <span>{integration.label}</span>
                          <UiTooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                className="inline-flex items-center justify-center rounded-sm text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900"
                                aria-label={`Why ${integration.label} matters`}
                                title={`Why ${integration.label} matters`}
                              >
                                <Info className="h-3.5 w-3.5" aria-hidden="true" />
                              </button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-[260px] leading-relaxed">
                              {apiReadinessHelpText[integration.id]}
                            </TooltipContent>
                          </UiTooltip>
                        </p>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {integration.status === "healthy"
                            ? t("api_status.status.configured")
                            : integration.status === "partial"
                              ? t("api_status.status.partial")
                              : t("api_status.status.missing")}
                        </p>
                      </div>
                      <div className="inline-flex items-center gap-2 shrink-0">
                        <StatusDot status={integration.status} />
                        <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                          {integration.status === "healthy"
                            ? t("api_status.status.configured")
                            : integration.status === "partial"
                              ? t("api_status.status.partial")
                              : t("api_status.status.missing")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </TooltipProvider>
              <Link href="/settings" className="flex items-center justify-between p-4 bg-zinc-50/50 dark:bg-zinc-950/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors group mt-auto border-t border-zinc-100 dark:border-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-zinc-900">
                <span className="text-xs font-bold text-zinc-700 dark:text-zinc-300 group-hover:text-black dark:group-hover:text-white transition-colors">
                  {t("api_status.cta")}
                </span>
                <ArrowRight className="w-4 h-4 text-zinc-400 group-hover:translate-x-1 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 transition-all duration-300" />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* --- GLOBALIZED KPI ROW --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 group hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                {t('billed_revenue')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate transition-colors group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                <AnimatedValue value={kpi.totalRevenue} formatter={fCurrency} />
              </div>
              <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 mt-1 uppercase">{t('fy_realized')}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-indigo-200/60 dark:border-indigo-800/40 bg-indigo-50/30 dark:bg-indigo-950/20 group hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700/50 transition-all duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">
                {t('liquid_assets')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-indigo-950 dark:text-zinc-50 truncate">
                <AnimatedValue value={kpi.totalWealth} formatter={fCurrency} />
              </div>
              <p className="text-xs font-bold text-indigo-600/80 dark:text-indigo-500/80 mt-1 uppercase">{t('market_value')}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 group hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                {t('advance_tax', { taxLabel })}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50 truncate transition-colors group-hover:text-rose-600 dark:group-hover:text-rose-400">
                <AnimatedValue value={kpi.estimatedTax} formatter={fCurrency} />
              </div>
              <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 mt-1 uppercase">{t('liability_est')}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 group hover:shadow-md transition-shadow duration-300">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">
                {t('active_clients')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">
                {kpi.activeClients}
              </div>
              <Link href="/clients" className="inline-flex items-center text-xs font-bold text-blue-600 dark:text-blue-400 mt-1.5 hover:text-blue-800 dark:hover:text-blue-300 transition-colors uppercase gap-1 group/link">
                {t('manage_roster')} <ArrowUpRight className="h-3 w-3 group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5 transition-transform" />
              </Link>
            </CardContent>
          </Card>
        </div>

        {/* --- DYNAMIC COMPLIANCE BAR --- */}
        <Card className={`shadow-sm border transition-all duration-300 ${compliancePercentage >= 90
          ? 'border-amber-300/80 dark:border-amber-900/60 bg-gradient-to-r from-amber-50 to-white dark:from-amber-950/30 dark:to-zinc-900'
          : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900'
          }`}>
          <CardContent className="p-6 md:p-8">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-5 gap-4">
              <div className="space-y-1.5">
                <h3 className="font-bold text-zinc-900 dark:text-zinc-50 flex items-center gap-2 uppercase tracking-tight text-sm">
                  {t('tax_threshold', { taxLabel })}
                  {compliancePercentage >= 90 && <AlertTriangle className="h-4 w-4 text-amber-500 animate-pulse" aria-label={t("a11y.threshold_warning")} />}
                </h3>
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400 max-w-md">
                  {t("monitoring_revenue", { amount: fCurrency(thresholdValue) })}
                </p>
              </div>
              <div className="text-left md:text-right">
                <div className="text-2xl font-black text-zinc-900 dark:text-zinc-50">
                  {compliancePercentage.toFixed(1)}%
                </div>
                <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mt-0.5">
                  {t('threshold_reached')}
                </div>
              </div>
            </div>
            <Progress
              value={compliancePercentage}
              className={`h-3 rounded-full overflow-hidden bg-zinc-100 dark:bg-zinc-800 ${compliancePercentage >= 90
                ? '[&>div]:bg-gradient-to-r [&>div]:from-amber-400 [&>div]:to-rose-500'
                : '[&>div]:bg-zinc-900 dark:[&>div]:bg-zinc-100'
                }`}
            />
          </CardContent>
        </Card>

        {/* --- GLOBALIZED CHARTS --- */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ChartCard
            title={t('revenue_trend')}
            description={t('monthly_billing')}
            hasData={revenueSeries.length > 0}
            noDataLabel={t('no_data_yet')}
            noDataHint={t("no_data_hint_revenue")}
            noDataIcon={Banknote}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#52525b" opacity={0.15} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  interval={isCompactCharts ? 1 : 0}
                  tick={{ fontSize: isCompactCharts ? 10 : 12, fill: '#71717a', fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: isCompactCharts ? 10 : 12, fill: '#71717a', fontWeight: 600 }}
                  tickFormatter={(value) => `${value / 1000}k`}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(113, 113, 122, 0.05)' }}
                  content={<ChartTooltip formatterValue={fCurrency} compact={isCompactCharts} />}
                />
                <Bar dataKey="revenue" name={t("chart_revenue_name")} fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={48} className="hover:opacity-80 transition-opacity" />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard
            title={t('allocation')}
            description={t('functional_distribution')}
            hasData={wealthSeries.length > 0}
            noDataLabel={t('log_assets')}
            noDataHint={t("no_data_hint_assets")}
            noDataIcon={Landmark}
            chartClassName="flex items-center justify-center relative pb-24 sm:pb-20"
          >
            <>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip content={<ChartTooltip formatterValue={fCurrency} compact={isCompactCharts} />} />
                  <Pie
                    data={wealthSeries}
                    cx="50%" cy="46%"
                    innerRadius={isCompactCharts ? 65 : 85}
                    outerRadius={isCompactCharts ? 90 : 115}
                    paddingAngle={6}
                    dataKey="value"
                    stroke="none"
                    className="focus:outline-none"
                  >
                    {wealthSeries.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity cursor-pointer" />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none">
                <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">{t('assets')}</div>
                <div className="text-3xl font-black text-zinc-900 dark:text-zinc-50">{wealthSeries.length}</div>
              </div>
              <div className="absolute left-0 right-0 bottom-0">
                <ChartLegend
                  compact={isCompactCharts}
                  items={wealthSeries.map((entry: any) => ({
                    label: String(entry.name),
                    color: String(entry.color),
                    value: fCurrency(Number(entry.value ?? 0)),
                  }))}
                />
              </div>
            </>
          </ChartCard>
        </div>

        {/* --- PORTED LEDGER ACTIVITY TABLE --- */}
        <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <CardHeader className="border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-900/40 p-5 md:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-indigo-500" /> {t('recent_ledger')}
                </CardTitle>
                <CardDescription className="text-xs dark:text-zinc-400 font-medium mt-1.5">
                  {t('recent_ledger_desc')}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild className="shrink-0 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm">
                <Link href="/ledger">
                  {t('view_full_ledger')} <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <DataTable
              columns={recentInvoiceColumns}
              data={recentInvoices}
              rowId={(row) => row.id}
              emptyTitle={t('no_recent_ledger')}
              emptyDescription={t('recent_ledger_desc')}
            />
          </CardContent>
        </Card>

        {/* --- PAYMENT LOGGING MODAL --- */}
        <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
          <DialogContent className="dark:bg-zinc-900 dark:border-zinc-800 p-0 overflow-hidden sm:max-w-md">
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50">
              <DialogHeader>
                <DialogTitle className="text-zinc-900 dark:text-zinc-50 font-bold tracking-tight text-xl">
                  {t('log_remittance')}
                </DialogTitle>
                <DialogDescription className="text-zinc-500 dark:text-zinc-400 text-sm font-medium mt-1.5 leading-relaxed">
                  {t.rich('record_actual_amount', { currency, invoiceNumber: selectedInvoice?.invoiceNumber ?? "-", b: (chunks) => <b>{chunks}</b>, strong: (chunks) => <strong className="text-zinc-700 dark:text-zinc-300">{chunks}</strong> })}
                </DialogDescription>
              </DialogHeader>
            </div>

            <form onSubmit={handleMarkAsPaid}>
              <div className="space-y-6 p-6">
                <div className="space-y-2">
                  <Label htmlFor="amount-received" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                    {t('actual_received', { currency })}
                  </Label>
                  <div className="relative group">
                    <span className="absolute left-3.5 top-2.5 text-zinc-400 group-focus-within:text-zinc-900 dark:group-focus-within:text-zinc-100 font-bold text-sm transition-colors">
                      {currencySymbol}
                    </span>
                    <Input
                      id="amount-received"
                      type="number"
                      step="0.01"
                      className="pl-9 bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 font-bold h-11 transition-all focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500 dark:focus-visible:ring-emerald-500/20"
                      value={amountReceived}
                      onChange={(e) => setAmountReceived(e.target.value)}
                      required
                    />
                  </div>
                  <div className="flex justify-between items-center mt-2 px-1">
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest">
                      {t('billed_amount')}
                    </p>
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                      {fCurrency(selectedInvoiceBilled)}
                    </p>
                  </div>
                  <div className="mt-1 px-1 space-y-1 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                    <p>Already received: {fCurrency(selectedInvoiceReceived)}</p>
                    <p>Remaining due: {fCurrency(selectedInvoiceRemaining)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date-received" className="text-zinc-700 dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">
                    {t('date_credited')}
                  </Label>
                  <Input
                    id="date-received"
                    type="date"
                    value={dateReceived}
                    onChange={(e) => setDateReceived(e.target.value)}
                    required
                    className="bg-white dark:bg-zinc-950 border-zinc-200 dark:border-zinc-800 text-zinc-900 dark:text-zinc-100 dark:[color-scheme:dark] font-medium h-11 transition-all focus-visible:ring-emerald-500/30 focus-visible:border-emerald-500"
                  />
                </div>
              </div>

              <div className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-900/40 border-t border-zinc-100 dark:border-zinc-800/80 flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setPayModalOpen(false)} className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest px-5">
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={isSubmittingPayment} className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-500 border-none text-xs font-bold uppercase tracking-widest px-6 shadow-sm shadow-emerald-500/20 transition-all active:scale-95">
                  {isSubmittingPayment ? (
                    <span className="flex items-center gap-2">
                      <Activity className="w-4 h-4 animate-spin" /> {t('processing')}
                    </span>
                  ) : t('stamp_paid')}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

    </DashboardPageShell>
  );
}
