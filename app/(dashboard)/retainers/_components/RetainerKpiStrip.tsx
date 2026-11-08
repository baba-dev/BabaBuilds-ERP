"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CalendarClock, Repeat, Wallet } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { RetainerSummaryDto } from "@/lib/retainers/types";
import { formatMoney, formatMoneyCompact } from "./retainer-utils";

type Props = { summary: RetainerSummaryDto | null; loading: boolean; locale: string; onShowDue: () => void; onShowActive: () => void; onShowIssues: () => void };

function Card({ icon: Icon, label, accent, onClick, children }: { icon: typeof Repeat; label: string; accent: string; onClick?: () => void; children: React.ReactNode }) {
  const body = (
    <>
      <div className={cn("pointer-events-none absolute -end-10 -top-10 size-32 rounded-full opacity-[0.12] transition-opacity group-hover:opacity-20", accent)} aria-hidden />
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-lg text-white shadow-sm sm:size-8", accent)}>
          <Icon className="size-4" aria-hidden />
        </span>
        {label}
      </div>
      <div className="mt-4 space-y-1.5 text-start">{children}</div>
    </>
  );
  const cls = "group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-4 shadow-sm transition-shadow hover:shadow-md sm:p-5";
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>{body}</button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function RetainerKpiStrip({ summary, loading, locale, onShowDue, onShowActive, onShowIssues }: Props) {
  const t = useTranslations("RetainersHub.kpi");
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-busy={loading}>
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[132px] rounded-2xl" />)}
      </div>
    );
  }
  const c = summary.baseCurrency;
  const attention = summary.issueCount + summary.dueCount;
  return (
    <div className={cn("grid grid-cols-2 gap-3 transition-opacity sm:gap-4 xl:grid-cols-4", loading && "opacity-70")} aria-busy={loading}>
      <Card icon={Repeat} label={t("mrr")} accent="bg-indigo-500" onClick={onShowActive}>
        <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl" title={formatMoney(summary.mrr, c, locale)}>{formatMoneyCompact(summary.mrr, c, locale)}</p>
        <p className="text-xs text-muted-foreground">{t("mrrHint", { count: summary.activeCount, arr: formatMoneyCompact(summary.arr, c, locale) })}</p>
      </Card>
      <Card icon={CalendarClock} label={t("next30")} accent="bg-sky-500">
        <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl" title={formatMoney(summary.next30Value, c, locale)}>{formatMoneyCompact(summary.next30Value, c, locale)}</p>
        <p className="text-xs text-muted-foreground">{t("next30Count", { count: summary.next30Count })}</p>
      </Card>
      <Card icon={Wallet} label={t("outstanding")} accent="bg-emerald-500">
        <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl" title={formatMoney(summary.outstandingValue, c, locale)}>{formatMoneyCompact(summary.outstandingValue, c, locale)}</p>
        <p className="text-xs text-muted-foreground">{summary.overdueCount > 0 ? t("overdue", { count: summary.overdueCount }) : t("outstandingCount", { count: summary.outstandingCount })}</p>
      </Card>
      <Card icon={AlertTriangle} label={t("attention")} accent="bg-amber-500" onClick={attention > 0 ? (summary.issueCount > 0 ? onShowIssues : onShowDue) : undefined}>
        <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{attention}</p>
        <p className="text-xs text-muted-foreground">{t("attentionHint", { due: summary.dueCount, issues: summary.issueCount, paused: summary.pausedCount })}</p>
      </Card>
    </div>
  );
}
