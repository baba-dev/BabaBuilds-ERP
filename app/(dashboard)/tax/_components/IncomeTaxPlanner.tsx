"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Calculator, CalendarClock, Info, Scale } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fyLabel, fyStartYear } from "@/lib/gst/calendar";
import { useJson } from "./gst-utils";

type Context = { fy: string; receipts: number; expenses: number; invoiceCount: number; investments: number };
type Estimate = {
  amount: string;
  ratePercent: number | null;
  warnings: string[];
  advanceTax?: Array<{ dueDate: string; cumulativePercent: number; amount: string }>;
  components: Record<string, string>;
  basis: { taxableIncome: string; ruleStatus: string };
};

const TAXPAYERS = ["individual", "huf", "firm", "company"] as const;
const AGE_GROUPS = ["below60", "senior", "super_senior"] as const;
const BASES = ["actual", "presumptive", "manual"] as const;
type Basis = (typeof BASES)[number];

function useEstimate(payload: object | null) {
  const key = payload ? JSON.stringify(payload) : null;
  const [state, setState] = useState<{ key: string | null; data: Estimate | null; error: string | null }>({ key: null, data: null, error: null });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch("/api/tax/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: key, signal: controller.signal });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error((body && typeof body.error === "string" && body.error) || `Request failed (${res.status})`);
        setState({ key, data: body.taxEstimate as Estimate, error: null });
      } catch (e) {
        if ((e as { name?: string }).name === "AbortError") return;
        setState({ key, data: null, error: e instanceof Error ? e.message : "Request failed" });
      }
    })();
    return () => controller.abort();
  }, [key]);
  const settled = state.key === key;
  return { data: settled ? state.data : null, error: settled ? state.error : null, loading: key !== null && !settled };
}

export function IncomeTaxPlanner({ investmentsTotal }: { investmentsTotal: number }) {
  const t = useTranslations("IncomeTaxPlanner");
  const locale = useLocale();
  const currentFy = fyStartYear(new Date());
  const fyOptions = [currentFy, currentFy - 1, currentFy - 2].filter((y) => y >= 2024).map(fyLabel);
  const [fy, setFy] = useState(fyLabel(currentFy));
  const [taxpayer, setTaxpayer] = useState<(typeof TAXPAYERS)[number]>("individual");
  const [age, setAge] = useState<(typeof AGE_GROUPS)[number]>("below60");
  const [salaried, setSalaried] = useState(false);
  const [basis, setBasis] = useState<Basis>("actual");
  const [manual, setManual] = useState("");
  const [deductions, setDeductions] = useState<string | null>(null);

  const ctx = useJson<Context>(`/api/tax/estimate/context?fy=${encodeURIComponent(fy)}`);
  const money = (n: number) => new Intl.NumberFormat(locale, { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(n);
  const money2 = (n: number | string) => new Intl.NumberFormat(locale, { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(Number(n));

  const receipts = ctx.data?.receipts ?? 0;
  const expenses = ctx.data?.expenses ?? 0;
  const income = basis === "manual" ? Math.max(0, Number(manual) || 0) : basis === "presumptive" ? receipts * 0.5 : Math.max(0, receipts - expenses);
  // 80C-type savings are capped at ₹1.5 lakh; the user can overwrite with their real old-regime deductions.
  const suggestedDeductions = Math.min(150000, Math.max(0, investmentsTotal));
  const deductionValue = deductions === null ? suggestedDeductions : Math.max(0, Number(deductions) || 0);
  const canCompare = taxpayer === "individual" || taxpayer === "huf";

  const base = (regime: "new" | "old") => ({
    country: "IN", fiscalYear: fy, revenue: income, taxRegime: regime, taxpayerType: taxpayer, ageGroup: taxpayer === "individual" ? age : "below60",
    isSalaried: salaried, applyStandardDeduction: salaried, presumptive: basis === "presumptive",
    deductions: regime === "old" ? deductionValue : 0, date: `${fy.slice(0, 4)}-09-30`,
  });
  const ready = !ctx.loading || !!ctx.data;
  const newEst = useEstimate(ready ? base("new") : null);
  const oldEst = useEstimate(ready && canCompare ? base("old") : null);

  const best = useMemo(() => {
    if (!newEst.data || !oldEst.data) return null;
    const n = Number(newEst.data.amount);
    const o = Number(oldEst.data.amount);
    return { regime: n <= o ? ("new" as const) : ("old" as const), saves: Math.abs(n - o) };
  }, [newEst.data, oldEst.data]);

  const primary = canCompare ? (best?.regime === "old" ? oldEst : newEst) : newEst;
  const result = primary.data;
  const comp = result?.components ?? {};
  const rows: Array<[string, string, boolean?]> = result ? [
    [t("rows.slab"), comp.grossSlabTax],
    [t("rows.std"), `-${comp.standardDeductionAmount}`, Number(comp.standardDeductionAmount) === 0],
    [t("rows.rebate"), `-${comp.rebate}`, Number(comp.rebate) === 0],
    [t("rows.marginal"), `-${comp.marginalRelief}`, Number(comp.marginalRelief) === 0],
    [t("rows.surcharge"), comp.surcharge, Number(comp.surcharge) === 0],
    [t("rows.cess"), comp.cess],
  ] : [];

  return (
    <section className="space-y-5 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-6">
      <header className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white"><Calculator className="size-5" aria-hidden /></span>
        <div>
          <h2 className="text-base font-semibold tracking-tight">{t("title")}</h2>
          <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label>{t("fy")}</Label>
          <Select value={fy} onValueChange={(v) => { setFy(v); setDeductions(null); }}>
            <SelectTrigger aria-label={t("fy")}><SelectValue /></SelectTrigger>
            <SelectContent>{fyOptions.map((o) => <SelectItem key={o} value={o}>FY {o}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("taxpayer")}</Label>
          <Select value={taxpayer} onValueChange={(v) => setTaxpayer(v as (typeof TAXPAYERS)[number])}>
            <SelectTrigger aria-label={t("taxpayer")}><SelectValue /></SelectTrigger>
            <SelectContent>{TAXPAYERS.map((o) => <SelectItem key={o} value={o}>{t(`taxpayers.${o}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>{t("basis")}</Label>
          <Select value={basis} onValueChange={(v) => setBasis(v as Basis)}>
            <SelectTrigger aria-label={t("basis")}><SelectValue /></SelectTrigger>
            <SelectContent>{BASES.map((o) => <SelectItem key={o} value={o}>{t(`bases.${o}`)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {taxpayer === "individual" ? (
          <div className="space-y-1.5">
            <Label>{t("age")}</Label>
            <Select value={age} onValueChange={(v) => setAge(v as (typeof AGE_GROUPS)[number])}>
              <SelectTrigger aria-label={t("age")}><SelectValue /></SelectTrigger>
              <SelectContent>{AGE_GROUPS.map((o) => <SelectItem key={o} value={o}>{t(`ages.${o}`)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        ) : null}
        {basis === "manual" ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="itp-manual">{t("manualIncome")}</Label>
            <Input id="itp-manual" inputMode="decimal" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="0" />
          </div>
        ) : null}
        {canCompare ? (
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="itp-ded">{t("deductions")}</Label>
            <Input id="itp-ded" inputMode="decimal" value={deductions ?? String(suggestedDeductions)} onChange={(e) => setDeductions(e.target.value)} />
            <p className="text-xs text-muted-foreground">{t("deductionsHint")}</p>
          </div>
        ) : null}
        {taxpayer === "individual" ? (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 px-3 py-2.5 sm:col-span-2">
            <div><p className="text-sm font-medium">{t("salaried")}</p><p className="text-xs text-muted-foreground">{t("salariedHint")}</p></div>
            <Switch checked={salaried} onCheckedChange={setSalaried} aria-label={t("salaried")} />
          </div>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted-foreground">{t("receipts")}</dt><dd className="font-semibold tabular-nums">{ctx.loading && !ctx.data ? "…" : money(receipts)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t("expenses")}</dt><dd className="font-semibold tabular-nums">{ctx.loading && !ctx.data ? "…" : money(expenses)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t("incomeUsed")}</dt><dd className="font-semibold tabular-nums">{money(income)}</dd></div>
        <div><dt className="text-xs text-muted-foreground">{t("invoices")}</dt><dd className="font-semibold tabular-nums">{ctx.data?.invoiceCount ?? 0}</dd></div>
      </dl>

      {primary.error ? <p role="alert" className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{primary.error}</p> : null}
      {!result && !primary.error ? <Skeleton className="h-40 rounded-xl" /> : null}

      {result ? (
        <div className={cn("grid gap-5 lg:grid-cols-[1.1fr_1fr]", primary.loading && "opacity-60")}>
          <div className="space-y-4">
            {canCompare && best && oldEst.data && newEst.data ? (
              <div className="grid grid-cols-2 gap-3">
                {([["new", newEst.data], ["old", oldEst.data]] as const).map(([k, e]) => (
                  <div key={k} className={cn("rounded-xl border p-3.5", best.regime === k ? "border-emerald-400/70 bg-emerald-50/60 dark:bg-emerald-500/10" : "border-border/70")}>
                    <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Scale className="size-3.5" aria-hidden />{t(`regimes.${k}`)}{best.regime === k ? <span className="rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">{t("better")}</span> : null}</p>
                    <p className="mt-1 text-xl font-bold tabular-nums">{money(Number(e.amount))}</p>
                    <p className="text-xs text-muted-foreground">{t("effective", { rate: (e.ratePercent ?? 0).toFixed(2) })}</p>
                  </div>
                ))}
                <p className="col-span-2 text-xs text-muted-foreground">{best.saves > 0 ? t("saves", { regime: t(`regimes.${best.regime}`), amount: money(best.saves) }) : t("same")}</p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/70 p-4"><p className="text-xs text-muted-foreground">{t("payable")}</p><p className="text-2xl font-bold tabular-nums">{money(Number(result.amount))}</p><p className="text-xs text-muted-foreground">{t("effective", { rate: (result.ratePercent ?? 0).toFixed(2) })}</p></div>
            )}
            <div className="overflow-x-auto"><table className="w-full min-w-[28rem] text-sm">
              <tbody>
                <tr className="border-b border-border/50"><td className="py-1.5 text-muted-foreground">{t("rows.taxable")}</td><td className="py-1.5 text-end tabular-nums">{money2(result.basis.taxableIncome)}</td></tr>
                {rows.filter((r) => !r[2]).map(([label, value]) => (
                  <tr key={label} className="border-b border-border/50"><td className="py-1.5 text-muted-foreground">{label}</td><td className="py-1.5 text-end tabular-nums">{value.startsWith("-") ? `−${money2(value.slice(1))}` : money2(value)}</td></tr>
                ))}
                <tr><td className="py-2 font-semibold">{t("rows.total")}</td><td className="py-2 text-end font-bold tabular-nums">{money2(result.amount)}</td></tr>
              </tbody>
            </table></div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-border/70 p-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="size-4 text-indigo-500" aria-hidden />{t("advance.title")}</h3>
              {result.advanceTax && result.advanceTax.length > 0 ? (
                <ol className="mt-3 space-y-2">
                  {result.advanceTax.map((a) => (
                    <li key={a.dueDate} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(a.dueDate))} · {a.cumulativePercent}%</span>
                      <span className="font-semibold tabular-nums">{money(Number(a.amount))}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-2 text-sm text-muted-foreground">{t("advance.none")}</p>}
              <p className="mt-3 text-xs text-muted-foreground">{basis === "presumptive" ? t("advance.presumptive") : t("advance.note")}</p>
            </div>
            <div className="flex gap-2.5 rounded-xl bg-sky-50 p-3.5 text-xs text-sky-900 dark:bg-sky-500/10 dark:text-sky-200">
              <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="space-y-1.5"><p>{t("act2025")}</p>{result.warnings.filter((w) => !/Not legal advice/.test(w)).slice(0, 3).map((w) => <p key={w}>{w}</p>)}</div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
