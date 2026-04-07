"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { format } from "date-fns";
import { useTranslations } from "next-intl";
import {
  DownloadCloud, 
  FolderArchive, 
  Calculator, 
  AlertTriangle, 
  CheckCircle2, 
  Receipt, 
  FileText, 
  ExternalLink,
  ArrowRightLeft,
  Activity,
  Percent,
  Building2,
  ShieldCheck,
  ArrowRight
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { DataTable, type DataTableColumnDef } from "@/components/data-table";
import type { MapPoint } from "@/components/maps";
import { MapCardSkeleton } from "@/components/maps";
import type { CAExpenseRow, CAInvoiceRow, CAPortalPayload, CAPortalSummary } from "@/lib/ca-portal/types";


const defaultSummary: CAPortalSummary = {
  grossReceipts: 0,
  presumptiveIncome: 0,
  deductions80C: 0,
  deductions80D: 0,
  totalExpenses: 0,
};
const EMPTY_PAYLOAD: CAPortalPayload = {
  summary: defaultSummary,
  invoices: [],
  expenses: [],
};

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isCAInvoiceRow = (value: unknown): value is CAInvoiceRow => {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.invoiceDate === "string" &&
    typeof value.invoiceNumber === "string" &&
    typeof value.clientName === "string" &&
    typeof value.sacCode === "string" &&
    isFiniteNumber(value.totalAmount) &&
    (value.amountReceived === null || isFiniteNumber(value.amountReceived)) &&
    typeof value.status === "string" &&
    (value.pdfPath === null || typeof value.pdfPath === "string")
  );
};

const isCAExpenseRow = (value: unknown): value is CAExpenseRow => {
  if (!isRecord(value)) return false;

  return (
    typeof value.id === "string" &&
    typeof value.date === "string" &&
    typeof value.category === "string" &&
    typeof value.vendor === "string" &&
    (value.description === null || typeof value.description === "string") &&
    isFiniteNumber(value.amount) &&
    (value.receiptUrl === null || typeof value.receiptUrl === "string")
  );
};

const isCAPortalSummary = (value: unknown): value is CAPortalSummary => {
  if (!isRecord(value)) return false;

  return (
    isFiniteNumber(value.grossReceipts) &&
    isFiniteNumber(value.presumptiveIncome) &&
    isFiniteNumber(value.deductions80C) &&
    isFiniteNumber(value.deductions80D) &&
    isFiniteNumber(value.totalExpenses)
  );
};

const parseCAPortalResponse = (value: unknown): CAPortalPayload => {
  if (!isRecord(value) || "error" in value) return EMPTY_PAYLOAD;

  const summary = isCAPortalSummary(value.summary) ? value.summary : defaultSummary;
  const invoices = Array.isArray(value.invoices)
    ? value.invoices.filter(isCAInvoiceRow)
    : [];
  const expenses = Array.isArray(value.expenses)
    ? value.expenses.filter(isCAExpenseRow)
    : [];

  return { summary, invoices, expenses };
};

const GeographyInsightCard = dynamic(
  () => import("@/components/maps").then((mod) => mod.GeographyInsightCard),
  {
    loading: () => <MapCardSkeleton />,
    ssr: false,
  }
);

const formatINRCurrency = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

export default function CAPortal() {
  const t = useTranslations('CAPortal');
  const EMPTY_SUMMARY: CAPortalPayload["summary"] = {
    grossReceipts: 0,
    presumptiveIncome: 0,
    deductions80C: 0,
    deductions80D: 0,
    totalExpenses: 0,
  };
  
  // --- STATE ---
  const [fy, setFy] = useState("25-26"); 
  const [data, setData] = useState<CAPortalPayload | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExportingCSV, setIsExportingCSV] = useState(false);
  const [isExportingZIP, setIsExportingZIP] = useState(false);

  // --- DATA FETCHING ---
  useEffect(() => {
    fetchAuditData();
  }, [fy]);

  const fetchAuditData = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/ca-portal?fy=${fy}`);
      const json = await res.json();

      const parsedData = parseCAPortalResponse(json);

      if (!res.ok || (isRecord(json) && typeof json.error === "string")) {
        toast.error("Audit data format mismatch. Showing empty dataset.");
        setData(EMPTY_PAYLOAD);
        return;
      }

      setData(parsedData);
    } catch (err) {
      console.error("Failed to fetch audit data", err);
      toast.error("Failed to fetch audit data for this financial year.");
      setData(EMPTY_PAYLOAD);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportCSV = async () => {
    setIsExportingCSV(true);
    const toastId = toast.loading(t('generating'));
    try {
      const res = await fetch(`/api/ca-portal/export/csv?fy=${fy}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Audit_Ledger_FY${fy}.csv`;
      a.click();
      toast.success(t('download_success'), { id: toastId });
    } catch {
      toast.error(t('export_failed'), { id: toastId });
    } finally {
      setIsExportingCSV(false);
    }
  };

  const handleExportZIP = async () => {
    setIsExportingZIP(true);
    const toastId = toast.loading(t('zipping'));
    try {
      const res = await fetch(`/api/ca-portal/export/zip?fy=${fy}`);
      if (!res.ok) throw new Error();
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Audit_Evidence_FY${fy}.zip`;
      a.click();
      toast.success(t('download_success'), { id: toastId });
    } catch {
      toast.error(t('export_failed'), { id: toastId });
    } finally {
      setIsExportingZIP(false);
    }
  };

  const summary = data?.summary ?? EMPTY_SUMMARY;
  const invoices: CAInvoiceRow[] = data?.invoices ?? [];
  const expenses: CAExpenseRow[] = data?.expenses ?? [];
  const isGstLiable = summary.grossReceipts >= 2000000;
  const jurisdictionPoints: MapPoint[] = [
    { id: "mh", label: "Maharashtra", subtitle: "GST filings + invoice validations", value: "48 compliance events", lat: 3.6, lng: 54, weight: 48 },
    { id: "ka", label: "Karnataka", subtitle: "Vendor reconciliations", value: "37 compliance events", lat: -7.2, lng: 46.8, weight: 37 },
    { id: "dl", label: "Delhi NCR", subtitle: "TDS and receivables", value: "29 compliance events", lat: 19.8, lng: 39.6, weight: 29 },
    { id: "tn", label: "Tamil Nadu", subtitle: "Expense audits", value: "24 compliance events", lat: -18, lng: 57.6, weight: 24 },
    { id: "gj", label: "Gujarat", subtitle: "Export invoices", value: "19 compliance events", lat: 5.4, lng: 32.4, weight: 19 },
    { id: "wb", label: "West Bengal", subtitle: "Documentation checks", value: "16 compliance events", lat: 7.2, lng: 68.4, weight: 16 },
  ];

  const invoiceColumns: DataTableColumnDef<CAInvoiceRow>[] = [
    {
      id: "invoiceDate",
      header: "Date",
      accessor: (row) => row.invoiceDate,
      sortable: true,
      sortAccessor: (row) => new Date(row.invoiceDate).getTime(),
      cell: (row) => format(new Date(row.invoiceDate), "dd MMM yyyy"),
    },
    {
      id: "invoiceNumber",
      header: "Invoice No.",
      accessor: (row) => row.invoiceNumber,
      sortable: true,
      cell: (row) => row.invoiceNumber,
    },
    {
      id: "clientName",
      header: "Client",
      accessor: (row) => row.clientName,
      sortable: true,
      cell: (row) => row.clientName,
    },
    {
      id: "sacCode",
      header: "SAC",
      accessor: (row) => row.sacCode,
      sortable: true,
      cell: (row) => row.sacCode,
    },
    {
      id: "totalAmount",
      header: "Total Amount",
      accessor: (row) => row.totalAmount,
      sortable: true,
      sortAccessor: (row) => row.totalAmount,
      className: "text-right font-medium",
      headerClassName: "text-right",
      cell: (row) => formatINRCurrency(row.totalAmount),
    },
    {
      id: "amountReceived",
      header: "Amount Received",
      accessor: (row) => row.amountReceived ?? 0,
      sortable: true,
      sortAccessor: (row) => row.amountReceived ?? 0,
      className: "text-right",
      headerClassName: "text-right",
      cell: (row) => row.amountReceived === null ? "—" : formatINRCurrency(row.amountReceived),
    },
    {
      id: "status",
      header: "Status",
      accessor: (row) => row.status,
      sortable: true,
      cell: (row) => (
        <Badge variant={row.status === "Paid" ? "default" : "secondary"}>
          {row.status}
        </Badge>
      ),
    },
    {
      id: "pdf",
      header: "Evidence",
      accessor: (row) => row.pdfPath ?? "",
      cell: (row) =>
        row.pdfPath ? (
          <a
            href={row.pdfPath}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
          >
            View <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span className="text-zinc-400">N/A</span>
        ),
    },
  ];

  const expenseColumns: DataTableColumnDef<CAExpenseRow>[] = [
    {
      id: "date",
      header: "Date",
      accessor: (row) => row.date,
      sortable: true,
      sortAccessor: (row) => new Date(row.date).getTime(),
      cell: (row) => format(new Date(row.date), "dd MMM yyyy"),
    },
    {
      id: "vendor",
      header: "Vendor",
      accessor: (row) => row.vendor,
      sortable: true,
      cell: (row) => row.vendor,
    },
    {
      id: "category",
      header: "Category",
      accessor: (row) => row.category,
      sortable: true,
      cell: (row) => row.category,
    },
    {
      id: "description",
      header: "Description",
      accessor: (row) => row.description ?? "",
      cell: (row) => row.description || "—",
    },
    {
      id: "amount",
      header: "Amount",
      accessor: (row) => row.amount,
      sortable: true,
      sortAccessor: (row) => row.amount,
      className: "text-right font-medium",
      headerClassName: "text-right",
      cell: (row) => formatINRCurrency(row.amount),
    },
    {
      id: "receipt",
      header: "Receipt",
      accessor: (row) => row.receiptUrl ?? "",
      cell: (row) =>
        row.receiptUrl ? (
          <a
            href={row.receiptUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-700"
          >
            View <ExternalLink className="w-3.5 h-3.5" />
          </a>
        ) : (
          <span className="text-zinc-400">N/A</span>
        ),
    },
  ];

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 p-4 md:p-8 transition-colors duration-300">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header Section */}
        <div className="sticky top-0 z-20 -mx-4 px-4 py-4 md:-mx-8 md:px-8 bg-zinc-50/50 dark:bg-zinc-950/50 backdrop-blur-md border-b border-zinc-200/50 dark:border-zinc-800/50 transition-all duration-300">
          <div className="max-w-7xl mx-auto w-full flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div>
              <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-zinc-50">{t('title')}</h1>
              <p className="text-zinc-500 dark:text-zinc-400 mt-1.5 font-medium text-sm">{t('description')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="space-y-1">
                <label className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{t('financial_year')}</label>
                <Select value={fy} onValueChange={setFy}>
                  <SelectTrigger className="w-[180px] bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 font-bold dark:text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                    <SelectItem value="23-24">FY 2023-24</SelectItem>
                    <SelectItem value="24-25">FY 2024-25</SelectItem>
                    <SelectItem value="25-26">FY 2025-26</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2 mt-5">
                <Button onClick={handleExportCSV} disabled={isExportingCSV} variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-900/50 dark:text-indigo-400">
                  {isExportingCSV ? t('generating') : <><DownloadCloud className="w-4 h-4 mr-2" /> {t('export_csv')}</>}
                </Button>
                <Button onClick={handleExportZIP} disabled={isExportingZIP} className="bg-indigo-600 hover:bg-indigo-700 text-white">
                  {isExportingZIP ? t('zipping') : <><FolderArchive className="w-4 h-4 mr-2" /> {t('download_zip')}</>}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-xl border flex items-start gap-4 ${isGstLiable ? "bg-rose-50 border-rose-200 dark:bg-rose-950/20 dark:border-rose-900/50" : "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-900/50"}`}>
          <div className={`p-2 rounded-lg ${isGstLiable ? "bg-rose-100 dark:bg-rose-900/50" : "bg-emerald-100 dark:bg-emerald-900/50"}`}>
            {isGstLiable ? <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400" /> : <ShieldCheck className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />}
          </div>
          <div>
            <h3 className={`font-bold ${isGstLiable ? "text-rose-900 dark:text-rose-200" : "text-emerald-900 dark:text-emerald-200"}`}>
              {isGstLiable ? t('gst_warning_title') : t('gst_ok_title')}
            </h3>
            <p className={`text-sm mt-1 leading-relaxed ${isGstLiable ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>
              {isGstLiable ? t('gst_warning_desc') : t('gst_ok_desc')}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{t('kpi_gross')}</CardTitle>
              <Activity className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold dark:text-zinc-100">₹{summary.grossReceipts.toLocaleString('en-IN')}</div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium">{t('kpi_gross_desc')}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/30 dark:bg-indigo-950/20">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-indigo-700 dark:text-indigo-400">{t('kpi_44ada')}</CardTitle>
              <Percent className="h-4 w-4 text-indigo-500 dark:text-indigo-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-100">₹{summary.presumptiveIncome.toLocaleString('en-IN')}</div>
              <p className="text-xs text-indigo-600 dark:text-indigo-400/80 mt-1 font-medium">{t('kpi_44ada_desc')}</p>
            </CardContent>
          </Card>
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">{t('kpi_expenses')}</CardTitle>
              <Building2 className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold dark:text-zinc-100">₹{summary.totalExpenses.toLocaleString('en-IN')}</div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium">{t('kpi_expenses_desc')}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/50 dark:bg-emerald-950/30 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">{t('kpi_deductions')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black text-emerald-900 dark:text-emerald-300">₹{(summary.deductions80C + summary.deductions80D).toLocaleString('en-IN')}</div>
              <p className="text-xs font-medium text-emerald-600 dark:text-emerald-500 mt-1">80C: ₹{summary.deductions80C.toLocaleString()} | 80D: ₹{summary.deductions80D.toLocaleString()}</p>
            </CardContent>
          </Card>
        </div>

        <GeographyInsightCard
          title="Compliance activity & jurisdiction distribution"
          subtitle="Relative concentration of audits, filings, and evidence collection across active jurisdictions."
          points={jurisdictionPoints}
        />

        <Card className="border-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 shadow-sm overflow-hidden">
          <Tabs defaultValue="ar" className="w-full">
            <CardHeader className="bg-zinc-50/50 dark:bg-zinc-950/50 border-b dark:border-zinc-800 p-0">
              <TabsList className="bg-transparent p-0 h-auto rounded-none">
                <TabsTrigger value="ar" className="px-6 py-4 font-bold text-xs uppercase tracking-widest data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-indigo-700 border-b-2 border-transparent data-[state=active]:border-indigo-600 rounded-none">
                  {t('tab_ar')}
                </TabsTrigger>
                <TabsTrigger value="ap" className="px-6 py-4 font-bold text-xs uppercase tracking-widest data-[state=active]:bg-white dark:data-[state=active]:bg-zinc-900 data-[state=active]:text-rose-700 border-b-2 border-transparent data-[state=active]:border-rose-600 rounded-none">
                  {t('tab_ap')}
                </TabsTrigger>
              </TabsList>
            </CardHeader>
            <CardContent className="p-0">
              <TabsContent value="ar" className="m-0">
                <DataTable
                  columns={invoiceColumns}
                  data={invoices}
                  rowId={(row) => row.id}
                  loading={isLoading}
                  emptyTitle="No receivables logged"
                  emptyDescription="Invoices for this financial year will appear here."
                  className="p-0"
                />
              </TabsContent>
              <TabsContent value="ap" className="m-0">
                <DataTable
                  columns={expenseColumns}
                  data={expenses}
                  rowId={(row) => row.id}
                  loading={isLoading}
                  emptyTitle="No expense vouchers logged"
                  emptyDescription="Expense evidence and vendor entries will appear here."
                  className="p-0"
                />
              </TabsContent>
            </CardContent>
          </Tabs>
        </Card>

      </div>
    </div>
  );
}
