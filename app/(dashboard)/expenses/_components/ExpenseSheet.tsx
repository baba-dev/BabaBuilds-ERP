"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Loader2, Paperclip, Sparkles, TriangleAlert, UploadCloud, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PRESET_CATEGORIES } from "@/lib/expenses/categories";
import { EMPTY_EXPENSE_GST, ExpenseGstFields, gstPayload, gstStateFromExpense, type ExpenseGstState } from "./ExpenseGstFields";
import { api, money, shortDate, type ApiFail, type ExpenseRow } from "./shared";

const field = "h-10";
const select = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ExpenseSheet({ open, onOpenChange, expense, isIndia, supplierState, currency, locale, extraCategories, vendors, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; expense: ExpenseRow | null; isIndia: boolean; supplierState: string | null; currency: string; locale: string;
  extraCategories: string[]; vendors: string[]; onSaved: () => void;
}) {
  const t = useTranslations("ExpensesLedger");
  const tc = useTranslations("Expenses");
  const isEdit = Boolean(expense);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [vendor, setVendor] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [gst, setGst] = useState<ExpenseGstState>(EMPTY_EXPENSE_GST);
  const [file, setFile] = useState<File | null>(null);
  const [removeReceipt, setRemoveReceipt] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dups, setDups] = useState<NonNullable<ApiFail["existing"]>>([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({}); setDups([]); setFile(null); setRemoveReceipt(false);
    if (expense) {
      setDate(format(new Date(expense.date), "yyyy-MM-dd")); setVendor(expense.vendor); setCategory(expense.category); setAmount(String(expense.amount)); setDescription(expense.description ?? "");
      setGst(gstStateFromExpense(expense));
    } else {
      setDate(format(new Date(), "yyyy-MM-dd")); setVendor(""); setCategory(""); setAmount(""); setDescription(""); setGst(EMPTY_EXPENSE_GST);
    }
    setTimeout(() => firstRef.current?.focus(), 120);
  }, [open, expense]);

  const clear = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  const err = (code: string) => (t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.INVALID"));
  const catLabel = (value: string) => { const p = PRESET_CATEGORIES.find((c) => c.value === value); return p ? tc(`cat_${p.key}` as never) : value; };

  async function scan(f: File) {
    setFile(f);
    if (!f.type.startsWith("image/")) return;
    setScanning(true);
    const fd = new FormData(); fd.append("receipt", f);
    const r = await api<{ vendor?: string; amount?: number | string; date?: string; category?: string; description?: string; gst?: { itcStatus: ExpenseGstState["itcStatus"]; vendorGstin?: string; vendorInvoiceNo?: string; hsnCode?: string; gstRate?: number } }>("/api/expenses/scan", { method: "POST", body: fd });
    setScanning(false);
    if (!r.ok) { toast.error(r.data.error ?? t("scan.failed")); return; }
    if (r.data.vendor) setVendor(r.data.vendor);
    if (r.data.amount) setAmount(String(r.data.amount));
    if (r.data.date) setDate(r.data.date);
    if (r.data.category) setCategory(r.data.category);
    if (r.data.description) setDescription(r.data.description);
    if (isIndia && r.data.gst) { setGst({ ...EMPTY_EXPENSE_GST, itcStatus: r.data.gst.itcStatus, vendorGstin: r.data.gst.vendorGstin ?? "", vendorInvoiceNo: r.data.gst.vendorInvoiceNo ?? "", hsnCode: r.data.gst.hsnCode ?? "", gstRate: String(r.data.gst.gstRate ?? 18) }); toast.info(tc("gst.scanned")); }
    toast.success(t("scan.done"));
  }

  async function submit(force = false) {
    setBusy(true); setErrors({}); setDups([]);
    const gstBody = isIndia ? gstPayload(gst) : undefined;
    let res;
    if (isEdit) {
      const common = { date, vendor, category, amount, description, ...(gstBody ? { gst: gstBody } : {}) };
      if (file || removeReceipt) {
        const fd = new FormData();
        Object.entries({ date, vendor, category, amount, description }).forEach(([k, v]) => fd.append(k, v));
        if (gstBody) fd.append("gst", JSON.stringify(gstBody));
        if (file) fd.append("receipt", file); else fd.append("removeReceipt", "true");
        res = await api(`/api/expenses/${expense!.id}`, { method: "PATCH", body: fd });
      } else res = await api(`/api/expenses/${expense!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(common) });
    } else {
      const fd = new FormData();
      Object.entries({ date, vendor, category: category || "Other", amount, description }).forEach(([k, v]) => fd.append(k, v));
      if (gstBody && (gstBody.itcStatus !== "NONE" || gstBody.vendorMsme !== "NONE" || gstBody.paymentStatus === "UNPAID" || gstBody.vendorInvoiceNo)) {
        fd.append("itcStatus", gstBody.itcStatus); fd.append("paymentStatus", gstBody.paymentStatus);
        if (gstBody.vendorGstin) fd.append("vendorGstin", gstBody.vendorGstin);
        if (gstBody.vendorInvoiceNo) fd.append("vendorInvoiceNo", gstBody.vendorInvoiceNo);
        if (gstBody.hsnCode) fd.append("hsnCode", gstBody.hsnCode);
        if (gstBody.gstRate !== null) fd.append("gstRate", String(gstBody.gstRate));
        if (gstBody.vendorMsme !== "NONE") { fd.append("vendorMsme", gstBody.vendorMsme); if (gstBody.vendorUdyam) fd.append("vendorUdyam", gstBody.vendorUdyam); if (gstBody.vendorAgreedDays) fd.append("vendorAgreedDays", String(gstBody.vendorAgreedDays)); }
      }
      if (file) fd.append("receipt", file);
      if (force) fd.append("force", "true");
      res = await api("/api/expenses", { method: "POST", body: fd });
    }
    setBusy(false);
    if (res.ok) { toast.success(isEdit ? t("toast.updated") : t("toast.created")); onOpenChange(false); onSaved(); return; }
    if (res.data.code === "VALIDATION" && res.data.fields) {
      const map: Record<string, string> = {};
      for (const f of res.data.fields) map[f.field] = err(f.code);
      setErrors(map); toast.error(t("toast.fix")); return;
    }
    if (res.data.code === "EXPENSE_DUPLICATE") { setDups(res.data.existing ?? []); return; }
    toast.error(res.data.error ?? t("toast.failed"));
  }

  const Err = ({ k }: { k: string }) => (errors[k] ? <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors[k]}</p> : null);
  const cats = [...PRESET_CATEGORIES.map((c) => c.value as string), ...extraCategories];
  const unknownCat = category && !cats.includes(category);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-0 sm:max-w-lg">
        <SheetHeader className="border-b p-5">
          <SheetTitle>{isEdit ? t("form.editTitle") : t("form.newTitle")}</SheetTitle>
          <SheetDescription>{t("form.description")}</SheetDescription>
        </SheetHeader>
        <form onSubmit={(e) => { e.preventDefault(); void submit(false); }} className="flex-1 space-y-5 p-5" noValidate>
          {dups.length > 0 && (
            <div role="alert" className="flex gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
              <div className="space-y-2">
                <p className="font-medium">{t("form.duplicate")}</p>
                <ul className="text-xs text-muted-foreground">{dups.map((d) => <li key={d.id}>{d.vendor} · {money(d.amount, currency, locale)} · {shortDate(d.date, locale)}</li>)}</ul>
                <Button type="button" size="sm" variant="outline" onClick={() => void submit(true)} disabled={busy}>{t("form.saveAnyway")}</Button>
              </div>
            </div>
          )}

          <div>
            <Label className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">{tc("upload_receipt")}<span className="inline-flex items-center gap-1 rounded-full bg-purple-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-purple-700 dark:text-purple-300"><Sparkles className="size-3" aria-hidden />{tc("ai_autofill")}</span></Label>
            <label htmlFor="expense-receipt" className={`flex h-24 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed text-center transition-colors ${scanning ? "border-purple-400 bg-purple-500/10" : "border-border hover:bg-muted/50"}`}>
              {scanning ? (<><Sparkles className="mb-1 size-5 animate-pulse text-purple-500" aria-hidden /><span className="text-xs font-semibold text-purple-600 dark:text-purple-400">{tc("extracting")}</span></>) : (<><UploadCloud className="mb-1 size-5 text-muted-foreground" aria-hidden /><span className="px-3 text-xs text-muted-foreground">{file ? file.name : expense?.receiptUrl && !removeReceipt ? t("form.replaceReceipt") : tc("click_upload")}</span></>)}
              <input id="expense-receipt" type="file" className="sr-only" accept=".pdf,image/png,image/jpeg,image/webp" disabled={scanning} onChange={(e) => { const f = e.target.files?.[0]; if (f) { setRemoveReceipt(false); void scan(f); } }} />
            </label>
            {isEdit && expense?.receiptUrl && !file && (
              <div className="mt-2 flex items-center justify-between text-xs">
                <a href={expense.receiptUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-indigo-600 hover:underline dark:text-indigo-400"><Paperclip className="size-3.5" aria-hidden />{t("form.viewReceipt")}</a>
                <button type="button" className="inline-flex items-center gap-1 text-muted-foreground hover:text-rose-600" onClick={() => setRemoveReceipt((v) => !v)}><X className="size-3.5" aria-hidden />{removeReceipt ? t("form.keepReceipt") : t("form.removeReceipt")}</button>
              </div>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ex-vendor" className="mb-1.5 block text-xs font-medium text-muted-foreground">{tc("vendor")} *</Label>
              <Input id="ex-vendor" ref={firstRef} list="expense-vendors" className={field} value={vendor} maxLength={120} onChange={(e) => { setVendor(e.target.value); clear("vendor"); }} placeholder={tc("vendor_ph")} aria-invalid={Boolean(errors.vendor)} autoComplete="off" />
              <datalist id="expense-vendors">{vendors.map((v) => <option key={v} value={v} />)}</datalist>
              <Err k="vendor" />
            </div>
            <div>
              <Label htmlFor="ex-amount" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("form.amount", { currency })} *</Label>
              <Input id="ex-amount" inputMode="decimal" className={`${field} tabular-nums`} value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, "")); clear("amount"); }} placeholder="0.00" aria-invalid={Boolean(errors.amount)} />
              <Err k="amount" />
            </div>
            <div>
              <Label htmlFor="ex-date" className="mb-1.5 block text-xs font-medium text-muted-foreground">{tc("date_purchase")} *</Label>
              <Input id="ex-date" type="date" className={`${field} dark:[color-scheme:dark]`} value={date} onChange={(e) => { setDate(e.target.value); clear("date"); }} aria-invalid={Boolean(errors.date)} />
              <Err k="date" />
            </div>
            <div>
              <Label htmlFor="ex-cat" className="mb-1.5 block text-xs font-medium text-muted-foreground">{tc("category")} *</Label>
              <select id="ex-cat" className={select} value={category} onChange={(e) => { setCategory(e.target.value); clear("category"); }} aria-invalid={Boolean(errors.category)}>
                <option value="">{tc("select_category")}</option>
                {unknownCat && <option value={category}>{category}</option>}
                {cats.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
              <Err k="category" />
            </div>
          </div>
          <div>
            <Label htmlFor="ex-desc" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("form.notes")}</Label>
            <Textarea id="ex-desc" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("form.notesHint")} />
            <Err k="description" />
          </div>

          {isIndia ? <ExpenseGstFields value={gst} onChange={setGst} amount={Number(amount.replace(/,/g, "")) || 0} supplierState={supplierState} /> : null}

          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col-reverse gap-2 border-t bg-background/95 p-4 backdrop-blur sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{tc("cancel")}</Button>
            <Button type="submit" disabled={busy || scanning}>{busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{isEdit ? tc("save_changes") : tc("log_btn")}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
