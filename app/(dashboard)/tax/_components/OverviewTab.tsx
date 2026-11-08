"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowUpRight, CalendarCheck2, CalendarClock, FileCheck2, Landmark, PiggyBank, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { DueRing, EmptyArt, GstHeroArt, ReturnEmblem } from "./art/GstArt";
import { daysUntil, formatDay, periodLabel, Section, Stat, StatusChip, STATUS_STYLE, useMoney, type GstOverview, type ObligationView } from "./gst-utils";

type Props = {
  data: GstOverview;
  issueCount: number;
  onOpen: (o: ObligationView) => void;
  onFile: (o: ObligationView) => void;
  onExtend: (o: ObligationView) => void;
  goto: (tab: string) => void;
};

function Hero({ data, goto }: { data: GstOverview; goto: (tab: string) => void }) {
  const t = useTranslations("GstHub.hero");
  const next = data.kpis.nextDue;
  const { locale } = useMoney();
  const nextObligation = next ? data.obligations.find((o) => o.returnType === (next.label.replace("-", "") as string) && o.periodKey === next.periodKey) : null;
  const days = next ? (nextObligation && nextObligation.daysLate > 0 ? -nextObligation.daysLate : daysUntil(next.dueDate)) : null;
  return (
    <div className="relative overflow-hidden rounded-3xl border border-border/60 bg-gradient-to-br from-indigo-50 via-background to-emerald-50 p-5 shadow-sm dark:from-indigo-950/40 dark:via-background dark:to-emerald-950/30 sm:p-7">
      <div className="grid items-center gap-6 md:grid-cols-[1.15fr_1fr]">
        <div className="space-y-4">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-xs font-medium text-indigo-700 ring-1 ring-indigo-200/70 backdrop-blur dark:bg-white/5 dark:text-indigo-300 dark:ring-indigo-400/20">
            <Landmark className="size-3.5" aria-hidden />
            {data.profile.gstin ?? t("noGstin")} · FY {data.fy}
          </span>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {next ? (days !== null && days < 0 ? t("overdueTitle", { label: next.label }) : t("nextTitle", { label: next.label, period: periodLabel(next.periodKey, locale) })) : t("allDone")}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {next ? (days !== null && days < 0 ? t("overdueBody", { days: Math.abs(days), date: formatDay(next.dueDate, locale) }) : t("nextBody", { days: days ?? 0, date: formatDay(next.dueDate, locale) })) : t("allDoneBody")}
          </p>
          <div className="flex flex-wrap gap-2">
            {next ? <Button size="sm" onClick={() => goto(next.label === "GSTR-3B" ? "gstr3b" : next.label === "GSTR-9" ? "gstr9" : "gstr1")}>{t("prepare")}<ArrowUpRight className="ms-1.5 size-4 rtl:-scale-x-100" aria-hidden /></Button> : null}
            <Button size="sm" variant="outline" onClick={() => goto("itc")}>{t("viewCredit")}</Button>
          </div>
        </div>
        <div className="mx-auto hidden w-full max-w-[420px] md:block"><GstHeroArt /></div>
      </div>
    </div>
  );
}

function ObligationCard({ o, onOpen, onFile, onExtend }: { o: ObligationView; onOpen: () => void; onFile: () => void; onExtend: () => void }) {
  const t = useTranslations("GstHub");
  const { locale, m } = useMoney();
  const style = STATUS_STYLE[o.status] ?? STATUS_STYLE.OPEN_PERIOD;
  const due = o.extendedDueDate ?? o.dueDate;
  const days = daysUntil(due);
  const total = 30;
  const progress = o.status === "FILED" ? 1 : o.status === "OPEN_PERIOD" ? 0.04 : Math.min(1, Math.max(0.05, 1 - days / total));
  const canOpen = o.returnType === "GSTR1" || o.returnType === "GSTR3B" || o.returnType === "GSTR9" || o.returnType === "IFF";
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className={cn("group relative flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:flex-row sm:items-center", o.status === "OVERDUE" ? "border-rose-300/60 dark:border-rose-500/30" : "border-border/70")}>
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <DueRing progress={progress} tone={style.tone} size={58}>
          {o.status === "FILED" ? <CalendarCheck2 className="size-5 text-emerald-500" aria-hidden /> : <ReturnEmblem type={o.returnType} size={34} />}
        </DueRing>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{o.label}</p>
            <span className="text-sm text-muted-foreground">{periodLabel(o.periodKey, locale)}</span>
            {o.optional ? <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("optional")}</span> : null}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {o.status === "FILED"
              ? t("filedOn", { date: formatDay(o.filing?.filedAt ?? null, locale), arn: o.filing?.arn ?? "—" })
              : t("dueOn", { date: formatDay(due, locale) }) + (o.extendedDueDate ? ` · ${t("extended")}` : "")}
            {o.figures && o.status !== "FILED" && o.figures.invoiceCount > 0 ? ` · ${o.returnType === "GSTR3B" ? t("cashPayable", { amount: m(o.figures.cashPayable) }) : t("invoices", { count: o.figures.invoiceCount })}` : ""}
          </p>
          {o.daysLate > 0 && o.status !== "FILED" ? <p className="mt-0.5 text-xs font-medium text-rose-600 dark:text-rose-400">{t("lateEstimate", { days: o.daysLate, fee: m(o.lateFeeEstimate) })}</p> : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
        <StatusChip status={o.status} label={t(`status.${o.status}`)} />
        {canOpen ? <Button size="sm" variant="outline" onClick={onOpen}>{t("open")}</Button> : null}
        {o.status !== "OPEN_PERIOD" || o.filing?.filedAt ? <Button size="sm" variant={o.status === "FILED" ? "ghost" : "default"} onClick={onFile}>{o.status === "FILED" ? t("edit") : t("markFiled")}</Button> : null}
        {o.status !== "FILED" ? <Button size="sm" variant="ghost" onClick={onExtend} aria-label={t("extend.title", { label: o.label })}><CalendarClock className="size-4" aria-hidden /></Button> : null}
      </div>
    </motion.li>
  );
}

export function OverviewTab({ data, issueCount, onOpen, onFile, onExtend, goto }: Props) {
  const t = useTranslations("GstHub");
  const { m, c } = useMoney();
  const k = data.kpis;
  const upcoming = data.obligations.filter((o) => o.status !== "FILED" && o.status !== "OPEN_PERIOD" && !(o.optional && o.status === "PENDING"));
  const recent = data.obligations.filter((o) => o.status === "FILED").slice(-4).reverse();
  const open = data.obligations.filter((o) => o.status === "OPEN_PERIOD" && !o.optional).slice(0, 2);
  const max = Math.max(1, ...data.trend.flatMap((p) => [p.outputTax, p.itc]));
  return (
    <div className="space-y-6">
      <Hero data={data} goto={goto} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Stat label={t("kpi.output")} value={<span title={m(k.outputTaxYtd)}>{c(k.outputTaxYtd)}</span>} sub={t("kpi.outputHint", { turnover: c(k.turnover) })} accent="bg-indigo-500" />
        <Stat label={t("kpi.itc")} value={<span title={m(k.itcClaimedYtd)}>{c(k.itcClaimedYtd)}</span>} sub={t("kpi.itcHint", { balance: c(k.itcBalance.total) })} accent="bg-emerald-500" />
        <Stat label={t("kpi.cash")} value={<span title={m(k.cashPaidYtd)}>{c(k.cashPaidYtd)}</span>} sub={t("kpi.cashHint")} accent="bg-amber-500" />
        <button type="button" onClick={() => goto("issues")} className="text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-2xl">
          <Stat label={t("kpi.health")} value={issueCount === 0 ? t("kpi.healthy") : issueCount} sub={k.overdue > 0 ? t("kpi.overdue", { count: k.overdue }) : t("kpi.filedOf", { filed: k.filed, total: k.total })} accent={issueCount === 0 && k.overdue === 0 ? "bg-emerald-500" : "bg-rose-500"} />
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section title={t("timeline.title")} hint={t("timeline.hint")}>
          {upcoming.length + open.length === 0 && recent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center"><EmptyArt variant="returns" /><p className="text-sm font-medium">{t("timeline.emptyTitle")}</p><p className="max-w-xs text-xs text-muted-foreground">{t("timeline.emptyBody")}</p></div>
          ) : (
            <ul className="space-y-3">
              {[...upcoming, ...open].slice(0, 8).map((o) => <ObligationCard key={`${o.returnType}-${o.periodKey}`} o={o} onOpen={() => onOpen(o)} onFile={() => onFile(o)} onExtend={() => onExtend(o)} />)}
              {recent.length > 0 ? <li className="pt-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("timeline.recent")}</li> : null}
              {recent.map((o) => <ObligationCard key={`${o.returnType}-${o.periodKey}`} o={o} onOpen={() => onOpen(o)} onFile={() => onFile(o)} onExtend={() => onExtend(o)} />)}
            </ul>
          )}
        </Section>

        <div className="space-y-6">
          <Section title={t("trend.title")} hint={t("trend.hint")}>
            {data.trend.every((p) => p.outputTax === 0 && p.itc === 0) ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center"><EmptyArt variant="ledger" /><p className="text-xs text-muted-foreground">{t("trend.empty")}</p></div>
            ) : (
              <>
                <div className="flex h-36 items-end gap-1.5" role="img" aria-label={t("trend.title")}>
                  {data.trend.map((p, i) => (
                    <div key={p.key} className="flex flex-1 flex-col items-center justify-end gap-1" title={`${p.key} · ${t("trend.output")} ${m(p.outputTax)} · ${t("trend.itc")} ${m(p.itc)}`}>
                      <div className="flex h-28 w-full items-end justify-center gap-0.5">
                        <motion.div initial={{ height: 0 }} animate={{ height: `${(p.outputTax / max) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.03 }} className="w-1/2 min-w-1 rounded-t bg-gradient-to-t from-indigo-500 to-violet-400" />
                        <motion.div initial={{ height: 0 }} animate={{ height: `${(p.itc / max) * 100}%` }} transition={{ duration: 0.6, delay: i * 0.03 + 0.05 }} className="w-1/2 min-w-1 rounded-t bg-gradient-to-t from-emerald-500 to-teal-300" />
                      </div>
                      <span className="text-[9px] text-muted-foreground">{p.key.slice(-2).replace("Q", "Q")}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-indigo-500" />{t("trend.output")}</span>
                  <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-sm bg-emerald-500" />{t("trend.itc")}</span>
                </div>
              </>
            )}
          </Section>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
            {[
              { icon: FileCheck2, tab: "recon", title: t("quick.recon"), body: t("quick.reconBody") },
              { icon: PiggyBank, tab: "itc", title: t("quick.itc"), body: t("quick.itcBody") },
              { icon: ShieldAlert, tab: "issues", title: t("quick.issues"), body: t("quick.issuesBody", { count: issueCount }) },
            ].map((q) => (
              <button key={q.tab} type="button" onClick={() => goto(q.tab)} className="group flex items-start gap-3 rounded-2xl border border-border/70 bg-card p-3.5 text-start shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300"><q.icon className="size-4.5" aria-hidden /></span>
                <span className="min-w-0"><span className="block text-sm font-semibold">{q.title}</span><span className="block text-xs text-muted-foreground">{q.body}</span></span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
