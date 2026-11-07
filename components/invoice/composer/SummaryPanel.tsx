"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { Check, Circle, Loader2, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnimatedMoney } from "@/components/invoice/composer/AnimatedMoney";

export type SummaryLine = { id: string; title: string; quantity: number; amount: number };

type Props = {
  clientName: string | null;
  currency: string;
  baseCurrency: string;
  exchangeRate: number | null;
  lines: SummaryLine[];
  total: number;
  format: (n: number) => string;
  taxLabel: string;
  checks: { client: boolean; items: boolean; company: boolean };
  submitting: boolean;
  submittingLabel: string;
  submitLabel: string;
  canSubmit: boolean;
  /** Renders as the compact sticky bottom bar used on small screens. */
  compact?: boolean;
};

export function SummaryPanel({ clientName, currency, baseCurrency, exchangeRate, lines, total, format, taxLabel, checks, submitting, submittingLabel, submitLabel, canSubmit, compact = false }: Props) {
  const t = useTranslations("InvoiceComposer.summary");
  const reduce = useReducedMotion();
  const foreign = currency !== baseCurrency;

  if (compact) {
    return (
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur lg:hidden">
        {/* pe-16 keeps the CTA clear of the floating assistant button on small screens */}
        <div className="mx-auto flex max-w-xl items-center gap-3 pe-16 sm:pe-0">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">{lines.length > 0 ? t("itemsCount", { count: lines.length }) : t("noItems")}</p>
            <AnimatedMoney value={total} format={format} className="block truncate text-xl font-bold tabular-nums" />
          </div>
          <Button type="submit" variant="primary-action" size="lg" disabled={!canSubmit || submitting} className="h-12 shrink-0 gap-2 rounded-xl px-5 font-semibold">
            {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Receipt className="size-4" aria-hidden />}
            {submitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      </div>
    );
  }

  const checklist: Array<[string, boolean]> = [
    [t("checkClient"), checks.client],
    [t("checkItems"), checks.items],
    [t("checkCompany"), checks.company],
  ];

  return (
    <aside className="space-y-4 rounded-2xl border border-border/70 bg-card p-5 shadow-sm" aria-label={t("title")}>
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">{t("title")}</h2>
        <span className="rounded-full bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{currency}</span>
      </div>

      <p className={cn("truncate text-sm", clientName ? "font-medium" : "text-muted-foreground")}>{clientName ?? t("noClient")}</p>

      <ul className="min-h-[3.5rem] space-y-1.5 border-y border-border/60 py-3 text-sm">
        <AnimatePresence initial={false}>
          {lines.length === 0 ? (
            <motion.li key="empty" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-muted-foreground">
              {t("noItems")}
            </motion.li>
          ) : (
            lines.map((line) => (
              <motion.li key={line.id} layout={reduce ? false : "position"} initial={reduce ? false : { opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={reduce ? undefined : { opacity: 0, x: 8 }} className="flex justify-between gap-3">
                <span className="truncate">
                  {line.title}
                  {line.quantity > 1 && <span className="text-muted-foreground"> × {line.quantity}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{format(line.amount)}</span>
              </motion.li>
            ))
          )}
        </AnimatePresence>
      </ul>

      <div>
        <p className="text-xs text-muted-foreground">{t("total")}</p>
        <AnimatedMoney value={total} format={format} className="block text-3xl font-black tracking-tight tabular-nums" />
        <p className="mt-1 text-xs text-muted-foreground">{t("taxNote", { taxLabel })}</p>
        {foreign && exchangeRate ? <p className="mt-1 text-xs text-muted-foreground">{t("baseNote", { amount: `${baseCurrency} ${(total * exchangeRate).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, rate: exchangeRate })}</p> : null}
      </div>

      <ul className="space-y-1.5 text-sm" aria-label={t("checklist")}>
        {checklist.map(([label, ok]) => (
          <li key={label} className={cn("flex items-center gap-2 transition-colors", ok ? "text-foreground" : "text-muted-foreground")}>
            <motion.span key={String(ok)} initial={reduce ? false : { scale: 0.6 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }} className={cn("flex size-4 items-center justify-center rounded-full", ok ? "bg-emerald-500 text-white" : "text-muted-foreground")}>
              {ok ? <Check className="size-3" aria-hidden /> : <Circle className="size-3" aria-hidden />}
            </motion.span>
            {label}
          </li>
        ))}
      </ul>

      <Button type="submit" variant="primary-action" size="lg" disabled={!canSubmit || submitting} className="h-12 w-full gap-2 rounded-xl text-base font-semibold">
        {submitting ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Receipt className="size-4" aria-hidden />}
        {submitting ? submittingLabel : submitLabel}
      </Button>
      <p className="text-center text-xs text-muted-foreground">{t("reviewNote")}</p>
    </aside>
  );
}
