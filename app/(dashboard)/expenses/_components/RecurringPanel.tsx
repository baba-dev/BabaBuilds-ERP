"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Pause, Pencil, Play, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { PRESET_CATEGORIES } from "@/lib/expenses/categories";
import { api, money, shortDate, type RecurringRow } from "./shared";

const select = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const today = () => new Date().toISOString().slice(0, 10);
const EMPTY = { vendor: "", category: "Other", amount: "", description: "", frequency: "MONTHLY", nextRunDate: today(), endDate: "", autoPost: false, paymentStatus: "PAID", dueInDays: "" };

export function RecurringPanel({ currency, locale, canDelete, onChanged }: { currency: string; locale: string; canDelete: boolean; onChanged: () => void }) {
  const t = useTranslations("ExpensesLedger");
  const tc = useTranslations("Expenses");
  const [rows, setRows] = useState<RecurringRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringRow | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { setLoading(true); const r = await api<{ data: RecurringRow[] }>("/api/expenses/recurring"); if (r.ok) setRows(r.data.data); setLoading(false); }, []);
  useEffect(() => { void load(); }, [load]);

  const openForm = (r: RecurringRow | null) => {
    setEditing(r); setErrors({});
    setForm(r ? { vendor: r.vendor, category: r.category, amount: String(r.amount), description: r.description ?? "", frequency: r.frequency, nextRunDate: r.nextRunDate.slice(0, 10), endDate: r.endDate ? r.endDate.slice(0, 10) : "", autoPost: r.autoPost, paymentStatus: r.paymentStatus, dueInDays: r.dueInDays === null ? "" : String(r.dueInDays) } : { ...EMPTY, nextRunDate: today() });
    setOpen(true);
  };
  const fe = (k: string) => (errors[k] ? <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors[k]}</p> : null);
  const err = (code: string) => (t.has(`errors.${code}` as never) ? t(`errors.${code}` as never) : t("errors.INVALID"));

  async function save() {
    setBusy(true); setErrors({});
    const body = { vendor: form.vendor, category: form.category, amount: Number(form.amount.replace(/,/g, "")), description: form.description || null, frequency: form.frequency, nextRunDate: form.nextRunDate, endDate: form.endDate || null, autoPost: form.autoPost, paymentStatus: form.paymentStatus, dueInDays: form.paymentStatus === "UNPAID" && form.dueInDays ? Number(form.dueInDays) : null };
    const r = await api(editing ? `/api/expenses/recurring/${editing.id}` : "/api/expenses/recurring", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { toast.success(t("recurring.saved")); setOpen(false); void load(); return; }
    if (r.data.code === "VALIDATION" && r.data.fields) { setErrors(Object.fromEntries(r.data.fields.map((f) => [f.field, err(f.code)]))); return; }
    toast.error(r.data.error ?? t("toast.failed"));
  }
  async function setStatus(r: RecurringRow, status: "ACTIVE" | "PAUSED") {
    const res = await api(`/api/expenses/recurring/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) return toast.error(res.data.error ?? t("toast.failed"));
    void load();
  }
  async function remove(r: RecurringRow) {
    const res = await api(`/api/expenses/recurring/${r.id}`, { method: "DELETE" });
    if (!res.ok) return toast.error(res.data.error ?? t("toast.failed"));
    void load();
  }
  async function runNow() {
    setBusy(true);
    const r = await api<{ created: number; drafts: number }>("/api/expenses/recurring/run", { method: "POST" });
    setBusy(false);
    if (!r.ok) return toast.error(r.data.error ?? t("toast.failed"));
    toast.success(t("recurring.ran", { count: r.data.created })); void load(); onChanged();
  }
  const catLabel = (value: string) => { const p = PRESET_CATEGORIES.find((c) => c.value === value); return p ? tc(`cat_${p.key}` as never) : value; };

  return (
    <section aria-label={t("tabs.recurring")} className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">{t("recurring.help")}</p>
        <div className="flex gap-2"><Button variant="outline" onClick={() => void runNow()} disabled={busy}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <RefreshCw className="mr-2 size-4" aria-hidden />}{t("recurring.runNow")}</Button><Button onClick={() => openForm(null)}><Plus className="mr-2 size-4" aria-hidden />{t("recurring.add")}</Button></div>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {loading ? <div className="space-y-2 p-4">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : rows.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">{t("recurring.empty")}</p>
          : <ul>{rows.map((r) => (
            <li key={r.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-0 ${r.status !== "ACTIVE" ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1"><p className="flex flex-wrap items-center gap-1.5"><span className="truncate font-medium">{r.vendor}</span><Badge variant="secondary" className="font-normal">{catLabel(r.category)}</Badge>{r.status !== "ACTIVE" && <Badge variant="outline">{t(`recurring.status.${r.status}` as never)}</Badge>}<Badge variant="outline" className={r.autoPost ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300" : "border-sky-500/40 text-sky-700 dark:text-sky-300"}>{r.autoPost ? t("recurring.autoPost") : t("recurring.draftFirst")}</Badge></p>
                <p className="text-xs text-muted-foreground">{t(`recurring.freq.${r.frequency}` as never)} · {r.status === "ACTIVE" ? t("recurring.next", { date: shortDate(r.nextRunDate, locale) }) : r.lastRunAt ? t("recurring.lastRun", { date: shortDate(r.lastRunAt, locale) }) : "—"}{r.endDate ? ` · ${t("recurring.until", { date: shortDate(r.endDate, locale) })}` : ""}</p></div>
              <span className="font-medium tabular-nums">{money(r.amount, currency, locale)}</span>
              <div className="flex gap-0.5">
                {r.status !== "ENDED" && <Button variant="ghost" size="icon" className="size-8" aria-label={`${r.status === "ACTIVE" ? t("recurring.pause") : t("recurring.resume")}: ${r.vendor}`} onClick={() => void setStatus(r, r.status === "ACTIVE" ? "PAUSED" : "ACTIVE")}>{r.status === "ACTIVE" ? <Pause className="size-4" aria-hidden /> : <Play className="size-4" aria-hidden />}</Button>}
                <Button variant="ghost" size="icon" className="size-8" aria-label={`${t("edit")}: ${r.vendor}`} onClick={() => openForm(r)}><Pencil className="size-4" aria-hidden /></Button>
                {canDelete && <Button variant="ghost" size="icon" className="size-8 text-rose-600" aria-label={`${tc("actions.delete")}: ${r.vendor}`} onClick={() => void remove(r)}><Trash2 className="size-4" aria-hidden /></Button>}
              </div>
            </li>))}</ul>}
      </div>

      <ResponsiveDialog open={open} onOpenChange={setOpen} title={editing ? t("recurring.editTitle") : t("recurring.newTitle")} description={t("recurring.formHelp")} desktopClassName="sm:max-w-xl max-h-[90dvh] overflow-y-auto">
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div><Label htmlFor="r-vendor" className="mb-1.5 block text-xs text-muted-foreground">{tc("vendor")} *</Label><Input id="r-vendor" className="h-10" value={form.vendor} maxLength={120} onChange={(e) => setForm({ ...form, vendor: e.target.value })} aria-invalid={Boolean(errors.vendor)} />{fe("vendor")}</div>
          <div><Label htmlFor="r-amount" className="mb-1.5 block text-xs text-muted-foreground">{t("form.amount", { currency })} *</Label><Input id="r-amount" inputMode="decimal" className="h-10 tabular-nums" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^\d.,]/g, "") })} aria-invalid={Boolean(errors.amount)} />{fe("amount")}</div>
          <div><Label htmlFor="r-cat" className="mb-1.5 block text-xs text-muted-foreground">{tc("category")}</Label><select id="r-cat" className={select} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{PRESET_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{tc(`cat_${c.key}` as never)}</option>)}{!PRESET_CATEGORIES.some((c) => c.value === form.category) && <option value={form.category}>{form.category}</option>}</select></div>
          <div><Label htmlFor="r-freq" className="mb-1.5 block text-xs text-muted-foreground">{t("recurring.frequency")}</Label><select id="r-freq" className={select} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}>{["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"].map((f) => <option key={f} value={f}>{t(`recurring.freq.${f}` as never)}</option>)}</select></div>
          <div><Label htmlFor="r-next" className="mb-1.5 block text-xs text-muted-foreground">{t("recurring.firstRun")}</Label><Input id="r-next" type="date" className="h-10 dark:[color-scheme:dark]" value={form.nextRunDate} onChange={(e) => setForm({ ...form, nextRunDate: e.target.value })} aria-invalid={Boolean(errors.nextRunDate)} />{fe("nextRunDate")}</div>
          <div><Label htmlFor="r-end" className="mb-1.5 block text-xs text-muted-foreground">{t("recurring.endDate")}</Label><Input id="r-end" type="date" className="h-10 dark:[color-scheme:dark]" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} aria-invalid={Boolean(errors.endDate)} />{fe("endDate")}</div>
          <div><Label htmlFor="r-pay" className="mb-1.5 block text-xs text-muted-foreground">{t("form.payment")}</Label><select id="r-pay" className={select} value={form.paymentStatus} onChange={(e) => setForm({ ...form, paymentStatus: e.target.value })}><option value="PAID">{t("paid")}</option><option value="UNPAID">{t("form.onCredit")}</option></select></div>
          {form.paymentStatus === "UNPAID" && <div><Label htmlFor="r-due" className="mb-1.5 block text-xs text-muted-foreground">{t("recurring.dueInDays")}</Label><Input id="r-due" inputMode="numeric" className="h-10" value={form.dueInDays} onChange={(e) => setForm({ ...form, dueInDays: e.target.value.replace(/\D/g, "") })} placeholder="30" /></div>}
          <div className="sm:col-span-2"><Label htmlFor="r-desc" className="mb-1.5 block text-xs text-muted-foreground">{t("form.notes")}</Label><Input id="r-desc" className="h-10" value={form.description} maxLength={500} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          <div className="flex items-center justify-between gap-3 rounded-xl border p-3 sm:col-span-2"><div><p className="text-sm font-medium">{t("recurring.autoPostLabel")}</p><p className="text-xs text-muted-foreground">{t("recurring.autoPostHelp")}</p></div><Switch checked={form.autoPost} onCheckedChange={(v) => setForm({ ...form, autoPost: v })} aria-label={t("recurring.autoPostLabel")} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>{t("cancel")}</Button><Button type="submit" disabled={busy || !form.vendor.trim() || !form.amount}>{busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{t("save")}</Button></div>
        </form>
      </ResponsiveDialog>
    </section>
  );
}
