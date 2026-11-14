"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { CashChart } from "./Chart";
import { api, dayLabel, SCENARIOS, type Forecast, type ScenarioRow } from "./shared";

type WhatIf = { base: ScenarioRow; custom: ScenarioRow };
type Extra = { date: string; amount: string; direction: "INFLOW" | "OUTFLOW"; reason: string };

export function ScenariosPanel({ data, locale, currency, money }: { data: Forecast; locale: string; currency: string; money: (n: number) => string }) {
  const t = useTranslations("CashFlow");
  const base = data.scenarios.find((s) => s.tag === "BASE")!;
  const [vals, setVals] = useState({ collectionsDelayDays: String(base.assumptions.collectionsDelayDays), inflowHaircutPercent: String(base.assumptions.inflowHaircutPercent), outflowIncreasePercent: String(base.assumptions.outflowIncreasePercent), movePOEarlierLaterDays: String(base.assumptions.movePOEarlierLaterDays) });
  const [extras, setExtras] = useState<Extra[]>([]);
  const [result, setResult] = useState<WhatIf | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const adjustments = extras.filter((e) => e.date && Number(e.amount) > 0).map((e) => ({ date: new Date(e.date).toISOString(), amount: Number(e.amount), direction: e.direction, reason: e.reason || t("whatIfReason") }));
      setResult(await api<WhatIf>("/api/cash-flow/forecast", { method: "POST", body: JSON.stringify({ horizonType: data.horizonType, assumptions: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v) || 0])), adjustments }) }));
    } catch (e) { toast.error(e instanceof Error ? e.message : t("saveFailed")); } finally { setBusy(false); }
  };

  const num = (k: keyof typeof vals, label: string, hint: string) => (
    <div><Label htmlFor={`wi-${k}`} className="text-xs">{label}</Label><Input id={`wi-${k}`} type="number" inputMode="decimal" value={vals[k]} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} /><p className="mt-1 text-[11px] text-muted-foreground">{hint}</p></div>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        {SCENARIOS.map((tag) => {
          const s = data.scenarios.find((x) => x.tag === tag)!;
          const bad = s.lowestCash < 0 || s.crunchDate;
          return (
            <article key={tag} className={cn("rounded-2xl border bg-card p-4", tag === data.scenarioTag && "ring-2 ring-primary/40")}>
              <div className="flex items-center justify-between"><h3 className="text-sm font-semibold">{t(`scenario.${tag}`)}</h3>{bad ? <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">{t("dipsBelow")}</span> : <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{t("staysAbove")}</span>}</div>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{money(s.closingCash)}</p>
              <p className="text-xs text-muted-foreground">{t("endBalance")}</p>
              <dl className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-muted-foreground">{t("lowestPoint")}</dt><dd className="tabular-nums">{money(s.lowestCash)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{t("lowestOn")}</dt><dd>{dayLabel(s.lowestCashDate, locale)}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{t("collectionsDelay")}</dt><dd className="tabular-nums">{t("daysValue", { count: s.assumptions.collectionsDelayDays })}</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{t("inflowHaircut")}</dt><dd className="tabular-nums">{s.assumptions.inflowHaircutPercent}%</dd></div>
                <div className="flex justify-between"><dt className="text-muted-foreground">{t("outflowIncrease")}</dt><dd className="tabular-nums">{s.assumptions.outflowIncreasePercent}%</dd></div>
              </dl>
            </article>
          );
        })}
      </div>

      <section className="rounded-3xl border bg-card p-5">
        <h2 className="text-base font-semibold">{t("whatIfTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("whatIfHint")}</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {num("collectionsDelayDays", t("collectionsDelay"), t("collectionsDelayHint"))}
          {num("inflowHaircutPercent", t("inflowHaircut"), t("inflowHaircutHint"))}
          {num("outflowIncreasePercent", t("outflowIncrease"), t("outflowIncreaseHint"))}
          {num("movePOEarlierLaterDays", t("supplierShift"), t("supplierShiftHint"))}
        </div>
        <div className="mt-5 space-y-2">
          <p className="text-sm font-medium">{t("whatIfExtras")}</p>
          {extras.map((e, i) => (
            <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[9rem_8rem_9rem_1fr_auto]">
              <Input type="date" value={e.date} onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, date: ev.target.value } : x)))} aria-label={t("date")} />
              <Select value={e.direction} onValueChange={(v) => setExtras(extras.map((x, j) => (j === i ? { ...x, direction: v as Extra["direction"] } : x)))}><SelectTrigger aria-label={t("direction")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="INFLOW">{t("moneyIn")}</SelectItem><SelectItem value="OUTFLOW">{t("moneyOut")}</SelectItem></SelectContent></Select>
              <Input type="number" inputMode="decimal" min="0" placeholder={t("amount")} value={e.amount} onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, amount: ev.target.value } : x)))} aria-label={t("amount")} />
              <Input placeholder={t("whatIfReason")} value={e.reason} onChange={(ev) => setExtras(extras.map((x, j) => (j === i ? { ...x, reason: ev.target.value } : x)))} aria-label={t("reason")} className="col-span-2 sm:col-span-1" />
              <Button variant="ghost" size="icon" onClick={() => setExtras(extras.filter((_, j) => j !== i))} aria-label={t("remove")}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setExtras([...extras, { date: "", amount: "", direction: "INFLOW", reason: "" }])} disabled={extras.length >= 10}><Plus className="h-4 w-4" />{t("addWhatIfAmount")}</Button>
        </div>
        <div className="mt-5 flex items-center gap-3"><Button onClick={() => void run()} disabled={busy}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}{t("runWhatIf")}</Button><p className="text-xs text-muted-foreground">{t("notSaved")}</p></div>

        {result ? (
          <div className="mt-6 space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              {([["endBalance", result.base.closingCash, result.custom.closingCash], ["lowestPoint", result.base.lowestCash, result.custom.lowestCash], ["expectedIn", result.base.inflows, result.custom.inflows]] as const).map(([k, a, b]) => (
                <div key={k} className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">{t(k)}</p><p className="text-lg font-semibold tabular-nums">{money(b)}</p><p className={cn("text-xs tabular-nums", b - a >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>{b - a >= 0 ? "+" : "−"}{money(Math.abs(b - a))} {t("vsBase")}</p></div>
              ))}
            </div>
            <CashChart selected={result.base} extraLine={{ rows: result.custom, tone: "custom" }} threshold={base.assumptions.minimumCashThreshold} horizon={data.horizonType} locale={locale} currency={currency}
              labels={{ balance: t("chart.balance"), cushion: t("chart.cushion"), inflow: t("chart.inflow"), outflow: t("chart.outflow"), range: t("chart.range"), zero: t("chart.zero"), compare: t("whatIfLine") }} />
          </div>
        ) : null}
      </section>
    </div>
  );
}
