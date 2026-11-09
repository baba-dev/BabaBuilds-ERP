"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { format } from "date-fns";
import { Loader2, Paperclip, ShieldCheck, Sparkles, TriangleAlert, UploadCloud, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { suggestTds } from "@/lib/expenses/tds";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { PRESET_CATEGORIES } from "@/lib/expenses/categories";
import { EMPTY_EXPENSE_GST, ExpenseGstFields, gstPayload, gstStateFromExpense, type ExpenseGstState } from "./ExpenseGstFields";
import { api, money, shortDate, type ApiFail, type ExpenseRow, type ExpenseSettings, type VendorMeta } from "./shared";

const field = "h-10";
const select = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ExpenseSheet({ open, onOpenChange, expense, isIndia, supplierState, currency, locale, extraCategories, vendors, settings, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; expense: ExpenseRow | null; isIndia: boolean; supplierState: string | null; currency: string; locale: string;
  extraCategories: string[]; vendors: VendorMeta[]; settings: ExpenseSettings | null; onSaved: () => void;
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
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<"PAID" | "UNPAID">("PAID");
  const [dueDate, setDueDate] = useState("");
  const [billable, setBillable] = useState(false);
  const [clientId, setClientId] = useState("");
  const [markup, setMarkup] = useState("");
  const [clients, setClients] = useState<Array<{ id: string; name: string }>>([]);
  const [tdsRate, setTdsRate] = useState<number | null>(null);
  const [scanned, setScanned] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setErrors({}); setDups([]); setFile(null); setRemoveReceipt(false); setTdsRate(null); setScanned(false);
    setVendorId(expense?.vendorId ?? null); setPaymentStatus(expense?.paymentStatus ?? "PAID"); setDueDate(expense?.dueDate ? format(new Date(expense.dueDate), "yyyy-MM-dd") : "");
    setBillable(Boolean(expense?.billable)); setClientId(expense?.clientId ?? ""); setMarkup(expense?.markupPercent ? String(expense.markupPercent) : "");
    if (expense) {
      setDate(format(new Date(expense.date), "yyyy-MM-dd")); setVendor(expense.vendor); setCategory(expense.category); setAmount(String(expense.amount)); setDescription(expense.description ?? "");
      setGst(gstStateFromExpense(expense));
    } else {
      setDate(format(new Date(), "yyyy-MM-dd")); setVendor(""); setCategory(""); setAmount(""); setDescription(""); setGst(EMPTY_EXPENSE_GST);
    }
    setTimeout(() => firstRef.current?.focus(), 120);
  }, [open, expense]);

  useEffect(() => {
    if (!open || !billable || clients.length > 0) return;
    api<{ data: Array<{ id: string; name: string }> }>("/api/clients?picker=1&limit=50").then((r) => { if (r.ok && Array.isArray(r.data.data)) setClients(r.data.data); });
  }, [open, billable, clients.length]);

  const clear = (k: string) => setErrors((e) => { if (!e[k]) return e; const n = { ...e }; delete n[k]; return n; });
  const err = (code: string) => (t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.INVALID"));
  const catLabel = (value: string) => { const p = PRESET_CATEGORIES.find((c) => c.value === value); return p ? tc(`cat_${p.key}` as never) : value; };

  const termsDue = (from: string, days: number | null) => { if (!days || !from) return ""; const d = new Date(from); d.setDate(d.getDate() + days); return format(d, "yyyy-MM-dd"); };

  /** Typing or picking a known vendor fills what that vendor already knows, without overwriting what was entered. */
  function pickVendor(name: string) {
    setVendor(name); clear("vendor");
    const v = vendors.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    setVendorId(v?.id ?? null);
    if (!v) return;
    if (!category && v.defaultCategory) setCategory(v.defaultCategory);
    if (v.tdsRatePercent && !isEdit) setTdsRate(v.tdsRatePercent);
    if (isIndia) setGst((g) => ({ ...g, vendorGstin: g.vendorGstin || v.gstin || "", vendorMsme: g.vendorMsme === "NONE" && v.msmeClass && ["MICRO", "SMALL", "MEDIUM"].includes(v.msmeClass) ? (v.msmeClass as ExpenseGstState["vendorMsme"]) : g.vendorMsme, vendorUdyam: g.vendorUdyam || v.udyam || "" }));
    if (paymentStatus === "UNPAID" && !dueDate) setDueDate(termsDue(date, v.paymentTermsDays));
  }

  const knownVendor = vendors.find((x) => x.id === vendorId) ?? null;
  const tds = isEdit || !isIndia ? null : suggestTds({ category, amount: Number(amount.replace(/,/g, "")) || 0 });
  const tdsAmount = tdsRate ? Math.round(((Number(amount.replace(/,/g, "")) || 0) * tdsRate) / 100 * 100) / 100 : 0;
  const approvalNote = !isEdit && settings?.approvalRequired && !settings.canManage && (Number(amount.replace(/,/g, "")) || 0) >= settings.approvalThreshold;

  async function scan(f: File) {
    setFile(f);
    setScanning(true);
    const fd = new FormData(); fd.append("receipt", f);
    const r = await api<{ vendor?: string; amount?: number | string; date?: string; category?: string; description?: string; gst?: { itcStatus: ExpenseGstState["itcStatus"]; vendorGstin?: string; vendorInvoiceNo?: string; hsnCode?: string; gstRate?: number } }>("/api/expenses/scan", { method: "POST", body: fd });
    setScanning(false);
    if (!r.ok) { toast.error(r.data.error ?? t("scan.failed")); return; }
    setScanned(true);
    if (r.data.vendor) pickVendor(r.data.vendor);
    if (r.data.amount) setAmount(String(r.data.amount));
    if (r.data.date) setDate(r.data.date);
    if (r.data.category) setCategory(r.data.category);
    if (r.data.description) setDescription(r.data.description);
    if (isIndia && r.data.gst) { setGst({ ...EMPTY_EXPENSE_GST, itcStatus: r.data.gst.itcStatus, vendorGstin: r.data.gst.vendorGstin ?? "", vendorInvoiceNo: r.data.gst.vendorInvoiceNo ?? "", hsnCode: r.data.gst.hsnCode ?? "", gstRate: String(r.data.gst.gstRate ?? 18) }); toast.info(tc("gst.scanned")); }
    toast.success(t("scan.done"));
  }

  async function submit(force = false, asSubmit = false) {
    const submit = asSubmit;
    setBusy(true); setErrors({}); setDups([]);
    const gstBody = isIndia ? { ...gstPayload(gst), paymentStatus } : undefined;
    const extras: Record<string, string> = { paymentStatus, dueDate: paymentStatus === "UNPAID" ? dueDate : "", billable: String(billable), clientId: billable ? clientId : "", markupPercent: billable ? markup : "", vendorId: vendorId ?? "" };
    let res;
    if (isEdit) {
      const common = { date, vendor, category, amount, description, vendorId, dueDate: paymentStatus === "UNPAID" && dueDate ? dueDate : null, billable, clientId: billable ? clientId || null : null, markupPercent: billable && markup ? Number(markup) : null, ...(gstBody ? { gst: gstBody } : {}), ...(!isIndia ? { gst: { itcStatus: "NONE", paymentStatus } } : {}), ...(submit ? { submit: true } : {}) };
      if (file || removeReceipt) {
        const fd = new FormData();
        Object.entries({ date, vendor, category, amount, description }).forEach(([k, v]) => fd.append(k, v));
        fd.append("vendorId", vendorId ?? ""); fd.append("dueDate", paymentStatus === "UNPAID" ? dueDate : ""); fd.append("billable", String(billable)); fd.append("clientId", billable ? clientId : ""); fd.append("markupPercent", billable ? markup : ""); if (submit) fd.append("submit", "true");
        fd.append("gst", JSON.stringify(gstBody ?? { itcStatus: "NONE", paymentStatus }));
        if (file) fd.append("receipt", file); else fd.append("removeReceipt", "true");
        res = await api(`/api/expenses/${expense!.id}`, { method: "PATCH", body: fd });
      } else res = await api(`/api/expenses/${expense!.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(common) });
    } else {
      const fd = new FormData();
      Object.entries({ date, vendor, category: category || "Other", amount, description }).forEach(([k, v]) => fd.append(k, v));
      Object.entries(extras).forEach(([k, v]) => { if (v) fd.append(k, v); });
      if (scanned) fd.append("source", "SCAN");
      if (tdsRate && tds) { fd.append("withholdingRatePercent", String(tdsRate)); fd.append("withholdingDeductedAt", date); }
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
    if (res.ok) {
      const pending = (res.data as { approvalStatus?: string }).approvalStatus === "PENDING";
      toast.success(pending ? t("toast.sentForApproval") : isEdit ? t("toast.updated") : t("toast.created"));
      for (const a of (res.data as { budgetAlerts?: Array<{ category: string; state: string }> }).budgetAlerts ?? []) toast.warning(t(a.state === "OVER" ? "toast.budgetOver" : "toast.budgetNear", { category: a.category === "*" ? t("budgets.overall") : catLabel(a.category) }));
      onOpenChange(false); onSaved(); return;
    }
    if (res.data.code === "VALIDATION" && res.data.fields) {
      const map: Record<string, string> = {};
      for (const f of res.data.fields) map[f.field] = err(f.code);
      setErrors(map); toast.error(t("toast.fix")); return;
    }
    if (res.data.code === "EXPENSE_DUPLICATE") { setDups(res.data.existing ?? []); return; }
    toast.error(res.data.error ?? t("toast.failed"));
  }

  const fieldError = (k: string) => (errors[k] ? <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors[k]}</p> : null);
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
              <Input id="ex-vendor" ref={firstRef} list="expense-vendors" className={field} value={vendor} maxLength={120} onChange={(e) => pickVendor(e.target.value)} placeholder={tc("vendor_ph")} aria-invalid={Boolean(errors.vendor)} autoComplete="off" />
              <datalist id="expense-vendors">{vendors.map((v) => <option key={v.id} value={v.name} />)}</datalist>
              {fieldError("vendor")}
            </div>
            <div>
              <Label htmlFor="ex-amount" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("form.amount", { currency })} *</Label>
              <Input id="ex-amount" inputMode="decimal" className={`${field} tabular-nums`} value={amount} onChange={(e) => { setAmount(e.target.value.replace(/[^\d.,]/g, "")); clear("amount"); }} placeholder="0.00" aria-invalid={Boolean(errors.amount)} />
              {fieldError("amount")}
            </div>
            <div>
              <Label htmlFor="ex-date" className="mb-1.5 block text-xs font-medium text-muted-foreground">{tc("date_purchase")} *</Label>
              <Input id="ex-date" type="date" className={`${field} dark:[color-scheme:dark]`} value={date} onChange={(e) => { setDate(e.target.value); clear("date"); }} aria-invalid={Boolean(errors.date)} />
              {fieldError("date")}
            </div>
            <div>
              <Label htmlFor="ex-cat" className="mb-1.5 block text-xs font-medium text-muted-foreground">{tc("category")} *</Label>
              <select id="ex-cat" className={select} value={category} onChange={(e) => { setCategory(e.target.value); clear("category"); }} aria-invalid={Boolean(errors.category)}>
                <option value="">{tc("select_category")}</option>
                {unknownCat && <option value={category}>{category}</option>}
                {cats.map((c) => <option key={c} value={c}>{catLabel(c)}</option>)}
              </select>
              {fieldError("category")}
            </div>
          </div>
          <div>
            <Label htmlFor="ex-desc" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("form.notes")}</Label>
            <Textarea id="ex-desc" rows={2} maxLength={500} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("form.notesHint")} />
            {fieldError("description")}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ex-pay" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("form.payment")}</Label>
              <select id="ex-pay" className={select} value={paymentStatus} onChange={(e) => { const v = e.target.value as "PAID" | "UNPAID"; setPaymentStatus(v); if (v === "UNPAID" && !dueDate) setDueDate(termsDue(date, knownVendor?.paymentTermsDays ?? 30)); }}>
                <option value="PAID">{t("paid")}</option>
                <option value="UNPAID">{t("form.onCredit")}</option>
              </select>
            </div>
            {paymentStatus === "UNPAID" && (
              <div>
                <Label htmlFor="ex-due" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("form.dueDate")}</Label>
                <Input id="ex-due" type="date" className={`${field} dark:[color-scheme:dark]`} value={dueDate} onChange={(e) => { setDueDate(e.target.value); clear("dueDate"); }} aria-invalid={Boolean(errors.dueDate)} />
                {fieldError("dueDate")}
              </div>
            )}
          </div>

          {tds && !tdsRate && (
            <div className="flex items-start gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sky-600" aria-hidden />
              <div className="flex-1">
                <p className="font-medium">{t("tds.suggest", { code: tds.code, rate: tds.ratePercent, kind: t(`tds.kind.${tds.labelKey}` as never) })}</p>
                <p className="text-xs text-muted-foreground">{t(`tds.threshold.${tds.thresholdNote}` as never)} {t("tds.verify")}</p>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={() => setTdsRate(tds.ratePercent)}>{t("tds.apply")}</Button>
            </div>
          )}
          {tdsRate ? (
            <div className="flex items-center justify-between gap-3 rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 text-sm">
              <span>{t("tds.applied", { rate: tdsRate, amount: money(tdsAmount, currency, locale) })}</span>
              <Button type="button" size="sm" variant="ghost" onClick={() => setTdsRate(null)}>{t("tds.remove")}</Button>
            </div>
          ) : null}

          <div className="rounded-xl border p-3">
            <div className="flex items-center justify-between gap-3">
              <div><p className="text-sm font-medium">{t("billable.toggle")}</p><p className="text-xs text-muted-foreground">{t("billable.hint")}</p></div>
              <Switch checked={billable} onCheckedChange={setBillable} aria-label={t("billable.toggle")} disabled={Boolean(expense?.billedInvoiceId)} />
            </div>
            {billable && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="ex-client" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("billable.client")}</Label>
                  <select id="ex-client" className={select} value={clientId} onChange={(e) => { setClientId(e.target.value); clear("clientId"); }} disabled={Boolean(expense?.billedInvoiceId)} aria-invalid={Boolean(errors.clientId)}>
                    <option value="">{t("billable.choose")}</option>
                    {expense?.clientId && !clients.some((c) => c.id === expense.clientId) && <option value={expense.clientId}>{expense.clientName ?? expense.clientId}</option>}
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                  {fieldError("clientId")}
                </div>
                <div>
                  <Label htmlFor="ex-markup" className="mb-1.5 block text-xs font-medium text-muted-foreground">{t("billable.markupLabel")}</Label>
                  <Input id="ex-markup" inputMode="decimal" className={field} value={markup} onChange={(e) => setMarkup(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" disabled={Boolean(expense?.billedInvoiceId)} />
                </div>
                {expense?.billedInvoiceId && <p className="text-xs text-muted-foreground sm:col-span-2">{t("billable.alreadyBilled")}</p>}
              </div>
            )}
          </div>

          {approvalNote && <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">{t("approval.willWait")}</p>}
          {isEdit && expense?.approvalStatus === "REJECTED" && <p role="status" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm">{t("approval.rejected", { reason: expense.rejectionReason || "—" })}</p>}

          {isIndia ? <ExpenseGstFields value={gst} onChange={setGst} amount={Number(amount.replace(/,/g, "")) || 0} supplierState={supplierState} /> : null}

          <div className="sticky bottom-0 -mx-5 -mb-5 flex flex-col-reverse gap-2 border-t bg-background/95 p-4 backdrop-blur sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>{tc("cancel")}</Button>
            {isEdit && (expense?.approvalStatus === "DRAFT" || expense?.approvalStatus === "REJECTED") && <Button type="button" variant="outline" disabled={busy || scanning} onClick={() => void submit(false, true)}>{settings?.approvalRequired && !settings.canManage ? t("approval.submit") : t("approval.confirm")}</Button>}
            <Button type="submit" disabled={busy || scanning}>{busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{isEdit ? tc("save_changes") : tc("log_btn")}</Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
