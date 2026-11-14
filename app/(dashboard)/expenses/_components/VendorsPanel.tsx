"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, GitMerge, Loader2, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/ResponsiveDialog";
import { api, money, shortDate, type VendorRow } from "./shared";

const select = "h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const EMPTY = { name: "", gstin: "", email: "", phone: "", msmeClass: "NONE", udyam: "", paymentTermsDays: "", defaultCategory: "", tdsSection: "", tdsRatePercent: "", notes: "" };

export function VendorsPanel({ currency, locale, isIndia, canManage, onOpenLedger, onChanged }: { currency: string; locale: string; isIndia: boolean; canManage: boolean; onOpenLedger: (vendorId: string) => void; onChanged: () => void }) {
  const t = useTranslations("ExpensesLedger");
  const [rows, setRows] = useState<VendorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState<VendorRow | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [mergeFrom, setMergeFrom] = useState<VendorRow | null>(null);
  const [mergeTo, setMergeTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const r = await api<{ data: VendorRow[] }>(`/api/expenses/vendors?${new URLSearchParams({ ...(q ? { q } : {}), ...(archived ? { archived: "1" } : {}) })}`);
    if (r.ok) setRows(r.data.data); else toast.error(r.data.error ?? t("toast.failed"));
    setLoading(false);
  }, [q, archived, t]);
  useEffect(() => { const h = setTimeout(() => void load(), 200); return () => clearTimeout(h); }, [load]);

  const openForm = (v: VendorRow | null) => {
    setEditing(v); setErrors({});
    setForm(v ? { name: v.name, gstin: v.gstin ?? "", email: v.email ?? "", phone: v.phone ?? "", msmeClass: v.msmeClass ?? "NONE", udyam: v.udyam ?? "", paymentTermsDays: v.paymentTermsDays === null ? "" : String(v.paymentTermsDays), defaultCategory: v.defaultCategory ?? "", tdsSection: v.tdsSection ?? "", tdsRatePercent: v.tdsRatePercent === null ? "" : String(v.tdsRatePercent), notes: v.notes ?? "" } : EMPTY);
    setOpen(true);
  };
  const fe = (k: string) => (errors[k] ? <p role="alert" className="mt-1 text-xs text-rose-600 dark:text-rose-400">{errors[k]}</p> : null);
  const err = (code: string) => (t.has(`vendors.errors.${code}` as never) ? t(`vendors.errors.${code}` as never) : t("errors.INVALID"));

  async function save() {
    setBusy(true); setErrors({});
    const body = { name: form.name, gstin: form.gstin || null, email: form.email || null, phone: form.phone || null, msmeClass: form.msmeClass, udyam: form.udyam || null, paymentTermsDays: form.paymentTermsDays === "" ? null : Number(form.paymentTermsDays), defaultCategory: form.defaultCategory || null, tdsSection: form.tdsSection || null, tdsRatePercent: form.tdsRatePercent === "" ? null : Number(form.tdsRatePercent), notes: form.notes || null };
    const r = await api(editing ? `/api/expenses/vendors/${editing.id}` : "/api/expenses/vendors", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setBusy(false);
    if (r.ok) { toast.success(editing ? t("vendors.updated") : t("vendors.created")); setOpen(false); void load(); onChanged(); return; }
    if (r.data.code === "VALIDATION" && r.data.fields) { setErrors(Object.fromEntries(r.data.fields.map((f) => [f.field, err(f.code)]))); return; }
    if (r.data.code === "VENDOR_EXISTS") { setErrors({ name: t("vendors.errors.EXISTS") }); return; }
    toast.error(r.data.error ?? t("toast.failed"));
  }
  async function toggleArchive(v: VendorRow) {
    const r = await api(`/api/expenses/vendors/${v.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ archived: !v.archivedAt }) });
    if (!r.ok) return toast.error(r.data.error ?? t("toast.failed"));
    void load(); onChanged();
  }
  async function merge() {
    if (!mergeFrom || !mergeTo) return;
    setBusy(true);
    const r = await api("/api/expenses/vendors/merge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceId: mergeFrom.id, targetId: mergeTo }) });
    setBusy(false);
    if (!r.ok) return toast.error(r.data.error ?? t("toast.failed"));
    toast.success(t("vendors.merged")); setMergeFrom(null); setMergeTo(""); void load(); onChanged();
  }

  return (
    <section aria-label={t("tabs.vendors")} className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("vendors.search")} aria-label={t("vendors.search")} className="h-11 ps-9" />
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />{t("vendors.showArchived")}</label>
        <Button onClick={() => openForm(null)}><Plus className="mr-2 size-4" aria-hidden />{t("vendors.add")}</Button>
      </div>
      <div className="overflow-hidden rounded-2xl border bg-card">
        {loading && rows.length === 0 ? <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
          : rows.length === 0 ? <p className="p-10 text-center text-sm text-muted-foreground">{t("vendors.empty")}</p>
          : <ul>{rows.map((v) => (
            <li key={v.id} className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-3 last:border-0 hover:bg-muted/40 ${v.archivedAt ? "opacity-60" : ""}`}>
              <button type="button" className="min-w-0 flex-1 text-start" onClick={() => onOpenLedger(v.id)} aria-label={t("vendors.openLedger", { name: v.name })}>
                <span className="flex flex-wrap items-center gap-1.5"><span className="truncate font-medium hover:underline">{v.name}</span>
                  {(v.msmeClass === "MICRO" || v.msmeClass === "SMALL") && <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300">{t("msme")}</Badge>}
                  {v.unpaidCount > 0 && <Badge variant="outline" className="border-rose-500/40 text-[10px] text-rose-600">{t("vendors.unpaidBills", { count: v.unpaidCount })}</Badge>}</span>
                <span className="block truncate text-xs text-muted-foreground">{[v.gstin, v.defaultCategory, v.paymentTermsDays ? t("vendors.terms", { days: v.paymentTermsDays }) : null, v.lastExpenseAt ? t("vendors.last", { date: shortDate(v.lastExpenseAt, locale) }) : null].filter(Boolean).join(" · ") || "—"}</span>
              </button>
              <div className="text-end text-sm"><span className="font-medium tabular-nums">{money(v.spend, currency, locale)}</span><span className="block text-xs text-muted-foreground">{v.outstanding > 0 ? t("vendors.owed", { amount: money(v.outstanding, currency, locale) }) : t("shown", { count: v.count })}</span></div>
              {canManage && <div className="flex gap-0.5">
                <Button variant="ghost" size="icon" className="size-8" aria-label={`${t("edit")}: ${v.name}`} onClick={() => openForm(v)}><Pencil className="size-4" aria-hidden /></Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`${t("vendors.mergeInto")}: ${v.name}`} onClick={() => { setMergeFrom(v); setMergeTo(""); }}><GitMerge className="size-4" aria-hidden /></Button>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`${v.archivedAt ? t("vendors.restore") : t("vendors.archive")}: ${v.name}`} onClick={() => void toggleArchive(v)}>{v.archivedAt ? <ArchiveRestore className="size-4" aria-hidden /> : <Archive className="size-4" aria-hidden />}</Button>
              </div>}
            </li>))}</ul>}
      </div>

      <ResponsiveDialog open={open} onOpenChange={setOpen} title={editing ? t("vendors.editTitle") : t("vendors.newTitle")} description={t("vendors.formHelp")} desktopClassName="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={(e) => { e.preventDefault(); void save(); }} className="grid gap-4 sm:grid-cols-2" noValidate>
          <div className="sm:col-span-2"><Label htmlFor="v-name" className="mb-1.5 block text-xs text-muted-foreground">{t("vendors.name")} *</Label><Input id="v-name" className="h-10" value={form.name} maxLength={120} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-invalid={Boolean(errors.name)} />{fe("name")}</div>
          {isIndia && <div><Label htmlFor="v-gstin" className="mb-1.5 block text-xs text-muted-foreground">GSTIN</Label><Input id="v-gstin" className="h-10 font-mono uppercase" value={form.gstin} maxLength={15} onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })} aria-invalid={Boolean(errors.gstin)} />{fe("gstin")}</div>}
          <div><Label htmlFor="v-email" className="mb-1.5 block text-xs text-muted-foreground">{t("vendors.email")}</Label><Input id="v-email" type="email" className="h-10" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-invalid={Boolean(errors.email)} />{fe("email")}</div>
          <div><Label htmlFor="v-phone" className="mb-1.5 block text-xs text-muted-foreground">{t("vendors.phone")}</Label><Input id="v-phone" type="tel" className="h-10" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
          <div><Label htmlFor="v-terms" className="mb-1.5 block text-xs text-muted-foreground">{t("vendors.termsLabel")}</Label><Input id="v-terms" inputMode="numeric" className="h-10" value={form.paymentTermsDays} onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value.replace(/\D/g, "") })} placeholder="30" /></div>
          <div><Label htmlFor="v-cat" className="mb-1.5 block text-xs text-muted-foreground">{t("vendors.defaultCategory")}</Label><Input id="v-cat" className="h-10" value={form.defaultCategory} maxLength={60} onChange={(e) => setForm({ ...form, defaultCategory: e.target.value })} /></div>
          {isIndia && (<>
            <div><Label htmlFor="v-msme" className="mb-1.5 block text-xs text-muted-foreground">{t("vendors.msmeClass")}</Label><select id="v-msme" className={select} value={form.msmeClass} onChange={(e) => setForm({ ...form, msmeClass: e.target.value })}><option value="NONE">{t("vendors.msmeNone")}</option><option value="MICRO">{t("vendors.micro")}</option><option value="SMALL">{t("vendors.small")}</option><option value="MEDIUM">{t("vendors.medium")}</option></select></div>
            {form.msmeClass !== "NONE" && <div><Label htmlFor="v-udyam" className="mb-1.5 block text-xs text-muted-foreground">Udyam</Label><Input id="v-udyam" className="h-10 font-mono uppercase" value={form.udyam} placeholder="UDYAM-MH-12-0000001" onChange={(e) => setForm({ ...form, udyam: e.target.value.toUpperCase() })} aria-invalid={Boolean(errors.udyam)} />{fe("udyam")}</div>}
            <div><Label htmlFor="v-tds" className="mb-1.5 block text-xs text-muted-foreground">{t("vendors.tdsSection")}</Label><Input id="v-tds" className="h-10" value={form.tdsSection} maxLength={10} onChange={(e) => setForm({ ...form, tdsSection: e.target.value })} placeholder="194C" /></div>
            <div><Label htmlFor="v-tdsr" className="mb-1.5 block text-xs text-muted-foreground">{t("vendors.tdsRate")}</Label><Input id="v-tdsr" inputMode="decimal" className="h-10" value={form.tdsRatePercent} onChange={(e) => setForm({ ...form, tdsRatePercent: e.target.value.replace(/[^\d.]/g, "") })} placeholder="1" /></div>
          </>)}
          <div className="sm:col-span-2"><Label htmlFor="v-notes" className="mb-1.5 block text-xs text-muted-foreground">{t("form.notes")}</Label><Textarea id="v-notes" rows={2} maxLength={500} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex justify-end gap-2 sm:col-span-2"><Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>{t("cancel")}</Button><Button type="submit" disabled={busy || !form.name.trim()}>{busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{t("save")}</Button></div>
        </form>
      </ResponsiveDialog>

      <ResponsiveDialog open={mergeFrom !== null} onOpenChange={(o) => !o && setMergeFrom(null)} title={t("vendors.mergeTitle", { name: mergeFrom?.name ?? "" })} description={t("vendors.mergeHelp")}>
        <div className="space-y-4">
          <div><Label htmlFor="v-merge" className="mb-1.5 block text-xs text-muted-foreground">{t("vendors.keep")}</Label><select id="v-merge" className={select} value={mergeTo} onChange={(e) => setMergeTo(e.target.value)}><option value="">{t("vendors.choose")}</option>{rows.filter((r) => r.id !== mergeFrom?.id && !r.archivedAt).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
          <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setMergeFrom(null)}>{t("cancel")}</Button><Button onClick={() => void merge()} disabled={!mergeTo || busy}>{busy && <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />}{t("vendors.merge")}</Button></div>
        </div>
      </ResponsiveDialog>
    </section>
  );
}
