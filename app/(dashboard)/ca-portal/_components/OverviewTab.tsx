"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import { motion, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { AlertTriangle, ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AttentionList } from "./AttentionList";
import { CaHeroArt } from "./CaArt";
import { Section, Stat, StateChip, callApi, formatDay, periodLabel, useKindName, useMoney, type CaItemView, type Overview } from "./ca-utils";

function Ring({ percent, label }: { percent: number; label: string }) {
  const reduce = useReducedMotion();
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-36 shrink-0" role="img" aria-label={label}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="9" className="stroke-indigo-500/15" />
        <motion.circle cx="60" cy="60" r={r} fill="none" strokeWidth="9" strokeLinecap="round" className="stroke-indigo-500" strokeDasharray={c} initial={{ strokeDashoffset: reduce ? c * (1 - percent / 100) : c }} animate={{ strokeDashoffset: c * (1 - percent / 100) }} transition={{ duration: reduce ? 0 : 0.9, ease: "easeOut" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold tabular-nums tracking-tight">{percent}%</span>
      </div>
    </div>
  );
}

export function OverviewTab({ data, onOpen, goto, onChanged }: { data: Overview; onOpen: (i: CaItemView) => void; goto: (tab: string) => void; onChanged: () => void }) {
  const t = useTranslations("CaCompliance.overview");
  const { locale, m, c } = useMoney();
  const kindName = useKindName();
  const [busy, setBusy] = useState(false);
  const p = data.progress;
  const f = data.figures;
  const close = data.items.find((i) => i.kind === "YEAR_CLOSE");
  const next = p.next;

  async function signYear() {
    if (!close) return;
    setBusy(true);
    const res = await callApi("POST", "/api/ca/items/signoff", { kind: close.kind, periodKey: close.periodKey, fy: data.fy });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    toast.success(t("close.signedToast"));
    onChanged();
  }
  async function unsignYear() {
    if (!close) return;
    setBusy(true);
    const res = await callApi("POST", "/api/ca/items/signoff", { kind: close.kind, periodKey: close.periodKey, fy: data.fy, undo: true });
    setBusy(false);
    if (!res.ok) { toast.error(res.error); return; }
    onChanged();
  }

  return (
    <div className="space-y-5">
      {!data.configured ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-300/50 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-500/10">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">{t("setupNeeded.title")}</p>
            <p className="mt-0.5 text-sm text-amber-800/90 dark:text-amber-200/80">{t("setupNeeded.body")}</p>
          </div>
          <Button size="sm" onClick={() => goto("setup")}>{t("setupNeeded.cta")}</Button>
        </div>
      ) : null}

      <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-indigo-50 via-card to-card p-5 shadow-sm dark:from-indigo-500/10 sm:p-6">
        <div className="pointer-events-none absolute end-4 top-3 hidden h-44 w-60 opacity-90 xl:block" aria-hidden><CaHeroArt /></div>
        <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-center">
          <Ring percent={p.percent} label={t("progress", { filed: p.filed, total: p.total })} />
          <div className="min-w-0 flex-1 text-center sm:text-start">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">{t("progressTitle", { fy: data.fy })}</p>
            <p className="mt-1 text-2xl font-bold tracking-tight">{t("progress", { filed: p.filed, total: p.total })}</p>
            {next ? (
              <button type="button" onClick={() => onOpen(next)} className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl border border-border/70 bg-card/80 px-3 py-2 text-start text-sm shadow-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="min-w-0">
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t("next")}</span>
                  <span className="block truncate font-semibold">{kindName(next)} · {periodLabel(next.periodKey, locale)}</span>
                  <span className="block text-xs text-muted-foreground">{formatDay(next.effectiveDue, locale)}</span>
                </span>
                <StateChip state={next.state} />
              </button>
            ) : <p className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" aria-hidden />{t("nextNone")}</p>}
          </div>
          <dl className="relative grid w-full grid-cols-3 gap-2 sm:w-auto sm:grid-cols-1 xl:me-56">
            {([["overdue", p.overdue, "text-rose-600 dark:text-rose-300"], ["dueSoon", p.dueSoon, "text-amber-600 dark:text-amber-300"], ["signedOff", p.signedOff, "text-emerald-600 dark:text-emerald-300"]] as const).map(([k, v, tone]) => (
              <div key={k} className="rounded-xl border border-border/60 bg-card/80 px-3 py-2 text-center sm:text-start">
                <dt className="text-[11px] font-medium text-muted-foreground">{t(k)}</dt>
                <dd className={cn("text-xl font-bold tabular-nums", tone)}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <AttentionList data={data} onOpen={onOpen} />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Section title={t("figures.title")} hint={t("figures.hint")}>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
            <Stat label={t("figures.billed")} value={c(f.billed)} sub={t("figures.invoices", { count: f.invoiceCount })} />
            <Stat label={t("figures.received")} value={c(f.received)} accent="bg-emerald-500" />
            <Stat label={t("figures.expenses")} value={c(f.expenses)} accent="bg-rose-500" />
            <Stat label={t("figures.payroll")} value={c(f.payroll)} accent="bg-sky-500" />
            <Stat label={t("figures.itc")} value={c(f.itcClaimed)} accent="bg-violet-500" />
            <Stat label={t("figures.tdsCredits")} value={c(f.tdsCredits)} sub={t("figures.tdsDeducted", { amount: c(f.tdsDeducted), deposited: c(f.tdsDeposited) })} accent="bg-amber-500" />
          </div>
        </Section>

        <Section title={t("estimate.title")} hint={data.estimate ? t(data.estimate.basis === "PRESUMPTIVE" ? "estimate.presumptiveBasis" : "estimate.booksBasis") : undefined}>
          {data.estimate ? (
            <div className="space-y-3">
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("estimate.taxable")}</dt><dd className="font-semibold tabular-nums">{m(data.estimate.taxableIncome)}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("estimate.tax")}</dt><dd className="font-semibold tabular-nums">{m(data.estimate.tax)}</dd></div>
                <div className="flex justify-between gap-3 border-t border-border/60 pt-2"><dt className="font-medium">{t("estimate.payable")}</dt><dd className="text-lg font-bold tabular-nums">{m(data.estimate.payable)}</dd></div>
              </dl>
              <p className="text-xs text-muted-foreground">{t("estimate.note")}</p>
              <Link href="/tax/income-tax" className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("estimate.open")}<ArrowRight className="size-3.5 rtl:rotate-180" aria-hidden /></Link>
            </div>
          ) : <p className="text-sm text-muted-foreground">{t("estimate.none")}</p>}
        </Section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title={t("readiness.title")} right={<button type="button" onClick={() => goto("readiness")} className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("readiness.open")}</button>}>
          <div className="space-y-2">
            {data.readiness.areas.filter((a) => a.status !== "NOT_APPLICABLE").map((a) => (
              <div key={a.key} className="flex items-center justify-between gap-3 text-sm">
                <span>{t(`readiness.areas.${a.key}`)}</span>
                <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", a.status === "OK" ? "text-emerald-600 dark:text-emerald-300" : a.status === "BLOCKED" ? "text-rose-600 dark:text-rose-300" : "text-amber-600 dark:text-amber-300")}>
                  <span className={cn("size-1.5 rounded-full", a.status === "OK" ? "bg-emerald-500" : a.status === "BLOCKED" ? "bg-rose-500" : "bg-amber-500")} aria-hidden />
                  {t(`readiness.status.${a.status}`)}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section title={t("close.title")} hint={t("close.body")}>
          {close?.signedOffAt ? (
            <div className="space-y-3">
              <p className="flex items-start gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />{t("close.signed", { name: close.signedOffBy ?? "—", date: formatDay(close.signedOffAt, locale) })}</p>
              {data.access.signoff ? <Button variant="outline" size="sm" disabled={busy} onClick={unsignYear}>{t("close.undo")}</Button> : null}
            </div>
          ) : (
            <div className="space-y-3">
              {!data.readiness.readyToClose ? <p className="flex items-start gap-2 text-sm text-amber-800 dark:text-amber-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />{t("close.blocked", { count: data.readiness.blockers })}</p> : null}
              {data.access.signoff ? <Button size="sm" disabled={busy || !data.readiness.readyToClose} onClick={signYear}>{t("close.cta")}</Button> : <p className="text-xs text-muted-foreground">{t("close.needsCa")}</p>}
            </div>
          )}
        </Section>
      </div>

      <Section title={t("presumptive.title")} hint={t("presumptive.confirm")}>
        <div className="grid gap-3 md:grid-cols-3">
          {([["ada", data.presumptive.ada], ["ad", data.presumptive.ad]] as const).map(([key, v]) => (
            <div key={key} className="rounded-xl border border-border/60 p-3.5">
              <p className="text-sm font-semibold">{t(`presumptive.${key}`)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {!v.entityEligible ? t("presumptive.notEntity") : v.status === "WITHIN" ? t("presumptive.within", { limit: c(v.limit) }) : v.status === "WITHIN_IF_LOW_CASH" ? t("presumptive.withinLowCash", { high: c(v.limitIfLowCash) }) : t("presumptive.above")}
              </p>
              {v.entityEligible && v.status !== "ABOVE" ? <p className="mt-2 text-sm font-semibold tabular-nums">{t("presumptive.deemed", { amount: m(key === "ada" ? (v as typeof data.presumptive.ada).deemedIncome : (v as typeof data.presumptive.ad).deemedIncomeDigital) })}</p> : null}
            </div>
          ))}
          <div className="space-y-2 rounded-xl border border-border/60 p-3.5">
            <p className="text-sm font-semibold">{t("presumptive.audit")}</p>
            <p className="text-xs text-muted-foreground">{t(`taxAudit.${data.presumptive.taxAudit}`)}</p>
            <p className="text-xs text-muted-foreground">{t(`gstHint.${data.gstHint}`)}</p>
          </div>
        </div>
      </Section>
    </div>
  );
}
