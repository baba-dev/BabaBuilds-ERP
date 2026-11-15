"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight, CalendarClock, CheckCircle2, Landmark, PlayCircle, TriangleAlert, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { PayrollHeroArt } from "./art/PayrollArt";
import { STATUS_TONE, dayLabel, monthLabel, type Overview } from "./shared";

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-xs">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums sm:text-2xl">{value}</p>
      {sub ? <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

const compact = (n: number, locale: string, currency: string) => new Intl.NumberFormat(locale, { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(n);

export function OverviewPanel({ data, locale, currency, money, canPrepare, onTab }: { data: Overview; locale: string; currency: string; money: (n: number) => string; canPrepare: boolean; onTab: (t: string) => void }) {
  const t = useTranslations("PayrollHub");
  const { next, readiness } = data;
  const nextMonth = monthLabel(new Date(Date.UTC(next.year, next.month - 1, 1)), locale);
  const peopleReady = readiness.ready + readiness.attention;
  const noPeople = peopleReady + readiness.none === 0;
  const trend = data.trend.map((r) => ({ name: monthLabel(r.month, locale, "short"), net: r.netPay, deductions: Math.max(0, r.gross - r.netPay), employer: r.employerCost }));
  const maxDept = Math.max(1, ...data.departments.map((d) => d.amount));

  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border bg-gradient-to-br from-indigo-500/10 via-card to-amber-500/10 p-5 sm:p-7">
        <div className="grid items-center gap-6 lg:grid-cols-[1.2fr_1fr]">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-600 dark:text-indigo-300">{t("overview.fy", { fy: data.fy })}</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{noPeople ? t("overview.heroEmptyTitle") : t("overview.heroTitle", { month: nextMonth })}</h2>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {noPeople ? t("overview.heroEmptyBody") : next.inProgress ? t("overview.heroInProgress", { status: t(`status.${next.status ?? "DRAFT"}`) }) : t("overview.heroReady", { count: peopleReady })}
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-2">
              {noPeople ? (
                <Button onClick={() => onTab("people")} className="gap-2" disabled={!canPrepare}><Users className="h-4 w-4" />{t("overview.addPeople")}</Button>
              ) : next.inProgress && next.runId ? (
                <Button asChild className="gap-2"><Link href={`/payroll/runs/${next.runId}`}><PlayCircle className="h-4 w-4" />{t("overview.continueRun")}</Link></Button>
              ) : (
                <Button asChild className="gap-2" disabled={!canPrepare}><Link href={`/payroll/new?year=${next.year}&month=${next.month}`}><PlayCircle className="h-4 w-4" />{t("overview.runPayroll", { month: nextMonth })}</Link></Button>
              )}
              {(readiness.attention > 0 || readiness.none > 0) && !noPeople ? (
                <button type="button" onClick={() => onTab("people")} className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-500/15 dark:text-amber-300">
                  <TriangleAlert className="h-3.5 w-3.5" />{t("overview.peopleGaps", { count: readiness.attention + readiness.none })}
                </button>
              ) : null}
            </div>
            <p className="mt-4 text-xs text-muted-foreground">{data.adapterStatus.workforceModuleEnabled ? t("overview.workforceOn") : t("overview.workforceOff")}</p>
          </div>
          <div className="hidden h-48 lg:block"><PayrollHeroArt /></div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label={t("kpi.gross")} value={money(data.kpis.gross)} sub={t("kpi.fyToDate")} />
        <Stat label={t("kpi.net")} value={money(data.kpis.netPay)} sub={t("kpi.runs", { count: data.kpis.runCount })} />
        <Stat label={t("kpi.employer")} value={money(data.kpis.employerCost)} sub={t("kpi.employerHint")} />
        <Stat label={t("kpi.headcount")} value={String(data.kpis.headcount)} sub={t("kpi.paid")} />
        <Stat label={t("kpi.perHead")} value={money(data.kpis.avgCostPerHead)} sub={t("kpi.perHeadHint")} />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-3xl border bg-card p-5 shadow-xs lg:col-span-2">
          <h3 className="text-sm font-semibold">{t("overview.trend")}</h3>
          <p className="text-xs text-muted-foreground">{t("overview.trendHint")}</p>
          {trend.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">{t("overview.trendEmpty")}</p> : (
            <div className="mt-3 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={trend} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="currentColor" strokeOpacity={0.1} />
                  <XAxis dataKey="name" tickLine={false} axisLine={false} fontSize={11} />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} width={52} tickFormatter={(v: number) => compact(v, locale, currency)} />
                  <Tooltip cursor={{ fill: "rgba(99,102,241,0.08)" }} formatter={(v, n) => [money(Number(v)), t(`overview.series.${String(n)}`)]} contentStyle={{ borderRadius: 12, fontSize: 12 }} />
                  <Bar dataKey="net" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="deductions" stackId="a" fill="#a5b4fc" />
                  <Bar dataKey="employer" stackId="a" fill="#fbbf24" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-indigo-500" />{t("overview.series.net")}</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-indigo-300" />{t("overview.series.deductions")}</span>
            <span className="inline-flex items-center gap-1.5"><i className="h-2.5 w-2.5 rounded-sm bg-amber-400" />{t("overview.series.employer")}</span>
          </div>
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-xs">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Landmark className="h-4 w-4 text-indigo-500" />{t("overview.dues")}</h3>
            <button type="button" onClick={() => onTab("statutory")} className="text-xs text-primary hover:underline">{t("overview.seeAll")}</button>
          </div>
          {data.statutoryDue.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center"><CheckCircle2 className="h-8 w-8 text-emerald-500" /><p className="text-sm text-muted-foreground">{t("overview.duesNone")}</p></div>
          ) : (
            <ul className="mt-3 space-y-2">
              {data.statutoryDue.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{t(`kind.${r.kind}`)}</p><p className={cn("text-xs", r.overdue ? "font-medium text-rose-600" : "text-muted-foreground")}>{r.overdue ? t("overview.overdue", { date: dayLabel(r.dueDate, locale) }) : t("overview.dueOn", { date: dayLabel(r.dueDate, locale) })}</p></div>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{money(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="rounded-3xl border bg-card p-5 shadow-xs lg:col-span-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-indigo-500" />{t("overview.runs")}</h3>
          {data.periods.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("overview.runsEmpty")}</p> : (
            <div className="mt-3 divide-y">
              {data.periods.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div>
                    <p className="text-sm font-medium">{monthLabel(p.startDate, locale)}</p>
                    <p className="text-xs text-muted-foreground">{p.run ? t("overview.runMeta", { count: p.run.headcount, net: money(p.run.netPay) }) : t("overview.noRun")}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {p.run && p.run.errors > 0 ? <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-xs text-rose-600">{t("overview.errors", { count: p.run.errors })}</span> : null}
                    {p.run ? <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", STATUS_TONE[p.run.status])}>{t(`status.${p.run.status}`)}{p.run.status === "POSTED" && p.run.disbursed ? ` · ${t("status.PAID")}` : ""}</span> : null}
                    {p.run ? <Button asChild variant="ghost" size="sm" className="gap-1"><Link href={`/payroll/runs/${p.run.id}`}>{t("overview.open")}<ArrowRight className="h-3.5 w-3.5" /></Link></Button> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-3xl border bg-card p-5 shadow-xs">
          <h3 className="text-sm font-semibold">{t("overview.departments")}</h3>
          <p className="text-xs text-muted-foreground">{t("overview.departmentsHint")}</p>
          {data.departments.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">{t("overview.departmentsEmpty")}</p> : (
            <ul className="mt-4 space-y-3">
              {data.departments.map((d) => (
                <li key={d.name}>
                  <div className="flex justify-between text-xs"><span className="truncate font-medium">{d.name === "GENERAL" ? t("overview.general") : d.name}</span><span className="tabular-nums text-muted-foreground">{money(d.amount)}</span></div>
                  <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-400" style={{ width: `${Math.max(4, (d.amount / maxDept) * 100)}%` }} /></div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
