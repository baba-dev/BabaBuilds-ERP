"use client";

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { UploadCloud, TrendingDown, Wallet, ShieldCheck, FileText, ArrowRight, Sparkles, Trash2, Edit } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useTranslations } from "next-intl";
import { useFormat } from "@/hooks/use-format";
import { getCurrencySymbol } from "@/lib/currency";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { ColumnVisibilityToggle, DataTable, DataTablePagination, DataTableToolbar, RowActionsMenu, useUrlTableState, type DataTableColumnDef } from "@/components/data-table";
import type { ApiEnvelope, ExpenseDto, InvoiceDto } from "@/lib/types/business";

export default function ExpenseTracker() {
  const t = useTranslations('Expenses');
  const { fCurrency, currency, locale } = useFormat();
  const currencySymbol = getCurrencySymbol(currency, locale);
  const [expenses, setExpenses] = useState<ExpenseDto[]>([]);
  const [totalRevenue, setTotalRevenue] = useState(0); // This stays to power the KPIs
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // --- NEW: PAGINATION STATE ---
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Form State
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [category, setCategory] = useState("");
  const [vendor, setVendor] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Edit & Delete State
  const [expenseToDelete, setExpenseToDelete] = useState<string | null>(null);
  const [expenseToEdit, setExpenseToEdit] = useState<ExpenseDto | null>(null);
  const [editForm, setEditForm] = useState({ date: "", category: "", vendor: "", amount: "", description: "" });
  const [isEditing, setIsEditing] = useState(false);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["date", "vendor", "category", "amount", "actions"]);
  const tableState = useUrlTableState("expenses");

  const toSafeNumber = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  useEffect(() => {
    fetchData(currentPage);
  }, [currentPage]);

  // Fetches paginated expenses but still gets all invoices for the KPI cards
  const fetchData = async (page = 1) => {
    setIsLoading(true);
    setFetchError(null);
    try {
      // Fetch paginated expenses
      const expRes = await fetch(`/api/expenses?page=${page}&limit=15`);
      const { data, meta } = (await expRes.json()) as ApiEnvelope<ExpenseDto[]>;
      const normalizedExpenses = Array.isArray(data)
        ? data.map((exp) => ({ ...exp, amount: toSafeNumber(exp.amount) }))
        : [];
      setExpenses(normalizedExpenses);
      setTotalPages(meta.totalPages);
      setCurrentPage(meta.currentPage);

      // Fetch all invoices for revenue calculation (as per original logic)
      const invRes = await fetch('/api/invoices');
      const invData = (await invRes.json()) as { data?: InvoiceDto[]; error?: string } | InvoiceDto[];
      // NOTE: This is fetching all invoices. To make KPIs truly scalable, this would also need a summary API.
      if (Array.isArray(invData)) {
         const normalizedRevenue = invData.reduce((sum: number, inv: InvoiceDto) => sum + toSafeNumber(inv.totalAmount), 0);
         setTotalRevenue(normalizedRevenue);
      } else if (!invData.error && Array.isArray(invData.data)) {
         const revenueSource = invData.data;
         const normalizedRevenue = revenueSource.reduce((sum: number, inv: InvoiceDto) => sum + toSafeNumber(inv.totalAmount), 0);
         setTotalRevenue(normalizedRevenue);
      }
    } catch (err) {
      console.error("Failed to load financial data");
      setFetchError("Failed to load financial data.");
      toast.error("Failed to load financial data.");
    } finally {
      setIsLoading(false);
    }
  };

  const totalExpenses = expenses.reduce((sum, exp) => sum + toSafeNumber(exp.amount), 0);
  const normalizedRevenue = toSafeNumber(totalRevenue);
  const presumptiveExpenses = normalizedRevenue * 0.5; 
  const actualProfit = normalizedRevenue - totalExpenses;
  const taxFreeAlpha = Math.max(0, presumptiveExpenses - totalExpenses);
  const burnPercentage = normalizedRevenue > 0 && presumptiveExpenses > 0 ? (totalExpenses / presumptiveExpenses) * 100 : 0;
  const filteredExpenses = expenses.filter((exp) =>
    `${exp.vendor} ${exp.category} ${exp.description ?? ""}`.toLowerCase().includes(tableState.search.toLowerCase()),
  );

  const expenseColumns: DataTableColumnDef<ExpenseDto>[] = [
    {
      id: "date",
      header: t("col_date"),
      sortable: true,
      sortAccessor: (row) => new Date(row.date).getTime(),
      cell: (row) => <span className="text-sm dark:text-zinc-300">{format(new Date(row.date), "dd MMM yyyy")}</span>,
      hideable: true,
    },
    {
      id: "vendor",
      header: t("col_vendor"),
      sortable: true,
      accessor: (row) => row.vendor,
      cell: (row) => <span className="font-medium text-zinc-900 dark:text-zinc-100">{row.vendor}</span>,
      hideable: true,
    },
    {
      id: "category",
      header: t("col_category"),
      accessor: (row) => row.category,
      cell: (row) => (
        <Badge variant="secondary" className="bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 font-normal hover:bg-zinc-100 dark:hover:bg-zinc-800 border-none">
          {row.category}
        </Badge>
      ),
      hideable: true,
    },
    {
      id: "amount",
      header: t("col_amount", { currency }),
      headerClassName: "text-right",
      className: "text-right font-medium text-rose-600 dark:text-rose-400",
      sortable: true,
      sortAccessor: (row) => row.amount,
      cell: (row) => fCurrency(row.amount),
      hideable: true,
    },
    {
      id: "actions",
      header: <div className="text-right">{t("col_actions")}</div>,
      className: "text-right",
      cell: (row) => (
        <div className="flex justify-end gap-1">
          {row.receiptUrl && (
            <Button variant="ghost" size="sm" className="w-8 px-0 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10" asChild title="View Receipt">
              <a href={row.receiptUrl} target="_blank" rel="noopener noreferrer">
                <FileText className="w-4 h-4" />
              </a>
            </Button>
          )}
          <RowActionsMenu
            row={row}
            actions={[
              { label: "Edit", onClick: openEditModal, icon: <Edit className="mr-2 h-4 w-4" /> },
              { label: "Delete", onClick: (r) => setExpenseToDelete(r.id), variant: "danger", icon: <Trash2 className="mr-2 h-4 w-4" /> },
            ]}
          />
        </div>
      ),
    },
  ];

  const handleScanReceipt = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setIsScanning(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('receipt', file);
      const res = await fetch('/api/expenses/scan', { method: 'POST', body: formData });
      if (!res.ok) throw new Error("AI could not read the receipt. Please enter manually.");
      const data = await res.json();
      if (data.vendor) setVendor(data.vendor);
      if (data.amount) setAmount(data.amount.toString());
      if (data.date) setDate(data.date); 
      if (data.category) setCategory(data.category);
      if (data.description) setDescription(data.description);
    } catch (err: unknown) {
      console.error("Scan error:", err);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('date', date);
      formData.append('category', category);
      formData.append('vendor', vendor);
      formData.append('amount', amount);
      formData.append('description', description);
      if (receiptFile) formData.append('receipt', receiptFile);

      const res = await fetch('/api/expenses', { method: 'POST', body: formData });
      if (!res.ok) throw new Error("Failed to log expense");

      setVendor(""); setAmount(""); setDescription(""); setCategory(""); setReceiptFile(null);
      const fileInput = document.getElementById('receipt') as HTMLInputElement;
      if (fileInput) fileInput.value = "";
      fetchData(currentPage); 
      toast.success("Expense logged successfully!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to log expense");
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!expenseToDelete) return;
    const toastId = toast.loading("Deleting expense...");
    try {
      const res = await fetch(`/api/expenses/${expenseToDelete}`, { method: 'DELETE' });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("Expense deleted permanently.", { id: toastId });
      fetchData(currentPage);
    } catch (err) {
      toast.error("Failed to delete expense.", { id: toastId });
    } finally {
      setExpenseToDelete(null);
    }
  };

  const openEditModal = (exp: ExpenseDto) => {
    setExpenseToEdit(exp);
    setEditForm({
      date: format(new Date(exp.date), 'yyyy-MM-dd'),
      category: exp.category,
      vendor: exp.vendor,
      amount: exp.amount.toString(),
      description: exp.description || ""
    });
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!expenseToEdit) return;
    setIsEditing(true);
    const toastId = toast.loading("Updating expense...");
    try {
      const res = await fetch(`/api/expenses/${expenseToEdit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      if (!res.ok) throw new Error("Failed to update");
      toast.success("Expense updated successfully.", { id: toastId });
      setExpenseToEdit(null);
      fetchData(currentPage);
    } catch (err) {
      toast.error("Failed to update expense.", { id: toastId });
    } finally {
      setIsEditing(false);
    }
  };

  return (
    <DashboardPageShell
      title={t('title')}
      description={t('description')}
      animated={false}
    >

        {/* 44ADA Intelligence Ribbon */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="shadow-sm border-emerald-200 dark:border-emerald-900/50 bg-emerald-50/30 dark:bg-emerald-950/20">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-semibold text-emerald-800 dark:text-emerald-400">{t('actual_profit')}</CardTitle>
              <Wallet className="h-4 w-4 text-emerald-600 dark:text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-900 dark:text-emerald-50">{fCurrency(actualProfit)}</div>
              <p className="text-xs text-emerald-600 dark:text-emerald-400/80 mt-1">{t('actual_profit_desc')}</p>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-zinc-500 dark:text-zinc-400">{t('sunk_expenses')}</CardTitle>
              <TrendingDown className="h-4 w-4 text-rose-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">{fCurrency(totalExpenses)}</div>
              <div className="mt-4 space-y-2">
                <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                  <span>{t('presumptive_label')}</span>
                  <span>{fCurrency(presumptiveExpenses)}</span>
                </div>
                <Progress value={Math.min(burnPercentage, 100)} className="h-2 bg-zinc-100 dark:bg-zinc-800 [&>div]:bg-rose-500" />
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-sm border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/50 dark:bg-indigo-950/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 dark:opacity-5 text-indigo-900 dark:text-indigo-300"><ShieldCheck className="w-24 h-24" /></div>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-semibold text-indigo-800 dark:text-indigo-400">{t('tax_free_alpha')}</CardTitle>
              <ShieldCheck className="h-4 w-4 text-indigo-600 dark:text-indigo-500 relative z-10" />
            </CardHeader>
            <CardContent className="relative z-10">
              <div className="text-2xl font-bold text-indigo-900 dark:text-indigo-50">{fCurrency(taxFreeAlpha)}</div>
              <p className="text-xs font-medium text-indigo-700/80 dark:text-indigo-400/80 mt-1 leading-tight">
                {t('tax_free_alpha_desc')}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Split Layout: Form & Ledger */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT: Data Entry Form */}
          <div className="lg:col-span-4">
            <Card className="shadow-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 sticky top-8">
              <CardHeader className="bg-white dark:bg-zinc-900 border-b dark:border-zinc-800 pb-6 rounded-t-xl">
                <CardTitle className="text-xl dark:text-zinc-50">{t('log_expense')}</CardTitle>
                <CardDescription className="dark:text-zinc-400">{t('log_desc')}</CardDescription>
              </CardHeader>
              <form onSubmit={handleSubmit} className="bg-zinc-50/50 dark:bg-zinc-950/50">
                <CardContent className="space-y-4 pt-6">
                  {error && <div className="p-3 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-sm rounded-md border border-red-200 dark:border-red-900/50">{error}</div>}

                  <div className="space-y-2 pb-2">
                    <Label className="flex items-center gap-2 dark:text-zinc-300">
                      {t('upload_receipt')}
                      <Badge className="bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 border-none px-1.5 py-0 text-xs uppercase tracking-widest">{t('ai_autofill')}</Badge>
                    </Label>
                    <div className="relative flex items-center justify-center w-full">
                      <label 
                        htmlFor="receipt" 
                        className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-all ${
                          isScanning ? 'border-purple-400 dark:border-purple-500/50 bg-purple-50 dark:bg-purple-500/10' : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900'
                        }`}
                      >
                        <div className="flex flex-col items-center justify-center pt-5 pb-6">
                          {isScanning ? (
                            <>
                              <Sparkles className="w-6 h-6 mb-2 text-purple-500 animate-pulse" />
                              <p className="text-xs text-purple-600 dark:text-purple-400 font-bold">{t('extracting')}</p>
                            </>
                          ) : (
                            <>
                              <UploadCloud className="w-6 h-6 mb-2 text-zinc-400 dark:text-zinc-500" />
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                                {receiptFile ? receiptFile.name : t('click_upload')}
                              </p>
                            </>
                          )}
                        </div>
                        <input id="receipt" type="file" className="hidden" accept=".pdf,image/*" onChange={handleScanReceipt} disabled={isScanning} />
                      </label>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300">{t('date_purchase')}</Label>
                    <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className="bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100 dark:[color-scheme:dark]" />
                  </div>

                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300">{t('vendor')}</Label>
                    <Input placeholder={t('vendor_ph')} value={vendor} onChange={(e) => setVendor(e.target.value)} required className="bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100" />
                  </div>

                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300">{t('category')}</Label>
                    <Select value={category} onValueChange={setCategory} required>
                      <SelectTrigger className="bg-white dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100">
                        <SelectValue placeholder={t('select_category')} />
                      </SelectTrigger>
                      <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                        <SelectItem value="Hosting & Cloud">{t('cat_hosting')}</SelectItem>
                        <SelectItem value="Software Subscriptions">{t('cat_software')}</SelectItem>
                        <SelectItem value="Hardware & Equipment">{t('cat_hardware')}</SelectItem>
                        <SelectItem value="Internet & Utilities">{t('cat_internet')}</SelectItem>
                        <SelectItem value="Sub-contractors">{t('cat_contractors')}</SelectItem>
                        <SelectItem value="Office & Rent">{t('cat_office')}</SelectItem>
                        <SelectItem value="Meals & Entertainment">{t('cat_meals')}</SelectItem>
                        <SelectItem value="Other">{t('cat_other')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label className="dark:text-zinc-300">{t('amount', { currency })}</Label>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-zinc-500 dark:text-zinc-400 font-medium">{currencySymbol}</span>
                      <Input type="number" step="0.01" min="1" placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} required className="pl-7 bg-white dark:bg-zinc-950 dark:border-zinc-800 font-medium dark:text-zinc-100" />
                    </div>
                  </div>

                </CardContent>
                <CardFooter className="bg-white dark:bg-zinc-900 border-t dark:border-zinc-800 rounded-b-xl p-6">
                  <Button type="submit" className="w-full bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200" disabled={isSubmitting || isScanning}>
                    {isSubmitting ? t('saving') : t('log_btn')} <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </CardFooter>
              </form>
            </Card>
          </div>

          {/* RIGHT: The Ledger */}
          <div className="lg:col-span-8">
            <Card className="shadow-sm border-zinc-200 dark:border-zinc-800 h-full bg-white dark:bg-zinc-900 flex flex-col">
              <CardHeader>
                <CardTitle className="dark:text-zinc-50">{t('ledger_title')}</CardTitle>
                <CardDescription className="dark:text-zinc-400">{t('ledger_desc')}</CardDescription>
              </CardHeader>
              <CardContent className="p-0 sm:p-6 sm:pt-0 flex-1">
                <DataTableToolbar
                  searchValue={tableState.search}
                  onSearchChange={tableState.setSearch}
                  searchPlaceholder={t("vendor_ph")}
                  rightSlot={
                    <ColumnVisibilityToggle
                      options={expenseColumns
                        .filter((col) => col.hideable)
                        .map((col) => ({
                          id: col.id,
                          label: typeof col.header === "string" ? col.header : col.id,
                          visible: visibleColumns.includes(col.id),
                          onToggle: () =>
                            setVisibleColumns((prev) =>
                              prev.includes(col.id) ? prev.filter((existing) => existing !== col.id) : [...prev, col.id],
                            ),
                        }))}
                    />
                  }
                />
                <DataTable
                  columns={expenseColumns}
                  data={filteredExpenses}
                  rowId={(row) => row.id}
                  loading={isLoading}
                  error={fetchError}
                  onRetry={() => fetchData(currentPage)}
                  visibleColumnIds={visibleColumns}
                  emptyTitle={t("no_expenses")}
                  emptyDescription="Capture your first expense to start tracking burn and tax efficiency."
                />
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
          </div>

        </div>
      {/* EDIT EXPENSE MODAL */}
      <Dialog open={!!expenseToEdit} onOpenChange={(open) => !open && setExpenseToEdit(null)}>
        <DialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
          <DialogHeader>
            <DialogTitle className="dark:text-zinc-50 font-bold tracking-tight">{t('edit_title')}</DialogTitle>
            <DialogDescription className="dark:text-zinc-400 text-xs font-medium">{t('edit_desc')}</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleEditSubmit}>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('edit_date')}</Label>
                  <Input type="date" value={editForm.date} onChange={(e) => setEditForm({...editForm, date: e.target.value})} required className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-50 dark:[color-scheme:dark]" />
                </div>
                <div className="space-y-2">
                  <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('edit_amount', { currency })}</Label>
                  <Input type="number" step="0.01" min="1" value={editForm.amount} onChange={(e) => setEditForm({...editForm, amount: e.target.value})} required className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-50" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('edit_vendor')}</Label>
                <Input value={editForm.vendor} onChange={(e) => setEditForm({...editForm, vendor: e.target.value})} required className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-50" />
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('edit_category')}</Label>
                <Select value={editForm.category} onValueChange={(val) => setEditForm({...editForm, category: val})} required>
                  <SelectTrigger className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="dark:bg-zinc-900 dark:border-zinc-800">
                        <SelectItem value="Hosting & Cloud">{t('cat_hosting')}</SelectItem>
                        <SelectItem value="Software Subscriptions">{t('cat_software')}</SelectItem>
                        <SelectItem value="Hardware & Equipment">{t('cat_hardware')}</SelectItem>
                        <SelectItem value="Internet & Utilities">{t('cat_internet')}</SelectItem>
                        <SelectItem value="Sub-contractors">{t('cat_contractors')}</SelectItem>
                        <SelectItem value="Office & Rent">{t('cat_office')}</SelectItem>
                        <SelectItem value="Meals & Entertainment">{t('cat_meals')}</SelectItem>
                        <SelectItem value="Other">{t('cat_other')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="dark:text-zinc-300 text-xs font-bold uppercase tracking-wider">{t('edit_description')}</Label>
                <Input value={editForm.description} onChange={(e) => setEditForm({...editForm, description: e.target.value})} className="dark:bg-zinc-950 dark:border-zinc-800 dark:text-zinc-50" />
              </div>
            </div>
            <DialogFooter className="dark:border-zinc-800">
              <Button type="button" variant="outline" onClick={() => setExpenseToEdit(null)} className="dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest">{t('cancel')}</Button>
              <Button type="submit" disabled={isEditing} className="bg-indigo-600 hover:bg-indigo-700 text-white dark:bg-indigo-600 dark:hover:bg-indigo-700 text-xs font-bold uppercase tracking-widest border-none">
                {isEditing ? t('saving_changes') : t('save_changes')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DELETE EXPENSE CONFIRMATION */}
      <AlertDialog open={!!expenseToDelete} onOpenChange={() => setExpenseToDelete(null)}>
        <AlertDialogContent className="dark:bg-zinc-900 dark:border-zinc-800">
          <AlertDialogHeader>
            <AlertDialogTitle className="dark:text-zinc-50 font-bold tracking-tight">{t('delete_title')}</AlertDialogTitle>
            <AlertDialogDescription className="dark:text-zinc-400 text-xs font-medium mt-2">
              {t('delete_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800 text-xs font-bold uppercase tracking-widest">{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-rose-600 hover:bg-rose-700 text-white dark:bg-rose-600 dark:hover:bg-rose-700 text-xs font-bold uppercase tracking-widest border-none">
              {t('confirm_delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </DashboardPageShell>
  );
}
