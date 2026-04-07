"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { FileText, Clock, Download, AlertTriangle, PlusCircle, Send, Banknote, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import Link from "next/link";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

// MISSION CRITICAL: Globalization Imports
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { useTranslations } from "next-intl";
import { getBustedUrl } from "@/lib/cache-buster";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { ColumnVisibilityToggle, DataTable, DataTablePagination, DataTableToolbar, RowActionsMenu, useUrlTableState, type DataTableColumnDef } from "@/components/data-table";
import {
  DEFAULT_LEDGER_META,
  parseLedgerInvoicesResponse,
  resolveLedgerErrorToastMessage,
  resolveLedgerMalformedJsonToastMessage,
} from "./fetch-invoices-response";

export default function AuditDashboard() {
  const t = useTranslations('Ledger');
  const[invoices, setInvoices] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // --- NEW: PAGINATION STATE ---
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  
  // --- NEW: KPI STATE (now fetched from server) ---
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

  // Payment Modal State
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [amountReceived, setAmountReceived] = useState("");
  const [dateReceived, setDateReceived] = useState(format(new Date(), 'yyyy-MM-dd'));
  const[isSubmitting, setIsSubmitting] = useState(false);
  
  // Resend Email State
  const[resendingId, setResendingId] = useState<string | null>(null);

  // Delete Invoice State
  const[invoiceToDelete, setInvoiceToDelete] = useState<string | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["invoice", "date", "billed", "status", "received", "actions"]);
  const tableState = useUrlTableState("ledger");

  useEffect(() => {
    fetchInvoices(currentPage);
  },[currentPage]);

// --- SMART AI AUTO-FILL HOOK ---
  useEffect(() => {
    if (invoices.length === 0) return; 
    
    const aiPayload = sessionStorage.getItem('erp_ai_payload');
    if (aiPayload) {
      try {
        const { path, data, timestamp } = JSON.parse(aiPayload);
        const isFresh = (Date.now() - timestamp) < 10000;
        
        if (isFresh && data && path === '/ledger') {
          if (data.invoiceNumber || data.client) {
            const matchedInvoice = invoices.find(inv => 
              (data.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(data.invoiceNumber.toLowerCase())) ||
              (data.client && inv.clientName.toLowerCase().includes(data.client.toLowerCase()) && inv.status !== 'Paid')
            );
            
            if (matchedInvoice) {
              setSelectedInvoice(matchedInvoice);
              if (data.amount) setAmountReceived(data.amount.toString());
              if (data.date) setDateReceived(data.date);
              setPayModalOpen(true); 
            }
          }
        }
        sessionStorage.removeItem('erp_ai_payload');
      } catch(e) { 
        console.error("Failed to parse AI payload"); 
        toast.warning("AI auto-fill failed. Please fill the form manually.");
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
        toast.error(resolveLedgerMalformedJsonToastMessage());
        setInvoices([]);
        setKpis(DEFAULT_LEDGER_META.kpis);
        setTotalPages(DEFAULT_LEDGER_META.totalPages);
        return;
      }

      if (!res.ok) {
        toast.error(resolveLedgerErrorToastMessage(res.status, payload));
        setInvoices([]);
        setKpis(DEFAULT_LEDGER_META.kpis);
        setTotalPages(DEFAULT_LEDGER_META.totalPages);
        return;
      }

      const parsed = parseLedgerInvoicesResponse(payload);
      if (!parsed) {
        toast.error("Ledger response payload was malformed.");
        setInvoices([]);
        setKpis(DEFAULT_LEDGER_META.kpis);
        setTotalPages(DEFAULT_LEDGER_META.totalPages);
        return;
      }
      
      setInvoices(parsed.data);
      setKpis(parsed.meta.kpis);
      setTotalPages(parsed.meta.totalPages);
      setCurrentPage(parsed.meta.currentPage);

    } catch (error) {
      console.error("Failed to load ledger");
      toast.error("Failed to load ledger data.");
      setInvoices([]); 
      setKpis(DEFAULT_LEDGER_META.kpis);
      setTotalPages(DEFAULT_LEDGER_META.totalPages);
    } finally {
      setIsLoading(false);
    }
  };

  // --- KPI CALCULATIONS (Now read from state) ---
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
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountReceived, dateReceived }),
      });

      if (res.ok) {
        setPayModalOpen(false);
        toast.success("Payment logged successfully.");
        fetchInvoices(currentPage); // Refresh the current page
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || "Failed to log payment.");
      }
    } catch (error) {
      console.error("Payment logging failed");
      toast.error("A network error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResendEmail = async (invoice: any) => {
    setResendingId(invoice.id);
    const toastId = toast.loading(`Sending invoice ${invoice.invoiceNumber}...`);
    try {
      const res = await fetch(`/api/invoices/${invoice.id}/resend`, { method: 'POST' });
      const data = await res.json();
      
      if (res.ok) {
        toast.success("Email sent successfully!", { id: toastId });
      } else {
        toast.error(data.error || "Failed to send email.", { id: toastId });
      }
    } catch (error) {
      toast.error("A network error occurred.", { id: toastId });
    } finally {
      setResendingId(null);
    }
  };

  const openPayModal = (invoice: any) => {
    setSelectedInvoice(invoice);
    setAmountReceived(invoice.totalAmount.toString()); 
    setPayModalOpen(true);
  };

  const confirmDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    const toastId = toast.loading("Deleting invoice...");
    try {
      const res = await fetch(`/api/invoices/${invoiceToDelete}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Invoice voided and deleted.", { id: toastId });
      fetchInvoices(currentPage); // Refresh the current page
    } catch (err) {
      toast.error("Failed to delete invoice.", { id: toastId });
    } finally {
      setInvoiceToDelete(null);
    }
  };

  // Safe Format Date helper
  const safeDateFormat = (dateFormat ?? "dd/MM/yyyy").replace(/D/g, 'd').replace(/Y/g, 'y');
  const filteredInvoices = invoices.filter((inv) =>
    `${inv.invoiceNumber} ${inv.clientName ?? ""} ${inv.status}`.toLowerCase().includes(tableState.search.toLowerCase()),
  );
  const invoiceColumns: DataTableColumnDef<any>[] = [
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
          <Button variant="outline" size="sm" onClick={() => handleResendEmail(row)} disabled={resendingId === row.id} className="bg-white dark:bg-zinc-950 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-700 dark:hover:text-indigo-400 dark:border-zinc-800 transition-colors w-9 px-0 flex justify-center" title="Resend Invoice to Client via Email">
            <Send className={`w-3.5 h-3.5 ${resendingId === row.id ? "animate-pulse text-indigo-400" : ""}`} />
          </Button>
          <Button variant="secondary" size="sm" asChild title="Download PDF" className="dark:bg-zinc-800 dark:hover:bg-zinc-700 w-9 px-0 flex justify-center">
            <a href={getBustedUrl(row.pdfPath, row.updatedAt)} target="_blank" rel="noopener noreferrer">
              <Download className="h-3.5 w-3.5 dark:text-zinc-200" />
            </a>
          </Button>
          <RowActionsMenu row={row} actions={[{ label: "Delete", onClick: (r) => setInvoiceToDelete(r.id), variant: "danger", icon: <Trash2 className="mr-2 h-4 w-4" /> }]} />
        </div>
      ),
    },
  ];

  return (
    <DashboardPageShell
      title={t('title')}
      description={t('description')}
      animated={false}
    >

        {/* Executive KPI Ribbon */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{t('gross_billed')}</CardTitle>
              <Banknote className="h-4 w-4 text-zinc-400 dark:text-zinc-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold dark:text-zinc-50">{fCurrency(totalRevenue)}</div>
              
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs font-bold uppercase tracking-widest">
                  <span className="text-zinc-500 dark:text-zinc-400 flex items-center gap-1">
                    {isNearThreshold && <AlertTriangle className="h-3 w-3 text-amber-500" />}
                    {taxLabel} {t('tax_threshold', { taxLabel: '' }).replace('{taxLabel} ', '')}
                  </span>
                  <span className="dark:text-zinc-300">{compliancePercentage.toFixed(1)}%</span>
                </div>
                <Progress value={compliancePercentage} className="h-2 bg-zinc-100 dark:bg-zinc-800" />
                <p className="text-xs font-bold text-zinc-400 dark:text-zinc-500 text-right uppercase tracking-widest">{t('limit', { amount: fCurrency(thresholdValue) })}</p>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-widest">{t('outstanding')}</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-500">{fCurrency(outstanding)}</div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium">{t('outstanding_desc')}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-xs font-bold text-indigo-700 dark:text-indigo-400 uppercase tracking-widest">{t('est_realized')}</CardTitle>
              <FileText className="h-4 w-4 text-indigo-600 dark:text-indigo-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-50">{fCurrency(presumptiveIncome)}</div>
              <p className="text-xs text-indigo-600/80 dark:text-indigo-400/80 mt-1 font-medium">{t('presumptive_desc')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Invoice Ledger Table */}
        <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 overflow-hidden">
          <CardHeader className="border-b dark:border-zinc-800">
            <CardTitle className="text-sm font-bold uppercase tracking-wider dark:text-zinc-50">{t('invoice_ledger')}</CardTitle>
            <CardDescription className="text-xs dark:text-zinc-400 font-medium">{t('ledger_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="p-0 sm:p-6 sm:pt-0">
            <DataTableToolbar
              searchValue={tableState.search}
              onSearchChange={tableState.setSearch}
              searchPlaceholder={t("col_invoice_no")}
              rightSlot={
                <ColumnVisibilityToggle
                  options={invoiceColumns.filter((col) => col.hideable).map((col) => ({
                    id: col.id,
                    label: typeof col.header === "string" ? col.header : col.id,
                    visible: visibleColumns.includes(col.id),
                    onToggle: () => setVisibleColumns((prev) => prev.includes(col.id) ? prev.filter((id) => id !== col.id) : [...prev, col.id]),
                  }))}
                />
              }
            />
            <DataTable
              columns={invoiceColumns}
              data={filteredInvoices}
              rowId={(row) => row.id}
              loading={isLoading}
              emptyTitle={t("no_entries")}
              emptyDescription={t("no_entries_desc")}
              visibleColumnIds={visibleColumns}
            />
            {filteredInvoices.length === 0 && !isLoading && (
              <div className="pb-4 text-center">
                <Button asChild className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 border-none font-bold text-xs uppercase tracking-wider">
                  <Link href="/invoice">
                    <PlusCircle className="w-3.5 h-3.5 mr-2" />
                    {t("generate_first")}
                  </Link>
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

        {/* Payment Logging Modal */}
        <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
          <DialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
            <DialogHeader>
              <DialogTitle className="dark:text-zinc-50 font-bold tracking-tight text-xl">{t('log_remittance')}</DialogTitle>
              <DialogDescription className="dark:text-zinc-400 text-xs font-medium">
                {t('log_remittance_desc', { currency, invoiceNumber: selectedInvoice?.invoiceNumber ?? '' })}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleMarkAsPaid}>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('actual_received', { currency })}</Label>
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
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 font-bold uppercase tracking-widest mt-1">{t('billed_amount', { amount: fCurrency(selectedInvoice?.totalAmount || 0) })}</p>
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('date_credited')}</Label>
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
                <Button type="button" variant="outline" onClick={() => setPayModalOpen(false)} className="dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest">{t('cancel')}</Button>
                <Button type="submit" disabled={isSubmitting} className="bg-emerald-600 hover:bg-emerald-700 text-white dark:bg-emerald-600 dark:hover:bg-emerald-700 border-none text-xs font-bold uppercase tracking-widest">
                  {isSubmitting ? t('processing') : t('stamp_paid')}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Delete Invoice Confirmation Modal */}
        <AlertDialog open={!!invoiceToDelete} onOpenChange={() => setInvoiceToDelete(null)}>
          <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="dark:text-zinc-50 font-bold tracking-tight">{t('void_delete')}</AlertDialogTitle>
              <AlertDialogDescription className="dark:text-zinc-400 text-xs font-medium mt-2">
                {t('void_desc')}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest">{t('cancel')}</AlertDialogCancel>
              <AlertDialogAction onClick={confirmDeleteInvoice} className="bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:hover:bg-rose-700 text-xs font-bold uppercase tracking-widest border-none">
                {t('yes_delete')}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

    </DashboardPageShell>
  );
}
