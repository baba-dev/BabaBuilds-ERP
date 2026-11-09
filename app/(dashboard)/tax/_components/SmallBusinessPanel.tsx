"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { ArrowUpRight, BadgeCheck, CircleAlert, Hourglass, Sprout, Store } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SmallBusinessStatus } from "@/lib/msme/data";
import { formatDay, Section, useJson, useMoney } from "./gst-utils";

const TONE: Record<string, { chip: string; bar: string; icon: typeof Sprout }> = {
  WELL_BELOW: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20", bar: "bg-emerald-500", icon: Sprout },
  APPROACHING: { chip: "bg-amber-50 text-amber-800 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-200 dark:ring-amber-400/20", bar: "bg-amber-500", icon: Hourglass },
  CROSSED: { chip: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20", bar: "bg-rose-500", icon: CircleAlert },
  REGISTERED: { chip: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/10 dark:text-indigo-300 dark:ring-indigo-400/20", bar: "bg-indigo-500", icon: BadgeCheck },
};

function Fact({ label, value, sub, ok }: { label: string; value: React.ReactNode; sub?: React.ReactNode; ok?: boolean }) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/60 p-3.5">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className={cn("mt-1 text-sm font-semibold", ok === false && "text-amber-700 dark:text-amber-300")}>{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/** Where a small business stands against the GST registration limit, plus Udyam, MSME class and MSE payments. */
export function SmallBusinessPanel({ goto }: { goto: (tab: string) => void }) {
  const t = useTranslations("SmallBusiness");
  const { data } = useJson<SmallBusinessStatus>("/api/msme/status");
  const { locale, m, c } = useMoney();
  if (!data || !data.applicable) return null;

  const th = data.threshold;
  const tone = TONE[th.status] ?? TONE.WELL_BELOW;
  const Icon = tone.icon;
  const percent = Math.round(Math.min(th.share, 1) * 100);
  const unregistered = data.registrationType === "UNREGISTERED";
  const udyam = data.udyam;

  return (
    <Section
      title={<span className="inline-flex items-center gap-2"><Store className="size-4 text-indigo-500" aria-hidden />{t("title")}</span>}
      hint={t("subtitle")}
      right={<span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1", tone.chip)}><Icon className="size-3.5" aria-hidden />{t(`status.${th.status}`)}</span>}
    >
      <div className="space-y-5">
        {th.status !== "REGISTERED" ? (
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm"><span className="text-xl font-bold tabular-nums">{m(th.turnover)}</span> <span className="text-muted-foreground">{t("of", { limit: m(th.limit) })}</span></p>
              <p className="text-xs text-muted-foreground">{t(`kind.${data.supplyKind}`)}{th.specialCategory ? ` · ${t("special")}` : ""}</p>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100} aria-label={t("progress")}>
              <motion.div className={cn("h-full rounded-full", tone.bar)} initial={{ width: 0 }} animate={{ width: `${percent}%` }} transition={{ duration: 0.7, ease: "easeOut" }} />
            </div>
            <p className="mt-2.5 text-sm text-muted-foreground">
              {th.status === "CROSSED"
                ? t("crossed", { date: formatDay(th.crossedOn ?? "", locale), applyBy: formatDay(th.applyBy ?? "", locale) })
                : th.status === "APPROACHING"
                  ? t("approaching", { percent, headroom: c(th.headroom) }) + (th.projectedCrossing ? " " + t("projected", { date: formatDay(th.projectedCrossing, locale) }) : "")
                  : t("below", { headroom: c(th.headroom) }) + (th.projectedCrossing ? " " + t("projected", { date: formatDay(th.projectedCrossing, locale) }) : "")}
            </p>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-3">
          <Fact
            label={t("udyam.label")}
            value={udyam.number ? <span className="font-mono text-[13px] tracking-wide">{udyam.number}</span> : t("udyam.none")}
            ok={udyam.number ? udyam.valid : undefined}
            sub={udyam.number ? (udyam.valid ? t("udyam.ok") : t("udyam.bad")) : <Link href="/settings" className="font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("udyam.add")}</Link>}
          />
          <Fact
            label={t("class.label")}
            value={t(`class.${data.classification.class}`)}
            sub={data.classification.basis === "TURNOVER_ONLY" ? t("class.turnoverOnly") : t("class.both")}
          />
          <Fact
            label={t("composition.label")}
            value={data.supplyKind === "BOTH" ? t("composition.na") : data.composition.eligible ? t("composition.yes", { rate: data.composition.rate }) : t("composition.over", { limit: c(data.composition.limit) })}
            sub={t("composition.hint")}
          />
        </div>

        {unregistered ? (
          <div className="rounded-xl bg-muted/40 p-4">
            <p className="text-sm font-semibold">{t("means.title")}</p>
            <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
              {(["r1", "r2", "r3", "r4"] as const).map((k) => <li key={k} className="flex gap-2"><span className="mt-2 size-1 shrink-0 rounded-full bg-indigo-400" aria-hidden />{t(`means.${k}`)}</li>)}
            </ul>
          </div>
        ) : null}

        <div className="rounded-xl border border-border/60 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{t("payables.title")}</p>
            <span className="text-xs text-muted-foreground">{t("payables.rule", { days: data.rules.paymentDays })}</span>
          </div>
          {data.payables.unpaidPastDue + data.payables.paidLate > 0 ? (
            <ul className="mt-2 space-y-1 text-sm">
              {data.payables.unpaidPastDue > 0 ? <li className="text-rose-700 dark:text-rose-300">{t("payables.unpaid", { count: data.payables.unpaidPastDue, amount: m(data.payables.unpaidPastDueAmount) })}</li> : null}
              {data.payables.paidLate > 0 ? <li className="text-amber-700 dark:text-amber-300">{t("payables.late", { count: data.payables.paidLate })}</li> : null}
            </ul>
          ) : <p className="mt-2 text-sm text-muted-foreground">{t("payables.none")}</p>}
          <Link href="/expenses" className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("payables.open")}<ArrowUpRight className="size-3 rtl:-scale-x-100" aria-hidden /></Link>
        </div>

        <button type="button" onClick={() => goto("setup")} className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-300">{t("editSetup")}</button>
      </div>
    </Section>
  );
}
