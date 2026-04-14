"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { FileText, Clock, Download, AlertTriangle, FilePlus, Send, Banknote, Trash2, ReceiptText, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useSearchParams } from "next/navigation";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// MISSION CRITICAL: Globalization Imports
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { useTranslations } from "next-intl";
import { getBustedUrl } from "@/lib/cache-buster";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { ColumnVisibilityToggle, DataTable, DataTablePagination, DataTableToolbar, RowActionsMenu, useUrlTableState, type DataTableColumnDef } from "@/components/data-table";
import type { InvoiceDto } from "@/lib/types/business";
import {
  DEFAULT_LEDGER_META,
  parseLedgerInvoicesResponse,
  resolveLedgerErrorToastKey,
  resolveLedgerMalformedJsonToastKey,
} from "./fetch-invoices-response";
import InvoiceGeneratorForm from "@/components/invoice/InvoiceGeneratorForm";

export default function InvoicesAndEarnings() {
  const t = useTranslations("Ledger");
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- PAGINATION STATE ---
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // --- KPI STATE ---
  const [kpis, setKpis] = useState({
    totalRevenue: 0,
    outstanding: 0,
    presumptiveIncome: 0,
  });

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

  // New Invoice Modal State
  const [newInvoiceModalOpen, setNewInvoiceModalOpen] = useState(false);

  // Payment Modal State
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceDto | null>(null);
  const [amountReceived, setAmountReceived] = useState("");
  const [dateReceived, setDateReceived] = useState(format(new Date(), "yyyy-MM-dd"));
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Resend Email State
  const [resendingId, setResendingId] = useState<string | null>(null);

  // Delete Invoice State
  const [invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["invoice", "date", "billed", "status", "received", "actions"]);
  const [hasHandledProtocolRecord, setHasHandledProtocolRecord] = useState(false);
  const tableState = useUrlTableState("income");

  useEffect(() => {
    fetchInvoices(currentPage);
  }, [currentPage]);

  // --- SMART AI AUTO-FILL HOOK ---
  useEffect(() => {
    if (invoices.length === 0) return;

    const aiPayload = sessionStorage.getItem("erp_ai_payload");
    if (aiPayload) {
      try {
        const { path, data, timestamp } = JSON.parse(aiPayload);
        const isFresh = (Date.now() - timestamp) < 10000;

        // If AI aimed at ledger or income, handle pay-modal autofill; if aimed at invoice, open the modal
        if (isFresh && data) {
          if (path === "/income" || path === "/ledger") {
            if (data.invoiceNumber || data.client) {
              const matchedInvoice = invoices.find((inv) =>
                (data.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(data.invoiceNumber.toLowerCase())) ||
                (data.client && inv.clientName.toLowerCase().includes(data.client.toLowerCase()) && inv.status !== "Paid")
              );

              if (matchedInvoice) {
                setSelectedInvoice(matchedInvoice);
                if (data.amount) setAmountReceived(data.amount.toString());
                if (data.date) setDateReceived(data.date);
                setPayModalOpen(true);
              }
            }
          } else if (path === "/invoice" || path === "/") {
            // AI tried to navigate to invoice generator — open the new modal instead
            setNewInvoiceModalOpen(true);
          }
        }
        sessionStorage.removeItem("erp_ai_payload");
      } catch {
        console.error("Failed to parse AI payload");
        toast.warning(t("toast.warning.ai_autofill_failed"));
      }
    }
  }, [invoices]);

  const fetchInvoices = async (page = 1) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/invoices?page=${page}&limit=15`);
      let payload: unknown = null;
      try {
        payload = await res.json();
      } catch {
        toast.error(t(resolveLedgerMalformedJsonToastKey()));
        setInvoices([]);
        setKpis(DEFAULT_LEDGER_META.kpis);
        setTotalPages(DEFAULT_LEDGER_META.totalPages);
        return;
      }

      if (!res.ok) {
        toast.error(t(resolveLedgerErrorToastKey(res.status, payload)));
        setInvoices([]);
        setKpis(DEFAULT_LEDGER_META.kpis);
        setTotalPages(DEFAULT_LEDGER_META.totalPages);
        return;
      }

      const parsed = parseLedgerInvoicesResponse(payload);
      if (!parsed) {
        toast.error(t("toast.error.payload_malformed"));
        setInvoices([]);
        setKpis(DEFAULT_LEDGER_META.kpis);
        setTotalPages(DEFAULT_LEDGER_META.totalPages);
        return;
      }

      setInvoices(parsed.data);
      setKpis(parsed.meta.kpis);
      setTotalPages(parsed.meta.totalPages);
      setCurrentPage(parsed.meta.currentPage);

    } catch {
      console.error("Failed to load ledger");
      toast.error(t("toast.error.load_data"));
      setInvoices([]);
      setKpis(DEFAULT_LEDGER_META.kpis);
      setTotalPages(DEFAULT_LEDGER_META.totalPages);
    } finally {
      setIsLoading(false);
    }
  };

  const findInvoicePageById = async (invoiceId: string): Promise<number | null> => {
    const fetchPage = async (page: number) => {
      const res = await fetch(`/api/invoices?page=${page}&limit=15`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) return null;

      const parsed = parseLedgerInvoicesResponse(payload);
      if (!parsed) return null;

      return {
        found: parsed.data.some((invoice) => invoice.id === invoiceId),
        totalPages: parsed.meta.totalPages,
      };
    };

    const firstPage = await fetchPage(1);
    if (!firstPage) return null;
    if (firstPage.found) return 1;

    for (let page = 2; page <= firstPage.totalPages; page += 1) {
      const current = await fetchPage(page);
      if (current?.found) {
        return page;
      }
    }

    return null;
  };

  // --- KPI CALCULATIONS ---
  const { totalRevenue, outstanding, presumptiveIncome } = kpis;
  const thresholdValue = countryCode === "IN" ? 2000000 : 100000;
  const compliancePercentage = Math.min((totalRevenue / thresholdValue) * 100, 100);
  const isNearThreshold = compliancePercentage > 90;

  const handleMarkAsPaid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/invoices/${selectedInvoice.id}/pay`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountReceived, dateReceived }),
      });

      if (res.ok) {
        setPayModalOpen(false);
        toast.success(t("toast.success.payment_logged"));
        fetchInvoices(currentPage);
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || t("toast.error.log_payment"));
      }
    } catch {
      console.error("Payment logging failed");
      toast.error(t("toast.error.network"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendEmail = async (invoice: InvoiceDto) => {
    setResendingId(invoice.id);
    const toastId = toast.loading(t("toast.loading.send_invoice", { invoiceNumber: invoice.invoiceNumber }));
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/resend`, { method: "POST" });
      const data = await res.json();

      if (res.ok) {
        toast.success(t("toast.success.email_sent"), { id: toastId });
      } else {
        toast.error(data.error || t("toast.error.send_email"), { id: toastId });
      }
    } catch {
      toast.error(t("toast.error.network"), { id: toastId });
    } finally {
      setResendingId(null);
    }
  };

  const openPayModal = (invoice: InvoiceDto) => {
    const alreadyReceived = Number(invoice.amountReceived ?? 0);
    const remaining = Math.max(0, Number(invoice.totalAmount) - alreadyReceived);
    setSelectedInvoice(invoice);
    setAmountReceived(remaining.toString());
    setPayModalOpen(true);
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    const toastId = toast.loading(t("toast.loading.delete_invoice"));
    try {
      const res = await fetch(`/api/invoices/${invoiceToDelete}`, { method: "DELETE" });
      if (!res.ok) throw new Error(t("toast.error.delete_invoice"));
      toast.success(t("toast.success.invoice_deleted"), { id: toastId });
      fetchInvoices(currentPage);
    } catch (err) {
      toast.error(t("toast.error.delete_invoice"), { id: toastId });
    } finally {
      setInvoiceToDelete(null);
    }
  };

  // Safe Format Date helper
  const safeDateFormat = (dateFormat ?? "dd/MM/yyyy").replace(/D/g, "d").replace(/Y/g, "y");
  const selectedInvoiceBilled = Number(selectedInvoice?.totalAmount ?? 0);
  const selectedInvoiceReceived = Number(selectedInvoice?.amountReceived ?? 0);
  const selectedInvoiceRemaining = Math.max(0, selectedInvoiceBilled - selectedInvoiceReceived);
  const filteredInvoices = invoices.filter((inv) =>
    `${inv.invoiceNumber} ${inv.clientName ?? ""} ${inv.status}`.toLowerCase().includes(tableState.search.toLowerCase()),
  );

  useEffect(() => {
    const protocolRecord = searchParams.get("protocolRecord");
    const protocolEntity = searchParams.get("protocolEntity");

    if (hasHandledProtocolRecord || !protocolRecord || protocolEntity !== "invoice") {
      return;
    }

    setHasHandledProtocolRecord(true);
    void (async () => {
      try {
        const res = await fetch(`/api/invoices/${encodeURIComponent(protocolRecord)}`);
        const payload = await res.json().catch(() => null);
        if (!res.ok || !payload?.data?.invoiceNumber) {
          toast.error("Could not open deep-linked invoice.");
          return;
        }
        const invoicePage = await findInvoicePageById(String(payload.data.id ?? protocolRecord));
        if (invoicePage && invoicePage !== currentPage) {
          setCurrentPage(invoicePage);
        }
        tableState.setSearch(String(payload.data.invoiceNumber));
        toast.success(`Deep-linked invoice ${payload.data.invoiceNumber} loaded.`);
      } catch {
        toast.error("Could not open deep-linked invoice.");
      }
    })();
  }, [currentPage, hasHandledProtocolRecord, searchParams, tableState]);

  const invoiceColumns: DataTableColumnDef<InvoiceDto>[] = [
    { id: "invoice", header: t("col_invoice_no"), accessor: (row) => row.invoiceNumber, sortable: true, cell: (row) => <span className="font-bold dark:text-zinc-200 text-sm">{row.invoiceNumber}</span>, hideable: true },
    { id: "date", header: t("col_date"), sortable: true, sortAccessor: (row) => new Date(row.invoiceDate).getTime(), cell: (row) => <span className="dark:text-zinc-400 text-xs font-medium">{format(new Date(row.invoiceDate), safeDateFormat)}</span>, hideable: true },
    { id: "billed", header: t("col_billed"), sortable: true, sortAccessor: (row) => row.totalAmount, cell: (row) => <span className="dark:text-zinc-300 font-bold text-sm">{fCurrency(row.totalAmount)}</span>, hideable: true },
    {
      id: "status",
      header: t("col_status"),
      accessor: (row) => row.status,
      cell: (row) => row.status === "Paid" || row.status === "PAID" ? (
        <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/50 hover:bg-emerald-200 uppercase text-xs font-bold tracking-widest">{t("status_paid")}</Badge>
      ) : row.status === "Partially Paid" || row.status === "PARTIALLY_PAID" ? (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-200 dark:border-blue-800/50 hover:bg-blue-200 uppercase text-xs font-bold tracking-widest">{t("status_partial")}</Badge>
      ) : (
        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-200 dark:border-amber-800/50 hover:bg-amber-200 uppercase text-xs font-bold tracking-widest">{t("status_pending")}</Badge>
      ),
      hideable: true,
    },
    {
      id: "received",
      header: t("col_received", { currency }),
      sortable: true,
      sortAccessor: (row) => row.amountReceived ?? 0,
      cell: (row) => (
        <div className="dark:text-zinc-300 text-sm font-bold">
          {row.amountReceived ? fCurrency(row.amountReceived) : "-"}
        </div>
      ),
      hideable: true,
    },
    {
      id: "actions",
      header: <div className="text-right">{t("col_actions")}</div>,
      className: "text-right",
      cell: (row) => (
        <div className="flex items-center justify-end gap-2">
          {row.status !== "Paid" && row.status !== "PAID" && (
            <Button variant="outline" size="sm" onClick={() => openPayModal(row)} className="bg-white dark:bg-zinc-950 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 hover:text-emerald-700 dark:hover:text-emerald-400 dark:border-zinc-800 transition-colors text-xs font-bold uppercase tracking-wider">
              <Banknote className="w-3.5 h-3.5 mr-1.5" /> {t("log_pay")}
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => handleResendEmail(row)} disabled={resendingId === row.id} className="bg-white dark:bg-zinc-950 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-700 dark:hover:text-indigo-400 dark:border-zinc-800 transition-colors w-9 px-0 flex justify-center" title={t("actions.resend_invoice_title")}>
            <Send className={`w-3.5 h-3.5 ${resendingId === row.id ? "animate-pulse text-indigo-400" : ""}`} />
          </Button>
          <Button variant="secondary" size="sm" asChild title={t("actions.download_pdf_title")} className="dark:bg-zinc-800 dark:hover:bg-zinc-700 w-9 px-0 flex justify-center">
            <a href={getBustedUrl(row.pdfPath, row.updatedAt)} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5 dark:text-zinc-200" />
            </a>
          </Button>
          <RowActionsMenu row={row} actions={[{ label: t("actions.delete"), onClick: (r) => setInvoiceToDelete(r.id), variant: "danger", icon: <Trash2 className="mr-2 h-4 w-4" /> }]} />
        </div>
      ),
    },
  ];

  return (
    <DashboardPageShell
      title={t("title")}
      description={t("description")}
      icon={<ReceiptText className="w-6 h-6 text-indigo-700 dark:text-indigo-400" />}
      animated={false}
      primaryAction={
        <Button
          id="new-invoice-btn"
          onClick={() => setNewInvoiceModalOpen(true)}
          className="w-full sm:w-auto bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-50 dark:hover:bg-zinc-200 text-white dark:text-zinc-900 h-12 px-6 shadow-md shadow-zinc-900/10 dark:shadow-none text-xs font-bold uppercase tracking-wider transition-all active:scale-95"
        >
          <FilePlus className="w-4 h-4 mr-2" /> New Invoice
        </Button>
      }
    >

      {/* Executive KPI Ribbon */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{t("gross_billed")}</CardTitle>
            <Banknote className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold dark:text-zinc-50">{fCurrency(totalRevenue)}</div>

            <div className="mt-4 space-y-2">
              <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                  {isNearThreshold && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                  {taxLabel} {t("tax_threshold", { taxLabel: "" }).replace("{taxLabel} ", "")}
                </span>
                <span className="dark:text-zinc-300">{compliancePercentage.toFixed(1)}%</span>
              </div>
              <Progress value={compliancePercentage} className="h-2 bg-zinc-100 dark:bg-zinc-800" />
              <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 text-right uppercase tracking-widest">{t("limit", { amount: fCurrency(thresholdValue) })}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{t("outstanding")}</CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-amber-600 dark:text-amber-500">{fCurrency(outstanding)}</div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium">{t("outstanding_desc")}</p>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20">
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">{t("est_realized")}</CardTitle>
            <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-50">{fCurrency(presumptiveIncome)}</div>
            <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 mt-1 font-medium">{t("presumptive_desc")}</p>
          </CardContent>
        </Card>
      </div>

      {/* Invoice Ledger Table */}
      <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
        <CardHeader className="border-b dark:border-zinc-800">
          <CardTitle className="text-sm font-bold uppercase tracking-wider dark:text-zinc-50">{t("invoice_ledger")}</CardTitle>
          <CardDescription className="text-xs dark:text-zinc-400 font-medium">{t("ledger_desc")}</CardDescription>
        </CardHeader>
        <CardContent className="p-0 sm:p-6 sm:pt-0">
          <DataTableToolbar
            searchValue={tableState.search}
            onSearchChange={tableState.setSearch}
            searchPlaceholder={t("col_invoice_no")}
            rightSlot={<div className="hidden md:block"><ColumnVisibilityToggle
              options={invoiceColumns.filter((col) => col.hideable).map((col) => ({
                id: col.id,
                label: typeof col.header === "string" ? col.header : col.id,
                visible: visibleColumns.includes(col.id),
                onToggle: () => setVisibleColumns((prev) => prev.includes(col.id) ? prev.filter((id) => id !== col.id) : [...prev, col.id]),
              }))}
            /></div>}
          />
          <div className="hidden md:block">
            <DataTable
              columns={invoiceColumns}
              data={filteredInvoices}
              rowId={(row) => row.id}
              loading={isLoading}
              emptyTitle={t("no_entries")}
              emptyDescription={t("no_entries_desc")}
              visibleColumnIds={visibleColumns}
            />
          </div>
          <div className="space-y-3 p-3 pb-20 md:hidden">
            {filteredInvoices.map((invoice) => (
              <Card key={invoice.id} className="border-zinc-200 dark:border-zinc-800">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-zinc-500">{t("col_invoice_no")}</p>
                      <p className="font-bold text-zinc-900 dark:text-zinc-100">{invoice.invoiceNumber}</p>
                    </div>
                    <Badge className="text-[10px] uppercase tracking-widest">{invoice.status}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-zinc-500">{t("col_billed")}</p>
                      <p className="font-semibold">{fCurrency(invoice.totalAmount)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-zinc-500">{t("col_received", { currency })}</p>
                      <p className="font-semibold">{invoice.amountReceived ? fCurrency(invoice.amountReceived) : "-"}</p>
                    </div>
                  </div>
                  <details className="rounded-md border border-zinc-200 p-2 text-xs dark:border-zinc-800">
                    <summary className="cursor-pointer font-semibold">More details</summary>
                    <div className="space-y-1 pt-2 text-zinc-600 dark:text-zinc-300">
                      <p>{t("col_date")}: {format(new Date(invoice.invoiceDate), safeDateFormat)}</p>
                      <p>{t("col_status")}: {invoice.status}</p>
                    </div>
                  </details>
                  <div className="flex flex-wrap gap-2">
                    {invoice.status !== "Paid" && invoice.status !== "PAID" && (
                      <Button variant="outline" size="sm" onClick={() => openPayModal(invoice)}><Banknote className="mr-1.5 h-3.5 w-3.5" />{t("log_pay")}</Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => handleResendEmail(invoice)} disabled={resendingId === invoice.id}><Send className="mr-1.5 h-3.5 w-3.5" />{t("actions.resend_invoice_title")}</Button>
                    <Button variant="secondary" size="sm" asChild><a href={getBustedUrl(invoice.pdfPath, invoice.updatedAt)} target="_blank" rel="noopener noreferrer"><Download className="mr-1.5 h-3.5 w-3.5" />{t("actions.download_pdf_title")}</a></Button>
                    <Button variant="destructive" size="sm" onClick={() => setInvoiceToDelete(invoice.id)}><Trash2 className="mr-1.5 h-3.5 w-3.5" />{t("actions.delete")}</Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {filteredInvoices.length === 0 && !isLoading && (
            <div className="pb-4 text-center">
              <Button
                id="generate-first-invoice-btn"
                onClick={() => setNewInvoiceModalOpen(true)}
                className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 border-none font-bold text-xs uppercase tracking-wider"
              >
                <FilePlus className="w-3.5 h-3.5 mr-2" />
                {t("generate_first")}
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter className="p-0">
          <DataTablePagination
            currentPage={currentPage}
            totalPages={totalPages}
            onPrev={() => setCurrentPage((p) => p - 1)}
            onNext={() => setCurrentPage((p) => p + 1)}
            disabled={isLoading}
            label={t("page_of", { current: currentPage, total: totalPages })}
          />
        </CardFooter>
      </Card>

      {/* ─── NEW INVOICE MODAL ─── */}
      <Dialog open={newInvoiceModalOpen} onOpenChange={setNewInvoiceModalOpen}>
        <DialogContent className="sm:max-w-4xl max-h-[90dvh] overflow-y-auto p-0 gap-0 dark:bg-zinc-950 dark:border-zinc-800 shadow-2xl">
          {/* Accent stripe */}
          <div className="h-1 w-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-emerald-500 shrink-0" />

          <DialogHeader className="px-6 pt-5 pb-4 bg-zinc-50/80 dark:bg-zinc-900/60 border-b border-zinc-100 dark:border-zinc-800/80 shrink-0">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-200/50 dark:border-indigo-400/20">
                  <FilePlus className="w-5 h-5 text-indigo-700 dark:text-indigo-400" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    New Invoice
                  </DialogTitle>
                  <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400 font-medium mt-0.5">
                    Generate a professional invoice and optionally email it instantly.
                  </DialogDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setNewInvoiceModalOpen(false)}
                className="rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 dark:text-zinc-400 shrink-0"
                aria-label="Close new invoice modal"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </DialogHeader>

          <div className="bg-white dark:bg-zinc-950">
            <InvoiceGeneratorForm
              inModal
              onSuccess={() => {
                // Refresh the table after a short delay so the user can see the success banner
                setTimeout(() => {
                  setNewInvoiceModalOpen(false);
                  fetchInvoices(currentPage);
                }, 2500);
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Logging Modal */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="dark:text-zinc-50 font-bold tracking-tight text-xl">{t("log_remittance")}</DialogTitle>
            <DialogDescription className="dark:text-zinc-400 text-xs font-medium">
              {t("log_remittance_desc", { currency, invoiceNumber: selectedInvoice?.invoiceNumber ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleMarkAsPaid}>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t("actual_received", { currency })}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-zinc-500 font-bold text-sm">{currencySymbol}</span>
                  <Input
                    type="number"
                    step="0.01"
                    className="pl-8 dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 font-bold"
                    value={amountReceived}
                    onChange={(e) => setAmountReceived(e.target.value)}
                    required
                  />
                </div>
                <div className="mt-1 space-y-1 text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                  <p>{t("billed_amount", { amount: fCurrency(selectedInvoiceBilled) })}</p>
                  <p>Already received: {fCurrency(selectedInvoiceReceived)}</p>
                  <p>Remaining due: {fCurrency(selectedInvoiceRemaining)}</p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t("date_credited")}</Label>
                <Input
                  type="date"
                  value={dateReceived}
                  onChange={(e) => setDateReceived(e.target.value)}
                  required
                  className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:[color-scheme:dark] font-medium"
                />
              </div>
            </div>
            <DialogFooter className="dark:border-zinc-800">
              <Button type="button" variant="outline" onClick={() => setPayModalOpen(false)} className="dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest">{t("cancel")}</Button>
              <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 border-none text-xs font-bold uppercase tracking-widest">
                {isSubmitting ? t("processing") : t("stamp_paid")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Invoice Confirmation Modal */}
      <AlertDialog open={!!invoiceToDelete} onOpenChange={() => setInvoiceToDelete(null)}>
        <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-zinc-50 font-bold tracking-tight">{t("void_delete")}</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-zinc-400 text-xs font-medium mt-2">
              {t("void_desc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest">{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteInvoice} className="bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:hover:bg-rose-700 text-xs font-bold uppercase tracking-widest border-none">
              {t("yes_delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardPageShell>
  );
}
