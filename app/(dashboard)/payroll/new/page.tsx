"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ClipboardCheck, Loader2, Plus, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardPageShell } from "@/components/layout/DashboardPageShell";
import { useFormat } from "@/hooks/use-format";
import { cn } from "@/lib/utils";
import { IssueList } from "../_components/IssueList";
import { api, monthLabel, type PayrollIssue, type PeopleResponse, type VarianceFlag } from "../_components/shared";

type Adj = { id: string; employeeId: string; employee: string; kind: string; label: string; amount: number; taxable: boolean };
type Preview = { period: { start: string; end: string; fy: string }; workforceLinked: boolean; headcount: { included: number; excluded: number }; totals: { gross: number; deductions: number; netPay: number; employerCost: number; tds: number; pfEmployee: number }; issues: PayrollIssue[]; variance: VarianceFlag[]; people: { id: string; name: string; gross: number; net: number; lopDays: number }[] };
const KINDS = ["BONUS", "ARREARS", "EARNING", "REIMBURSEMENT", "DEDUCTION", "LOP_DAYS"] as const;
const STEPS = ["inputs", "check", "calculate"] as const;

function Wizard() {
  const t = useTranslations("PayrollHub");
  const { fCurrency, locale } = useFormat();
  const router = useRouter();
  const sp = useSearchParams();
  const now = new Date();
  const [year, setYear] = useState(Number(sp.get("year")) || now.getUTCFullYear());
  const [month, setMonth] = useState(Number(sp.get("month")) || now.getUTCMonth() + 1);
  const [step, setStep] = useState<(typeof STEPS)[number]>("inputs");
  const [people, setPeople] = useState<PeopleResponse["people"]>([]);
  const [adjs, setAdjs] = useState<Adj[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ employeeId: "", kind: "BONUS" as (typeof KINDS)[number], label: "", amount: "", taxable: true });
  const money = useMemo(() => (n: number) => fCurrency(n), [fCurrency]);

  useEffect(() => { api<PeopleResponse>("/api/payroll/people").then((d) => setPeople(d.people.filter((p) => p.pay && p.status !== "INACTIVE"))).catch(() => undefined); }, []);
  const loadAdjs = useCallback(() => api<{ adjustments: Adj[] }>(`/api/payroll/adjustments?year=${year}&month=${month}`).then((d) => setAdjs(d.adjustments)).catch(() => setAdjs([])), [year, month]);
  useEffect(() => { void loadAdjs(); setPreview(null); }, [loadAdjs]);

  const addAdj = async () => {
    if (!form.employeeId || !form.label.trim() || !(Number(form.amount) > 0)) { toast.error(t("wizard.adjIncomplete")); return; }
    setBusy(true);
    try {
      await api("/api/payroll/adjustments", { method: "POST", body: JSON.stringify({ year, month, employeeId: form.employeeId, kind: form.kind, label: form.label.trim(), amount: Number(form.amount), taxable: form.taxable }) });
      setForm((f) => ({ ...f, label: "", amount: "" })); await loadAdjs();
    } catch (e) { toast.error(e instanceof Error ? e.message : t("wizard.adjFailed")); } finally { setBusy(false); }
  };
  const delAdj = async (id: string) => { await api(`/api/payroll/adjustments/${id}`, { method: "DELETE" }).catch((e) => toast.error(e instanceof Error ? e.message : "")); await loadAdjs(); };

  const runPreview = async () => {
    setBusy(true); setStep("check");
    try { setPreview(await api<Preview>("/api/payroll/runs/preview", { method: "POST", body: JSON.stringify({ year, month }) })); }
    catch (e) { toast.error(e instanceof Error ? e.message : t("wizard.previewFailed")); setStep("inputs"); } finally { setBusy(false); }
  };

  const generate = async () => {
    setBusy(true);
    try {
      const r = await api<{ runId: string }>("/api/payroll/runs", { method: "POST", body: JSON.stringify({ year, month }) });
      toast.success(t("wizard.generated")); router.push(`/payroll/runs/${r.runId}`);
    } catch (e) { toast.error(e instanceof Error ? e.message : t("wizard.generateFailed")); setBusy(false); }
  };

  const blocking = (preview?.issues ?? []).filter((i) => i.severity === "error" && i.code !== "NO_COMPENSATION");
  const label = monthLabel(new Date(Date.UTC(year, month - 1, 1)), locale);
  const years = [now.getUTCFullYear() - 1, now.getUTCFullYear(), now.getUTCFullYear() + 1];

  return (
    <DashboardPageShell title={t("wizard.title", { month: label })} description={t("wizard.subtitle")} icon={<ClipboardCheck className="h-6 w-6 text-primary" />} pageActions={<Button asChild variant="outline" size="sm" className="gap-1.5"><Link href="/payroll"><ArrowLeft className="h-4 w-4" />{t("wizard.back")}</Link></Button>}>
      <div className="mx-auto max-w-4xl space-y-5">
        <ol className="flex items-center gap-2 text-sm">
          {STEPS.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold", STEPS.indexOf(step) >= i ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>{STEPS.indexOf(step) > i ? <CheckCircle2 className="h-4 w-4" /> : i + 1}</span>
              <span className={cn("hidden sm:inline", step === s ? "font-medium" : "text-muted-foreground")}>{t(`wizard.step.${s}`)}</span>
              {i < STEPS.length - 1 ? <span className="h-px flex-1 bg-border" /> : null}
            </li>
          ))}
        </ol>

        {step === "inputs" && (
          <div className="space-y-5">
            <section className="rounded-3xl border bg-card p-5 shadow-xs">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-indigo-500" />{t("wizard.month")}</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={month} onChange={(e) => setMonth(Number(e.target.value))} aria-label={t("wizard.month")}>{Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{monthLabel(new Date(Date.UTC(2000, m - 1, 1)), locale).replace(/\s*\d{4}$/, "")}</option>)}</select>
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label={t("wizard.year")}>{years.map((y) => <option key={y} value={y}>{y}</option>)}</select>
              </div>
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-indigo-500/5 p-3 text-xs text-muted-foreground"><Wand2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-indigo-500" />{t("wizard.autoHint")}</p>
            </section>

            <section className="rounded-3xl border bg-card p-5 shadow-xs">
              <h3 className="text-sm font-semibold">{t("wizard.adjustments")}</h3>
              <p className="text-xs text-muted-foreground">{t("wizard.adjustmentsHint")}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-[1.2fr_1fr_1.2fr_0.8fr_auto]">
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })} aria-label={t("wizard.employee")}><option value="">{t("wizard.employee")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
                <select className="h-9 rounded-md border bg-background px-2 text-sm" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as (typeof KINDS)[number] })} aria-label={t("wizard.kind")}>{KINDS.map((k) => <option key={k} value={k}>{t(`wizard.kindValue.${k}`)}</option>)}</select>
                <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder={t("wizard.label")} maxLength={60} />
                <Input type="number" min={0} value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder={form.kind === "LOP_DAYS" ? t("wizard.days") : t("wizard.amount")} />
                <Button onClick={() => void addAdj()} disabled={busy} className="gap-1.5"><Plus className="h-4 w-4" />{t("wizard.add")}</Button>
              </div>
              {adjs.length === 0 ? <p className="mt-4 rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">{t("wizard.adjEmpty")}</p> : (
                <ul className="mt-4 divide-y rounded-xl border">
                  {adjs.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"><span className="min-w-0"><span className="font-medium">{a.employee}</span><span className="block truncate text-xs text-muted-foreground">{t(`wizard.kindValue.${a.kind}`)} · {a.label}</span></span><span className="flex items-center gap-2"><span className="tabular-nums">{a.kind === "LOP_DAYS" ? t("wizard.daysValue", { count: a.amount }) : money(a.amount)}</span><Button variant="ghost" size="icon" onClick={() => void delAdj(a.id)} aria-label={t("wizard.remove")}><Trash2 className="h-4 w-4" /></Button></span></li>)}
                </ul>
              )}
            </section>
            <div className="flex justify-end"><Button onClick={() => void runPreview()} className="gap-2">{t("wizard.continue")}<ArrowRight className="h-4 w-4" /></Button></div>
          </div>
        )}

        {step !== "inputs" && (
          <div className="space-y-5">
            {busy && !preview ? <div className="flex justify-center py-24"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div> : preview ? (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[[t("wizard.people"), String(preview.headcount.included)], [t("wizard.gross"), money(preview.totals.gross)], [t("wizard.net"), money(preview.totals.netPay)], [t("wizard.employer"), money(preview.totals.employerCost)]].map(([k, v]) => <div key={k} className="rounded-2xl border bg-card p-4 shadow-xs"><p className="text-xs uppercase tracking-wide text-muted-foreground">{k}</p><p className="mt-1 text-xl font-semibold tabular-nums">{v}</p></div>)}
                </div>
                <section className="rounded-3xl border bg-card p-5 shadow-xs">
                  <h3 className="mb-3 text-sm font-semibold">{t("wizard.checks")}</h3>
                  {preview.issues.length === 0 ? <p className="flex items-center gap-2 text-sm text-emerald-600"><CheckCircle2 className="h-4 w-4" />{t("wizard.allClear")}</p> : <IssueList issues={preview.issues} />}
                </section>
                {preview.variance.length > 0 ? (
                  <section className="rounded-3xl border bg-card p-5 shadow-xs">
                    <h3 className="text-sm font-semibold">{t("wizard.variance")}</h3><p className="text-xs text-muted-foreground">{t("wizard.varianceHint")}</p>
                    <ul className="mt-3 divide-y text-sm">{preview.variance.slice(0, 8).map((v) => <li key={v.employeeId} className="flex items-center justify-between py-2"><span>{v.name}<span className="ml-2 text-xs text-muted-foreground">{t(`wizard.varianceKind.${v.kind}`)}</span></span><span className={cn("tabular-nums", v.delta < 0 ? "text-rose-600" : "text-emerald-600")}>{v.delta > 0 ? "+" : ""}{money(v.delta)}{v.pct !== null ? ` (${v.pct}%)` : ""}</span></li>)}</ul>
                  </section>
                ) : null}
                <section className="rounded-3xl border bg-card p-5 shadow-xs">
                  <h3 className="mb-3 text-sm font-semibold">{t("wizard.preview")}</h3>
                  <div className="max-h-72 divide-y overflow-y-auto text-sm">{preview.people.map((p) => <div key={p.id} className="flex items-center justify-between py-2"><span>{p.name}{p.lopDays > 0 ? <span className="ml-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] text-amber-700 dark:text-amber-300">{t("wizard.lop", { days: p.lopDays })}</span> : null}</span><span className="tabular-nums text-muted-foreground">{money(p.gross)} <span className="text-foreground">→ {money(p.net)}</span></span></div>)}</div>
                </section>
                <div className="flex flex-wrap justify-between gap-2">
                  <Button variant="outline" onClick={() => setStep("inputs")} className="gap-1.5"><ArrowLeft className="h-4 w-4" />{t("wizard.edit")}</Button>
                  <div className="flex items-center gap-3">{blocking.length > 0 ? <p className="text-xs text-rose-600">{t("wizard.blocked", { count: blocking.length })}</p> : null}<Button onClick={() => void generate()} disabled={busy || blocking.length > 0 || preview.headcount.included === 0} className="gap-2">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}{t("wizard.generate")}</Button></div>
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>
    </DashboardPageShell>
  );
}

export default function NewRunPage() {
  return <Suspense fallback={null}><Wizard /></Suspense>;
}
