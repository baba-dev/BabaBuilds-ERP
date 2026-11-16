"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Landmark, PiggyBank, ReceiptText, Repeat, Scale, TrendingDown, TrendingUp, Wallet, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DASHBOARD_ROUTES } from "./dashboard-routes";
import { percentChange } from "./dashboard-format";
import { Delta, ProgressBar, Sparkline, focusRing, toneTextClass, type Tone } from "./dashboard-ui";
import type { DashboardData } from "./types";

type Money = (value: number) => string;

function KpiTile({
  href,
  icon: Icon,
  label,
  value,
  footer,
  delta,
  visual,
  tone = "neutral",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
  footer: ReactNode;
  delta?: ReactNode;
  visual?: ReactNode;
  tone?: Tone;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative flex min-w-0 flex-col rounded-2xl border border-border/70 bg-card p-4 shadow-xs transition-[border-color,box-shadow,transform] duration-200 hover:border-foreground/20 hover:shadow-md active:scale-[0.99] sm:p-5",
        focusRing,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2 text-xs font-medium text-muted-foreground">
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          <span className="truncate">{label}</span>
        </span>
        <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground rtl:-scale-x-100" aria-hidden />
      </div>
      <p className={cn("mt-3 truncate text-[22px] font-semibold leading-none tracking-tight tabular-nums text-foreground sm:text-[28px]", tone === "critical" && toneTextClass.critical)}>
        {value}
      </p>
      <div className="mt-2 flex min-h-5 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        {delta}
        <span className="line-clamp-2 min-w-0">{footer}</span>
      </div>
      {visual ? <div className="mt-3">{visual}</div> : null}
    </Link>
  );
}

function StatTile({ href, icon: Icon, label, value, hint, children }: { href: string; icon: LucideIcon; label: string; value: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex min-w-0 flex-col justify-between gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-xs transition-colors hover:border-foreground/20",
        focusRing,
      )}
    >
      <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
      </span>
      <span className="truncate text-base font-semibold tabular-nums tracking-tight text-foreground sm:text-lg">{value}</span>
      {children}
      {hint ? <span className="truncate text-[11px] text-muted-foreground">{hint}</span> : null}
    </Link>
  );
}

/** Split of what is owed by how late it is; each segment is also listed in the receivables panel. */
function AgingStrip({ aging }: { aging: DashboardData["receivables"]["aging"] }) {
  const total = aging.reduce((sum, row) => sum + row.value, 0);
  const colors: Record<string, string> = {
    not_due: "bg-emerald-500/70",
    "1_30": "bg-amber-400",
    "31_60": "bg-orange-500",
    "61_plus": "bg-rose-500",
  };
  if (total <= 0) return <div className="h-1.5 rounded-full bg-muted" aria-hidden />;
  return (
    <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full" aria-hidden>
      {aging.filter((row) => row.value > 0).map((row) => (
        <span key={row.bucket} className={cn("h-full rounded-full", colors[row.bucket] ?? "bg-muted-foreground")} style={{ width: `${(row.value / total) * 100}%` }} />
      ))}
    </div>
  );
}

export function DashboardKpis({ data, money, hasCollections }: { data: DashboardData; money: Money; hasCollections: boolean }) {
  const t = useTranslations("DashboardHome");
  const { financialPulse: pulse, receivables, attention, charts } = data;

  // Months after the current one are empty by definition; leaving them in would end every trend line at zero.
  const currentIndex = charts.revenueVsExpense.findIndex((point) => point.monthId === charts.currentMonthId);
  const series = currentIndex >= 0 ? charts.revenueVsExpense.slice(0, currentIndex + 1) : charts.revenueVsExpense;
  const thisMonth = currentIndex >= 0 ? charts.revenueVsExpense[currentIndex] : null;
  const lastMonth = currentIndex > 0 ? charts.revenueVsExpense[currentIndex - 1] : null;

  const revenueDelta = thisMonth && lastMonth ? percentChange(thisMonth.revenue, lastMonth.revenue) : null;
  const expenseDelta = thisMonth && lastMonth ? percentChange(thisMonth.expenses, lastMonth.expenses) : null;
  const margin = pulse.billedRevenue > 0 ? Math.round((pulse.netIncome / pulse.billedRevenue) * 100) : null;
  const reconTone: Tone = pulse.reconciliationProgress >= 80 ? "positive" : pulse.reconciliationProgress >= 50 ? "warning" : "critical";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          href={DASHBOARD_ROUTES.invoices}
          icon={TrendingUp}
          label={t("kpi.revenue")}
          value={money(pulse.billedRevenue)}
          delta={<Delta value={revenueDelta} label={t("kpi.vsLastMonth")} />}
          footer={revenueDelta === null ? t("kpi.collected", { amount: money(pulse.collected) }) : t("kpi.vsLastMonth")}
          visual={<Sparkline values={series.map((p) => p.revenue)} className="text-orange-500" />}
        />
        <KpiTile
          href={hasCollections ? DASHBOARD_ROUTES.collections : DASHBOARD_ROUTES.overdueInvoices}
          icon={Wallet}
          label={t("kpi.outstanding")}
          value={money(receivables.outstandingAmount)}
          footer={
            receivables.overdueAmount > 0 ? (
              <span className={toneTextClass.critical}>{t("kpi.overdue", { amount: money(receivables.overdueAmount), count: attention.overdueReceivables })}</span>
            ) : attention.outstandingReceivables > 0 ? (
              t("kpi.noneOverdue", { count: attention.outstandingReceivables })
            ) : (
              t("kpi.nothingOwed")
            )
          }
          visual={<div className="flex h-9 items-end"><AgingStrip aging={receivables.aging} /></div>}
        />
        <KpiTile
          href={DASHBOARD_ROUTES.expenses}
          icon={TrendingDown}
          label={t("kpi.expenses")}
          value={money(pulse.expenses)}
          delta={<Delta value={expenseDelta} label={t("kpi.vsLastMonth")} goodWhenDown />}
          footer={expenseDelta === null ? t("kpi.approvedSpend") : t("kpi.vsLastMonth")}
          visual={<Sparkline values={series.map((p) => p.expenses)} className="text-muted-foreground" />}
        />
        <KpiTile
          href={DASHBOARD_ROUTES.reporting}
          icon={Scale}
          label={t("kpi.net")}
          value={money(pulse.netIncome)}
          tone={pulse.netIncome < 0 ? "critical" : "neutral"}
          footer={margin === null ? t("kpi.netHint") : t("kpi.margin", { percent: margin })}
          visual={<Sparkline values={series.map((p) => p.revenue - p.expenses)} className={pulse.netIncome < 0 ? "text-rose-500" : "text-emerald-500"} />}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile href={DASHBOARD_ROUTES.retainers} icon={Repeat} label={t("stat.mrr")} value={money(pulse.recurringRevenue)} hint={t("stat.arr", { amount: money(pulse.arr) })} />
        <StatTile href={DASHBOARD_ROUTES.tax} icon={ReceiptText} label={t("stat.estimatedTax")} value={money(pulse.estimatedTax)} hint={t("stat.estimatedTaxHint")} />
        <StatTile href={DASHBOARD_ROUTES.tax} icon={PiggyBank} label={t("stat.liquidAssets")} value={money(pulse.liquidAssets)} hint={t("stat.liquidAssetsHint")} />
        {pulse.bankTransactions > 0 ? (
          <StatTile href={DASHBOARD_ROUTES.reconciliation} icon={Landmark} label={t("stat.reconciled")} value={`${pulse.reconciliationProgress}%`}>
            <ProgressBar value={pulse.reconciliationProgress} tone={reconTone} label={t("stat.reconciled")} />
          </StatTile>
        ) : (
          <StatTile href={DASHBOARD_ROUTES.bankImport} icon={Landmark} label={t("stat.reconciled")} value="—" hint={t("stat.noBankFeed")} />
        )}
      </div>
    </div>
  );
}
