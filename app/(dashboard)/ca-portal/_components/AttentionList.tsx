"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Section, StateChip, formatDay, periodLabel, useKindName, useMoney, type CaItemView, type Overview } from "./ca-utils";

type Entry =
  | { type: "blocker"; key: string; code: string; count: number; amount?: number; href: string }
  | { type: "item"; key: string; item: CaItemView };

/** The handful of things to do next: blockers first, then what is overdue or due soon, in date order. */
export function AttentionList({ data, onOpen }: { data: Overview; onOpen: (i: CaItemView) => void }) {
  const t = useTranslations("CaCompliance.overview.attention");
  const tC = useTranslations("CaCompliance.calendar");
  const tI = useTranslations("CaCompliance.readiness.issues");
  const { locale, c } = useMoney();
  const kindName = useKindName();

  const blockers: Entry[] = data.readiness.areas.flatMap((a) => a.issues.filter((i) => i.severity === "blocker").map((i): Entry => ({ type: "blocker", key: `b-${i.code}`, code: i.code, count: i.count, amount: i.amount, href: i.href })));
  const items: Entry[] = data.items
    .filter((i) => (i.state === "OVERDUE" || i.state === "DUE_SOON") && i.kind !== "YEAR_CLOSE")
    .sort((a, b) => a.effectiveDue.localeCompare(b.effectiveDue))
    .map((item): Entry => ({ type: "item", key: item.id, item }));
  const list = [...blockers.slice(0, 3), ...items.slice(0, 5)].slice(0, 6);
  const more = blockers.length + items.length - list.length;

  return (
    <Section title={t("title")} hint={t("hint")}>
      {list.length === 0 ? (
        <p className="flex items-center gap-2 text-sm font-medium text-emerald-700 dark:text-emerald-300"><CheckCircle2 className="size-4" aria-hidden />{t("empty")}</p>
      ) : (
        <ul className="space-y-2">
          {list.map((e, idx) => (
            <motion.li key={e.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2, delay: idx * 0.04 }}>
              {e.type === "blocker" ? (
                <Link href={e.href} className="group flex items-center gap-3 rounded-xl border border-rose-200/70 bg-rose-50/60 px-3 py-2.5 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:border-rose-400/20 dark:bg-rose-500/10">
                  <AlertTriangle className="size-4 shrink-0 text-rose-600 dark:text-rose-300" aria-hidden />
                  <span className="min-w-0 flex-1 text-sm">{tI(e.code, { count: e.count, amount: c(e.amount ?? 0) })}</span>
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-rose-700 dark:text-rose-300">{t("fix")}<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" aria-hidden /></span>
                </Link>
              ) : (
                <button type="button" onClick={() => onOpen(e.item)} className={cn("group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", e.item.state === "OVERDUE" ? "border-rose-200/70 hover:bg-rose-50/60 dark:border-rose-400/20 dark:hover:bg-rose-500/10" : "border-amber-200/70 hover:bg-amber-50/60 dark:border-amber-400/20 dark:hover:bg-amber-500/10")}>
                  <CalendarClock className={cn("size-4 shrink-0", e.item.state === "OVERDUE" ? "text-rose-600 dark:text-rose-300" : "text-amber-600 dark:text-amber-300")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{kindName(e.item)} · {periodLabel(e.item.periodKey, locale)}</span>
                    <span className="block text-xs text-muted-foreground">{formatDay(e.item.effectiveDue, locale)} · {e.item.daysToDue < 0 ? tC("daysLate", { count: -e.item.daysToDue }) : tC("daysLeft", { count: e.item.daysToDue })}</span>
                  </span>
                  <StateChip state={e.item.state} />
                </button>
              )}
            </motion.li>
          ))}
        </ul>
      )}
      {more > 0 ? <p className="mt-3 text-xs text-muted-foreground">{t("more", { count: more })}</p> : null}
    </Section>
  );
}
