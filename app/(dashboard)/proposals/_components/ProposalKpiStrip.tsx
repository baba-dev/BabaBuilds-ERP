"use client";

import { useTranslations } from "next-intl";
import { CalendarClock, CheckCircle2, Hourglass, Trophy } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ProposalSummaryDto } from "@/lib/proposals/types";
import { formatMoney, formatMoneyCompact } from "./proposal-utils";

type Props = {
  summary: ProposalSummaryDto | null;
  loading: boolean;
  locale: string;
  onShowOpen: () => void;
  onShowReady: () => void;
  onShowExpiring: () => void;
};

function Card({ icon: Icon, label, accent, children, onClick }: { icon: typeof Hourglass; label: string; accent: string; children: React.ReactNode; onClick?: () => void }) {
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
    <button type="button" onClick={onClick} className={cn(cls, "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function ProposalKpiStrip({ summary, loading, locale, onShowOpen, onShowReady, onShowExpiring }: Props) {
  const t = useTranslations("ProposalsHub");
  if (!summary) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4" aria-busy={loading}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-[132px] rounded-2xl" />
        ))}
      </div>
    );
  }
  const c = summary.baseCurrency;
  return (
    <div className={cn("grid grid-cols-2 gap-3 transition-opacity sm:gap-4 xl:grid-cols-4", loading && "opacity-70")} aria-busy={loading}>
      <Card icon={Hourglass} label={t("kpi.open")} accent="bg-sky-500" onClick={onShowOpen}>
        <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl" title={formatMoney(summary.openValue, c, locale)}>
          {formatMoneyCompact(summary.openValue, c, locale)}
        </p>
        <p className="text-xs text-muted-foreground">{t("kpi.openCount", { count: summary.openCount })}</p>
      </Card>
      <Card icon={CheckCircle2} label={t("kpi.ready")} accent="bg-emerald-500" onClick={onShowReady}>
        <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl" title={formatMoney(summary.readyToInvoiceValue, c, locale)}>
          {formatMoneyCompact(summary.readyToInvoiceValue, c, locale)}
        </p>
        <p className="text-xs text-muted-foreground">{summary.readyToInvoiceCount > 0 ? t("kpi.readyCount", { count: summary.readyToInvoiceCount }) : t("kpi.readyNone")}</p>
      </Card>
      <Card icon={Trophy} label={t("kpi.winRate")} accent="bg-violet-500">
        <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{summary.winRate === null ? "—" : `${summary.winRate}%`}</p>
        <p className="text-xs text-muted-foreground">
          {summary.avgDaysToAccept === null ? t("kpi.winRateEmpty", { days: summary.windowDays }) : t("kpi.avgDays", { days: summary.avgDaysToAccept })}
        </p>
      </Card>
      <Card icon={CalendarClock} label={t("kpi.expiring")} accent="bg-amber-500" onClick={summary.expiringSoonCount > 0 ? onShowExpiring : undefined}>
        <p className="text-xl font-bold tabular-nums tracking-tight sm:text-2xl">{summary.expiringSoonCount}</p>
        <p className="text-xs text-muted-foreground">{t("kpi.drafts", { count: summary.draftCount })}</p>
      </Card>
    </div>
  );
}
