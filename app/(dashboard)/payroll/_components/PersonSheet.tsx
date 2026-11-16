"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ApiError, api, dayLabel, type PeopleResponse } from "./shared";

type Comp = { code: string; label: string; monthly: number; taxable: boolean; prorate: boolean; pfWage: boolean };
type Preview = { gross: number; deductions: number; netPay: number; employerCost: number; lines: { code: string; label: string; amount: number }[]; warnings: string[] };
type Revision = { id: string; effectiveFrom: string; annualCtc: number; components: Comp[]; taxRegime: "new" | "old"; oldRegimeDeductions: number; pfEnabled: boolean; pfOnActualBasic: boolean; esiEnabled: boolean; ptState: string | null; panLast4: string | null; uan: string | null; esiNumber: string | null; accountHolder: string | null; bankName: string | null; ifsc: string | null; accountLast4: string | null; paymentMode: string };
type Detail = { id: string; firstName: string; lastName: string; email: string | null; phone: string | null; employeeCode: string | null; status: string; joinDate: string | null; exitDate: string | null; location: string | null; departmentId: string | null; designationId: string | null; revisions: Revision[]; loans: { id: string; label: string; principal: number; emi: number; outstanding: number; status: string }[] };

const TABS = ["details", "pay", "tax", "bank", "history"] as const;
type Tab = (typeof TABS)[number];
const today = () => new Date().toISOString().slice(0, 10);
const blank = () => ({
  firstName: "", lastName: "", email: "", phone: "", employeeCode: "", joinDate: "", exitDate: "", departmentId: "", designationId: "", location: "", status: "ACTIVE",
  effectiveFrom: today(), annualCtc: 0, components: [] as Comp[], taxRegime: "new" as "new" | "old", oldRegimeDeductions: 0, pfEnabled: true, pfOnActualBasic: false, esiEnabled: false, ptState: "",
  pan: "", uan: "", esiNumber: "", accountHolder: "", bankName: "", ifsc: "", accountNumber: "", paymentMode: "BANK_TRANSFER", basicPct: 40, hraPct: 50,
});
type Form = ReturnType<typeof blank>;

function Field({ label, error, children, hint }: { label: string; error?: string; children: React.ReactNode; hint?: string }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}{hint && !error ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}{error ? <p className="text-[11px] text-rose-600">{error}</p> : null}</div>;
}

export function PersonSheet({ open, onOpenChange, personId, meta, canEdit, money, locale, onSaved }: {
  open: boolean; onOpenChange: (v: boolean) => void; personId: string | null; meta: PeopleResponse["meta"]; canEdit: boolean; money: (n: number) => string; locale: string; onSaved: () => void;
}) {
  const t = useTranslations("PayrollHub");
  const [tab, setTab] = useState<Tab>("details");
  const [form, setForm] = useState<Form>(blank);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [building, setBuilding] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !personId;

  useEffect(() => {
    if (!open) return;
    setTab("details"); setErrors({}); setPreview(null); setDetail(null);
    if (!personId) { setForm(blank()); return; }
    setLoading(true);
    api<Detail>(`/api/payroll/people/${personId}`).then((d) => {
      setDetail(d);
      const r = d.revisions[0];
      setForm({
        ...blank(), firstName: d.firstName, lastName: d.lastName, email: d.email ?? "", phone: d.phone ?? "", employeeCode: d.employeeCode ?? "", joinDate: d.joinDate?.slice(0, 10) ?? "", exitDate: d.exitDate?.slice(0, 10) ?? "",
        departmentId: d.departmentId ?? "", designationId: d.designationId ?? "", location: d.location ?? "", status: d.status,
        ...(r ? { effectiveFrom: today(), annualCtc: r.annualCtc, components: r.components, taxRegime: r.taxRegime, oldRegimeDeductions: r.oldRegimeDeductions, pfEnabled: r.pfEnabled, pfOnActualBasic: r.pfOnActualBasic, esiEnabled: r.esiEnabled, ptState: r.ptState ?? "", uan: r.uan ?? "", esiNumber: r.esiNumber ?? "", accountHolder: r.accountHolder ?? "", bankName: r.bankName ?? "", ifsc: r.ifsc ?? "", paymentMode: r.paymentMode } : {}),
      });
    }).catch((e) => toast.error(e instanceof Error ? e.message : t("person.loadFailed"))).finally(() => setLoading(false));
  }, [open, personId, t]);

  const rev = detail?.revisions[0] ?? null;
  const monthlyGross = useMemo(() => form.components.reduce((s, c) => s + (Number(c.monthly) || 0), 0), [form.components]);

  const runPreview = useCallback(async (build: boolean) => {
    if (!(form.annualCtc > 0) && !form.components.length) return;
    setBuilding(true);
    try {
      const res = await api<{ components: Comp[]; employerPfMonthly: number; preview: Preview }>("/api/payroll/ctc-preview", {
        method: "POST",
        body: JSON.stringify({ annualCtc: Math.max(1, form.annualCtc || monthlyGross * 12), basicPercentOfCtc: form.basicPct, hraPercentOfBasic: form.hraPct, pfEnabled: form.pfEnabled, pfOnActualBasic: form.pfOnActualBasic, esiEnabled: form.esiEnabled, ptState: form.ptState || null, taxRegime: form.taxRegime, oldRegimeDeductions: form.oldRegimeDeductions, hasPan: Boolean(form.pan || rev?.panLast4), ...(build ? {} : { components: form.components.map((c) => ({ ...c, monthly: Number(c.monthly) || 0 })) }) }),
      });
      if (build) set("components", res.components.map((c) => ({ ...c, pfWage: Boolean(c.pfWage) })));
      setPreview(res.preview);
    } catch (e) {
      if (build) toast.error(e instanceof Error ? e.message : t("person.previewFailed"));
    } finally { setBuilding(false); }
  }, [form.annualCtc, form.basicPct, form.hraPct, form.pfEnabled, form.pfOnActualBasic, form.esiEnabled, form.ptState, form.taxRegime, form.oldRegimeDeductions, form.pan, form.components, rev?.panLast4, monthlyGross, t]);

  useEffect(() => {
    if (!open || tab !== "pay" || form.components.length === 0) return;
    const id = setTimeout(() => void runPreview(false), 450);
    return () => clearTimeout(id);
  }, [open, tab, form.components, form.pfEnabled, form.esiEnabled, form.ptState, form.taxRegime, form.pan, runPreview]);

  const updateComp = (i: number, patch: Partial<Comp>) => set("components", form.components.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const save = async () => {
    setSaving(true); setErrors({});
    try {
      const hasPay = form.components.length > 0;
      const compensation = hasPay ? {
        effectiveFrom: form.effectiveFrom, annualCtc: form.annualCtc || Math.round(monthlyGross * 12), components: form.components.map((c) => ({ ...c, monthly: Number(c.monthly) || 0, code: c.code.toUpperCase() })),
        taxRegime: form.taxRegime, oldRegimeDeductions: Number(form.oldRegimeDeductions) || 0, pfEnabled: form.pfEnabled, pfOnActualBasic: form.pfOnActualBasic, esiEnabled: form.esiEnabled, ptState: form.ptState || null,
        pan: form.pan, uan: form.uan, esiNumber: form.esiNumber, accountHolder: form.accountHolder, bankName: form.bankName, ifsc: form.ifsc, accountNumber: form.accountNumber, paymentMode: form.paymentMode,
      } : undefined;
      const person = { firstName: form.firstName, lastName: form.lastName, email: form.email, phone: form.phone, employeeCode: form.employeeCode || null, joinDate: form.joinDate || null, exitDate: form.exitDate || null, departmentId: form.departmentId || null, designationId: form.designationId || null, location: form.location || null };
      if (isNew) await api("/api/payroll/people", { method: "POST", body: JSON.stringify({ ...person, ...(compensation ? { compensation } : {}) }) });
      else {
        await api(`/api/payroll/people/${personId}`, { method: "PATCH", body: JSON.stringify({ ...person, status: form.status }) });
        if (compensation) await api(`/api/payroll/people/${personId}`, { method: "PUT", body: JSON.stringify(compensation) });
      }
      toast.success(t("person.saved"));
      onSaved(); onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) {
        const flat: Record<string, string> = {};
        for (const [k, v] of Object.entries(e.fields)) flat[k.split(".").pop() ?? k] = Array.isArray(v) ? v[0] ?? "" : String(v);
        setErrors(flat);
        if (flat.pan || flat.uan || flat.esiNumber) setTab("tax"); else if (flat.ifsc || flat.accountNumber) setTab("bank"); else if (flat.firstName || flat.email) setTab("details");
        toast.error(e.code === "DUPLICATE_CODE" ? t("person.duplicateCode") : e.message);
      } else toast.error(t("person.saveFailed"));
    } finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-3xl">
        <SheetHeader className="border-b p-5 pb-4">
          <SheetTitle>{isNew ? t("person.addTitle") : `${form.firstName} ${form.lastName}`.trim() || t("person.editTitle")}</SheetTitle>
          <SheetDescription>{isNew ? t("person.addHint") : t("person.editHint")}</SheetDescription>
          <nav className="-mx-1 mt-2 flex gap-1 overflow-x-auto px-1">
            {TABS.filter((k) => k !== "history" || !isNew).map((k) => <button key={k} type="button" onClick={() => setTab(k)} className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-sm transition-colors", tab === k ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>{t(`person.tab.${k}`)}</button>)}
          </nav>
        </SheetHeader>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {loading ? <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div> : (
            <>
              {tab === "details" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={t("person.firstName")} error={errors.firstName}><Input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} disabled={!canEdit} /></Field>
                  <Field label={t("person.lastName")}><Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} disabled={!canEdit} /></Field>
                  <Field label={t("person.email")} error={errors.email} hint={t("person.emailHint")}><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} disabled={!canEdit} /></Field>
                  <Field label={t("person.phone")}><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} disabled={!canEdit} /></Field>
                  <Field label={t("person.employeeCode")}><Input value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value)} disabled={!canEdit} /></Field>
                  <Field label={t("person.location")}><Input value={form.location} onChange={(e) => set("location", e.target.value)} disabled={!canEdit} /></Field>
                  <Field label={t("person.joinDate")}><Input type="date" value={form.joinDate} onChange={(e) => set("joinDate", e.target.value)} disabled={!canEdit} /></Field>
                  <Field label={t("person.exitDate")} hint={t("person.exitHint")}><Input type="date" value={form.exitDate} onChange={(e) => set("exitDate", e.target.value)} disabled={!canEdit} /></Field>
                  <Field label={t("person.department")}>
                    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.departmentId} onChange={(e) => set("departmentId", e.target.value)} disabled={!canEdit}><option value="">{t("person.none")}</option>{meta.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
                  </Field>
                  <Field label={t("person.designation")}>
                    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.designationId} onChange={(e) => set("designationId", e.target.value)} disabled={!canEdit}><option value="">{t("person.none")}</option>{meta.designations.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}</select>
                  </Field>
                  {!isNew ? <Field label={t("person.status")}>
                    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.status} onChange={(e) => set("status", e.target.value)} disabled={!canEdit}>{["ACTIVE", "ON_LEAVE", "INACTIVE"].map((s) => <option key={s} value={s}>{t(`person.statusValue.${s}`)}</option>)}</select>
                  </Field> : null}
                </div>
              )}

              {tab === "pay" && (
                <div className="space-y-5">
                  <div className="rounded-2xl border bg-gradient-to-br from-indigo-500/5 to-transparent p-4">
                    <div className="flex items-center gap-2 text-sm font-medium"><Wand2 className="h-4 w-4 text-indigo-500" />{t("pay.builderTitle")}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{t("pay.builderHint")}</p>
                    <div className="mt-3 grid gap-3 sm:grid-cols-[1.5fr_1fr_1fr_auto]">
                      <Field label={t("pay.annualCtc")} error={errors.annualCtc}><Input type="number" min={0} value={form.annualCtc || ""} onChange={(e) => set("annualCtc", Number(e.target.value))} disabled={!canEdit} /></Field>
                      <Field label={t("pay.basicPct")}><Input type="number" min={10} max={90} value={form.basicPct} onChange={(e) => set("basicPct", Number(e.target.value))} disabled={!canEdit} /></Field>
                      <Field label={t("pay.hraPct")}><Input type="number" min={0} max={100} value={form.hraPct} onChange={(e) => set("hraPct", Number(e.target.value))} disabled={!canEdit} /></Field>
                      <div className="flex items-end"><Button type="button" variant="secondary" className="w-full gap-1.5" onClick={() => void runPreview(true)} disabled={!canEdit || building || !(form.annualCtc > 0)}>{building ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{t("pay.build")}</Button></div>
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between"><h4 className="text-sm font-semibold">{t("pay.components")}</h4><span className="text-xs text-muted-foreground">{t("pay.monthlyGross", { amount: money(monthlyGross) })}</span></div>
                    {form.components.length === 0 ? <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t("pay.componentsEmpty")}</p> : (
                      <div className="space-y-2">
                        <div className="hidden grid-cols-[1.4fr_1.1fr_64px_64px_64px_40px] gap-2 px-1 text-[11px] uppercase tracking-wide text-muted-foreground sm:grid"><span>{t("pay.name")}</span><span>{t("pay.monthly")}</span><span>{t("pay.taxable")}</span><span>{t("pay.prorate")}</span><span>{t("pay.pfWage")}</span><span /></div>
                        {form.components.map((c, i) => (
                          <div key={i} className="grid grid-cols-2 items-center gap-2 rounded-xl border p-2 sm:grid-cols-[1.4fr_1.1fr_64px_64px_64px_40px] sm:border-0 sm:p-0">
                            <Input value={c.label} onChange={(e) => updateComp(i, { label: e.target.value })} disabled={!canEdit} aria-label={t("pay.name")} />
                            <Input type="number" min={0} value={c.monthly || ""} onChange={(e) => updateComp(i, { monthly: Number(e.target.value) })} disabled={!canEdit} aria-label={t("pay.monthly")} />
                            <label className="flex items-center gap-1.5 text-xs sm:justify-center"><Switch checked={c.taxable} onCheckedChange={(v) => updateComp(i, { taxable: v })} disabled={!canEdit} /><span className="sm:hidden">{t("pay.taxable")}</span></label>
                            <label className="flex items-center gap-1.5 text-xs sm:justify-center"><Switch checked={c.prorate} onCheckedChange={(v) => updateComp(i, { prorate: v })} disabled={!canEdit} /><span className="sm:hidden">{t("pay.prorate")}</span></label>
                            <label className="flex items-center gap-1.5 text-xs sm:justify-center"><Switch checked={c.pfWage} onCheckedChange={(v) => updateComp(i, { pfWage: v })} disabled={!canEdit} /><span className="sm:hidden">{t("pay.pfWage")}</span></label>
                            <Button type="button" variant="ghost" size="icon" onClick={() => set("components", form.components.filter((_, j) => j !== i))} disabled={!canEdit} aria-label={t("pay.remove")}><Trash2 className="h-4 w-4" /></Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button type="button" variant="outline" size="sm" className="mt-3 gap-1.5" disabled={!canEdit} onClick={() => set("components", [...form.components, { code: `COMP${form.components.length + 1}`, label: "", monthly: 0, taxable: true, prorate: true, pfWage: false }])}><Plus className="h-4 w-4" />{t("pay.addComponent")}</Button>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("pay.effectiveFrom")} hint={t("pay.effectiveHint")}><Input type="date" value={form.effectiveFrom} onChange={(e) => set("effectiveFrom", e.target.value)} disabled={!canEdit} /></Field>
                  </div>

                  {preview ? (
                    <div className="rounded-2xl border bg-card p-4">
                      <div className="flex items-center justify-between"><h4 className="text-sm font-semibold">{t("pay.takeHome")}</h4>{building ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}</div>
                      <div className="mt-3 grid grid-cols-3 gap-3 text-center">
                        <div><p className="text-[11px] uppercase text-muted-foreground">{t("pay.gross")}</p><p className="text-lg font-semibold tabular-nums">{money(preview.gross)}</p></div>
                        <div><p className="text-[11px] uppercase text-muted-foreground">{t("pay.deductions")}</p><p className="text-lg font-semibold tabular-nums text-rose-600">{money(preview.deductions)}</p></div>
                        <div><p className="text-[11px] uppercase text-muted-foreground">{t("pay.net")}</p><p className="text-lg font-semibold tabular-nums text-emerald-600">{money(preview.netPay)}</p></div>
                      </div>
                      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{preview.lines.map((l) => <li key={l.code} className="flex justify-between"><span>{l.label}</span><span className="tabular-nums">{money(l.amount)}</span></li>)}</ul>
                      <p className="mt-3 text-[11px] text-muted-foreground">{t("pay.employerCostNote", { amount: money(preview.employerCost) })}</p>
                    </div>
                  ) : null}
                </div>
              )}

              {tab === "tax" && (
                <div className="space-y-5">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("tax.regime")} hint={t("tax.regimeHint")}>
                      <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.taxRegime} onChange={(e) => set("taxRegime", e.target.value as "new" | "old")} disabled={!canEdit}><option value="new">{t("tax.regimeNew")}</option><option value="old">{t("tax.regimeOld")}</option></select>
                    </Field>
                    {form.taxRegime === "old" ? <Field label={t("tax.oldDeductions")} hint={t("tax.oldDeductionsHint")}><Input type="number" min={0} value={form.oldRegimeDeductions || ""} onChange={(e) => set("oldRegimeDeductions", Number(e.target.value))} disabled={!canEdit} /></Field> : <div />}
                    <Field label={t("tax.pan")} error={errors.pan} hint={rev?.panLast4 ? t("tax.panKept", { last4: rev.panLast4 }) : t("tax.panHint")}><Input value={form.pan} onChange={(e) => set("pan", e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} disabled={!canEdit} /></Field>
                    <Field label={t("tax.ptState")} hint={t("tax.ptHint")}>
                      <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.ptState} onChange={(e) => set("ptState", e.target.value)} disabled={!canEdit}><option value="">{t("tax.ptNone")}</option>{meta.ptStates.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}<option value="DL">{t("tax.ptNoTax")}</option></select>
                    </Field>
                  </div>
                  <div className="space-y-3 rounded-2xl border p-4">
                    <label className="flex items-start justify-between gap-4"><span><span className="text-sm font-medium">{t("tax.pf")}</span><span className="block text-xs text-muted-foreground">{t("tax.pfHint")}</span></span><Switch checked={form.pfEnabled} onCheckedChange={(v) => set("pfEnabled", v)} disabled={!canEdit} /></label>
                    {form.pfEnabled ? <label className="flex items-start justify-between gap-4"><span><span className="text-sm font-medium">{t("tax.pfActual")}</span><span className="block text-xs text-muted-foreground">{t("tax.pfActualHint")}</span></span><Switch checked={form.pfOnActualBasic} onCheckedChange={(v) => set("pfOnActualBasic", v)} disabled={!canEdit} /></label> : null}
                    <label className="flex items-start justify-between gap-4"><span><span className="text-sm font-medium">{t("tax.esi")}</span><span className="block text-xs text-muted-foreground">{t("tax.esiHint")}</span></span><Switch checked={form.esiEnabled} onCheckedChange={(v) => set("esiEnabled", v)} disabled={!canEdit} /></label>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("tax.uan")} error={errors.uan}><Input value={form.uan} onChange={(e) => set("uan", e.target.value)} maxLength={12} disabled={!canEdit} /></Field>
                    <Field label={t("tax.esiNumber")} error={errors.esiNumber}><Input value={form.esiNumber} onChange={(e) => set("esiNumber", e.target.value)} disabled={!canEdit} /></Field>
                  </div>
                </div>
              )}

              {tab === "bank" && (
                <div className="space-y-4">
                  <p className="rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">{t("bank.privacy")}</p>
                  <Field label={t("bank.mode")}>
                    <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={form.paymentMode} onChange={(e) => set("paymentMode", e.target.value)} disabled={!canEdit}>{["BANK_TRANSFER", "UPI", "CHEQUE", "CASH"].map((m) => <option key={m} value={m}>{t(`bank.modeValue.${m}`)}</option>)}</select>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label={t("bank.holder")}><Input value={form.accountHolder} onChange={(e) => set("accountHolder", e.target.value)} disabled={!canEdit} /></Field>
                    <Field label={t("bank.bankName")}><Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} disabled={!canEdit} /></Field>
                    <Field label={t("bank.accountNumber")} error={errors.accountNumber} hint={rev?.accountLast4 ? t("bank.accountKept", { last4: rev.accountLast4 }) : undefined}><Input inputMode="numeric" value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} autoComplete="off" disabled={!canEdit} /></Field>
                    <Field label={t("bank.ifsc")} error={errors.ifsc}><Input value={form.ifsc} onChange={(e) => set("ifsc", e.target.value.toUpperCase())} placeholder="HDFC0001234" maxLength={11} disabled={!canEdit} /></Field>
                  </div>
                </div>
              )}

              {tab === "history" && detail ? (
                <div className="space-y-5">
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">{t("history.revisions")}</h4>
                    {detail.revisions.length === 0 ? <p className="text-sm text-muted-foreground">{t("history.noRevisions")}</p> : (
                      <ol className="relative space-y-3 border-l pl-5">
                        {detail.revisions.map((r, i) => <li key={r.id} className="relative"><span className={cn("absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full", i === 0 ? "bg-emerald-500" : "bg-muted-foreground/40")} /><p className="text-sm font-medium">{t("history.ctc", { amount: money(r.annualCtc) })}{i === 0 ? <span className="ml-2 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">{t("history.current")}</span> : null}</p><p className="text-xs text-muted-foreground">{t("history.from", { date: dayLabel(r.effectiveFrom, locale) })} · {t(`tax.regime${r.taxRegime === "old" ? "Old" : "New"}`)}</p></li>)}
                      </ol>
                    )}
                  </div>
                  <div>
                    <h4 className="mb-2 text-sm font-semibold">{t("history.loans")}</h4>
                    {detail.loans.length === 0 ? <p className="text-sm text-muted-foreground">{t("history.noLoans")}</p> : <ul className="space-y-2">{detail.loans.map((l) => <li key={l.id} className="flex items-center justify-between rounded-xl border px-3 py-2 text-sm"><span>{l.label}<span className="block text-xs text-muted-foreground">{t("history.emi", { amount: money(l.emi) })}</span></span><span className="text-right tabular-nums">{money(l.outstanding)}<span className="block text-xs text-muted-foreground">{t(`history.loanStatus.${l.status}`)}</span></span></li>)}</ul>}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t bg-background p-4">
          <p className="text-xs text-muted-foreground">{!canEdit ? t("person.readOnly") : form.components.length === 0 && tab !== "details" ? t("person.noPayYet") : ""}</p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
            {canEdit ? <Button onClick={() => void save()} disabled={saving || !form.firstName.trim()} className="gap-1.5">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("common.save")}</Button> : null}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
