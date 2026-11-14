"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CircleAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CashChart } from "./Chart";
import { dayLabel, shortDay, type Action, type Forecast, type Kpis } from "./shared";

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: React.ReactNode; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-xs">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-xl font-semibold tabular-nums sm:text-2xl", tone === "good" && "text-emerald-600 dark:text-emerald-400", tone === "warn" && "text-amber-600 dark:text-amber-400", tone === "bad" && "text-rose-600 dark:text-rose-400")}>{value}</p>
      {sub ? <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function OverviewPanel({ data, locale, currency, money, onGoTimeline, onGoPlan }: {
  data: Forecast; locale: string; currency: string; money: (n: number) => string; onGoTimeline: () => void; onGoPlan: () => void;
}) {
  const t = useTranslations("CashFlow");
  const k: Kpis = data.kpis;
  const sel = data.scenarios.find((s) => s.tag === data.scenarioTag) ?? data.scenarios[0]!;
  const best = data.scenarios.find((s) => s.tag === "BEST_CASE");
  const worst = data.scenarios.find((s) => s.tag === "WORST_CASE");
  const below = k.lowestCash < k.threshold || k.lowestCash < 0;
  const negative = k.lowestCash < 0;
  const upcoming = data.lines.filter((l) => l.classification !== "ACTUAL" && l.planStatus !== "resolved").slice(0, 8);

  return (
    <div className="space-y-5">
      <div className={cn("flex flex-col gap-4 rounded-3xl border p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between", negative ? "border-rose-500/30 bg-rose-500/5" : below ? "border-amber-500/30 bg-amber-500/5" : "border-emerald-500/25 bg-emerald-500/5")}>
        <div className="flex items-start gap-3">
          <span className={cn("mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full", negative ? "bg-rose-500/15 text-rose-600" : below ? "bg-amber-500/15 text-amber-600" : "bg-emerald-500/15 text-emerald-600")}>
            {negative ? <CircleAlert className="h-5 w-5" /> : below ? <TriangleAlert className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t("cashToday")}</p>
            <p className="text-3xl font-semibold tabular-nums sm:text-4xl">{money(k.cashNow)}</p>
            <p className="mt-1 max-w-xl text-sm text-foreground/80">
              {negative ? t("headlineNegative", { date: dayLabel(k.lowestCashDate, locale), amount: money(k.lowestCash) })
                : below ? t("headlineLow", { date: dayLabel(k.lowestCashDate, locale), amount: money(k.lowestCash), cushion: money(k.threshold) })
                : t("headlineOk", { date: dayLabel(data.endDate, locale), amount: money(k.lowestCash) })}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 lg:justify-end">
          <div><p className="text-xs text-muted-foreground">{t("safeToSpend")}</p><p className="text-lg font-semibold tabular-nums">{money(k.safeToSpend)}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("runway")}</p><p className="text-lg font-semibold tabular-nums">{k.runwayDays == null ? t("runwayBeyond") : t("runwayDays", { count: k.runwayDays })}</p></div>
          <div><p className="text-xs text-muted-foreground">{t("lowestPoint")}</p><p className={cn("text-lg font-semibold tabular-nums", negative && "text-rose-600 dark:text-rose-400")}>{money(k.lowestCash)}</p></div>
        </div>
      </div>

      {data.accounts.length ? (
        <div className="flex flex-wrap gap-2">
          {data.accounts.map((a) => (
            <Badge key={a.id} variant="outline" className="gap-2 rounded-full px-3 py-1 font-normal"><span className="text-muted-foreground">{a.name}</span><span className="font-medium tabular-nums">{money(a.balance)}</span></Badge>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Stat label={t("expectedIn")} value={money(k.expectedIn)} tone="good" sub={k.coveredByInvoicesPct == null ? undefined : t("coveredByInvoices", { pct: k.coveredByInvoicesPct })} />
        <Stat label={t("expectedOut")} value={money(k.expectedOut)} />
        <Stat label={t("net")} value={money(k.net)} tone={k.net < 0 ? "bad" : "good"} />
        <Stat label={t("overdueReceivables")} value={money(k.overdueReceivables)} tone={k.overdueReceivables > 0 ? "warn" : undefined} />
        <Stat label={t("overdueBills")} value={money(k.overdueBills)} tone={k.overdueBills > 0 ? "warn" : undefined} />
        <Stat label={t("confidence")} value={k.confidence == null ? "—" : `${k.confidence}%`} sub={t("confidenceHint")} />
      </div>

      <section className="rounded-3xl border bg-card p-4 shadow-xs sm:p-5">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">{t("balanceOverTime")}</h2>
          <p className="text-xs text-muted-foreground">{t("scenarioNamed", { name: t(`scenario.${sel.tag}`) })}</p>
        </div>
        <CashChart selected={sel} range={best && worst ? { best, worst } : undefined} threshold={k.threshold} horizon={data.horizonType} locale={locale} currency={currency}
          labels={{ balance: t("chart.balance"), cushion: t("chart.cushion"), inflow: t("chart.inflow"), outflow: t("chart.outflow"), range: t("chart.range"), zero: t("chart.zero") }} />
      </section>

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="space-y-3 lg:col-span-3">
          <h2 className="text-sm font-semibold">{t("whatToDo")}</h2>
          {data.actions.length === 0 ? (
            <div className="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground">{t("nothingToDo")}</div>
          ) : data.actions.map((a) => <ActionCard key={a.kind} a={a} money={money} locale={locale} onPlan={onGoPlan} />)}
        </section>

        <section className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">{t("comingUp")}</h2><Button variant="ghost" size="sm" onClick={onGoTimeline} className="gap-1 text-xs">{t("seeAll")}<ArrowRight className="h-3 w-3" /></Button></div>
          <ul className="divide-y rounded-2xl border bg-card">
            {upcoming.length === 0 ? <li className="p-4 text-sm text-muted-foreground">{t("noMovements")}</li> : upcoming.map((l) => (
              <li key={`${l.key}-${l.date}`} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <div className="min-w-0"><p className="truncate font-medium">{l.title}</p><p className="text-xs text-muted-foreground">{shortDay(l.date, locale)} · {t(`source.${l.sourceType}`)}{l.overdueDays > 0 ? ` · ${t("overdueBy", { days: l.overdueDays })}` : ""}</p></div>
                <span className={cn("shrink-0 font-medium tabular-nums", l.direction === "INFLOW" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground")}>{l.direction === "INFLOW" ? "+" : "−"}{money(l.amount)}</span>
              </li>
            ))}
          </ul>
          {data.alerts.length ? (
            <div className="rounded-2xl border bg-card p-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("flaggedPeriods")}</h3>
              <ul className="mt-2 space-y-1.5 text-sm">
                {data.alerts.slice(0, 6).map((al) => (
                  <li key={al.start} className="flex items-center justify-between gap-2"><span className="flex items-center gap-2"><span className={cn("h-2 w-2 rounded-full", al.severity === "critical" ? "bg-rose-500" : "bg-amber-500")} />{shortDay(al.start, locale)}</span><span className="tabular-nums text-muted-foreground">{money(al.lowest)}</span></li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function ActionCard({ a, money, locale, onPlan }: { a: Action; money: (n: number) => string; locale: string; onPlan: () => void }) {
  const t = useTranslations("CashFlow");
  const tone = a.severity === "critical" ? "border-rose-500/30" : a.severity === "warning" ? "border-amber-500/30" : "border-border";
  const params: Record<string, string | number> = { amount: money(a.amount ?? 0), date: dayLabel(a.date ?? null, locale), ...(a.params ?? {}) };
  if (typeof params.first === "string") params.first = dayLabel(params.first, locale);
  return (
    <article className={cn("rounded-2xl border bg-card p-4", tone)}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t(`action.${a.kind}.title`, params)}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">{t(`action.${a.kind}.body`, params)}</p>
        </div>
        {a.kind === "SETUP_ACCOUNT" ? <Button size="sm" variant="outline" onClick={onPlan}>{t("action.SETUP_ACCOUNT.cta")}</Button> : <Button size="sm" variant="outline" asChild><Link href={a.href}>{t(`action.${a.kind}.cta`)}</Link></Button>}
      </div>
      {a.items.length ? (
        <ul className="mt-3 divide-y rounded-xl border bg-muted/30 text-sm">
          {a.items.map((i, idx) => (
            <li key={`${i.sourceId}-${idx}`} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 truncate">{i.title}{i.note ? <Badge variant="secondary" className="ml-2 text-[10px]">{i.note}</Badge> : null}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">{i.date ? `${shortDay(i.date, locale)} · ` : ""}<span className="font-medium text-foreground">{money(i.amount)}</span></span>
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
