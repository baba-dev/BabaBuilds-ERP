"use client";

import { useTranslations } from "next-intl";
import { ArrowDownRight, ArrowUpRight, CalendarClock, CircleDollarSign, Hourglass, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { InvoiceSummaryDto } from "@/lib/invoices/types";
import { deltaPercent, formatMoney, formatMoneyCompact } from "./income-utils";

type Props = {
  summary: InvoiceSummaryDto | null;
  loading: boolean;
  locale: string;
  onShowOverdue: () => void;
  onShowOpen: () => void;
};

function Delta({ current, previous }: { current: string; previous: string }) {
  const t = useTranslations("Income.kpi");
  const pct = deltaPercent(current, previous);
  if (pct === null) return <span className="text-xs text-muted-foreground">{t("noPrevious")}</span>;
  const up = pct >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold", up ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-rose-500/10 text-rose-700 dark:text-rose-300")}>
        <Icon className="size-3.5" aria-hidden />
        {Math.abs(pct)}%
      </span>
      {t("vsPrevious")}
    </span>
  );
}

function Card({ icon: Icon, label, hint, children, accent }: { icon: typeof Wallet; label: string; hint: string; children: React.ReactNode; accent: string }) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5">
      <div className={cn("pointer-events-none absolute -end-10 -top-10 size-32 rounded-full opacity-[0.12] transition-opacity group-hover:opacity-20", accent)} aria-hidden />
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium text-muted-foreground">
          <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm sm:size-8", accent)}>
            <Icon className="size-4" aria-hidden />
          </span>
          {label}
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={hint} className="rounded-full px-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              ?
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-[16rem] text-balance leading-snug">{hint}</TooltipContent>
        </Tooltip>
      </div>
      <div className="mt-4 space-y-1.5">{children}</div>
    </div>
  );
}

export function KpiStrip({ summary, loading, locale, onShowOverdue, onShowOpen }: Props) {
  const t = useTranslations("Income.kpi");

  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-busy={loading}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[148px] rounded-2xl" />
        ))}
      </div>
    );
  }

  const currency = summary.baseCurrency;
  const money = (v: string) => formatMoney(v, currency, locale);
  const outstanding = Number(summary.outstanding);
  const overduePct = outstanding > 0 ? Math.min(100, Math.round((Number(summary.overdue) / outstanding) * 100)) : 0;
  const multiCurrency = summary.billedByCurrency.some((b) => b.currency !== currency);

  return (
    <TooltipProvider delayDuration={150}>
      <div className={cn("grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4 transition-opacity", loading && "opacity-70")} aria-busy={loading}>
        <Card icon={CircleDollarSign} label={t("billed")} hint={t("billedHint")} accent="bg-indigo-500">
          <p className="text-xl font-bold tracking-tight tabular-nums sm:text-2xl" title={money(summary.billed)}>
            {formatMoneyCompact(summary.billed, currency, locale)}
          </p>
          <Delta current={summary.billed} previous={summary.billedPrevious} />
          {multiCurrency && <p className="text-xs text-muted-foreground">{t("convertedNote", { currency })}</p>}
        </Card>

        <Card icon={Wallet} label={t("collected")} hint={t("collectedHint")} accent="bg-emerald-500">
          <p className="text-xl font-bold tracking-tight tabular-nums sm:text-2xl" title={money(summary.collected)}>
            {formatMoneyCompact(summary.collected, currency, locale)}
          </p>
          <Delta current={summary.collected} previous={summary.collectedPrevious} />
        </Card>

        <Card icon={Hourglass} label={t("outstanding")} hint={t("outstandingHint")} accent="bg-amber-500">
          <button type="button" onClick={onShowOpen} className="block rounded-md text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <p className="text-xl font-bold tracking-tight tabular-nums sm:text-2xl" title={money(summary.outstanding)}>
              {formatMoneyCompact(summary.outstanding, currency, locale)}
            </p>
          </button>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={t("overdueShare", { pct: overduePct })}>
            <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${overduePct}%` }} />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 text-xs">
            {summary.overdueCount > 0 ? (
              <button type="button" onClick={onShowOverdue} className="font-semibold text-rose-600 hover:underline dark:text-rose-400">
                {t("overdue", { amount: formatMoneyCompact(summary.overdue, currency, locale), count: summary.overdueCount })}
              </button>
            ) : (
              <span className="text-muted-foreground">{t("nothingOverdue")}</span>
            )}
            <span className="text-muted-foreground">{t("openCount", { count: summary.openCount })}</span>
          </div>
        </Card>

        <Card icon={CalendarClock} label={t("daysToPay")} hint={t("daysToPayHint")} accent="bg-sky-500">
          <p className="text-xl font-bold tracking-tight tabular-nums sm:text-2xl">
            {summary.avgDaysToPay === null ? "—" : t("days", { count: summary.avgDaysToPay })}
          </p>
          <p className="text-xs text-muted-foreground">{summary.avgDaysToPay === null ? t("noPaidYet") : t("daysToPayBasis")}</p>
        </Card>
      </div>
    </TooltipProvider>
  );
}
