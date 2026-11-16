"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BarChart3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { DASHBOARD_ROUTES } from "./dashboard-routes";
import { EmptyNote, Panel, focusRing } from "./dashboard-ui";
import type { TrendPoint, TrendSeries } from "./dashboard-trend-chart";
import type { DashboardData } from "./types";

const DashboardTrendChart = dynamic(() => import("./dashboard-trend-chart"), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse rounded-xl bg-muted/60" />,
});

type View = "cash" | "recurring";

const REVENUE_COLOR = "var(--color-accent-primary)";
const EXPENSE_COLOR = "color-mix(in oklab, var(--color-muted-foreground) 55%, transparent)";

export function DashboardTrend({
  charts,
  fyLabel,
  currency,
  locale,
  money,
}: {
  charts: DashboardData["charts"];
  fyLabel: string;
  currency: string;
  locale: string;
  money: (value: number) => string;
}) {
  const t = useTranslations("DashboardHome");
  const [view, setView] = useState<View>("cash");

  const series: TrendSeries[] =
    view === "cash"
      ? [
          { key: "revenue", label: t("trend.revenue"), color: REVENUE_COLOR },
          { key: "expenses", label: t("trend.expenses"), color: EXPENSE_COLOR },
        ]
      : [{ key: "mrr", label: t("trend.recurring"), color: REVENUE_COLOR }];
  const points: TrendPoint[] = view === "cash" ? charts.revenueVsExpense : charts.recurringRevenue;
  const totals = series.map((s) => ({ ...s, total: points.reduce((sum, p) => sum + Number(p[s.key] ?? 0), 0) }));
  const hasData = totals.some((s) => s.total > 0);
  // Recurring revenue is a run-rate, so the meaningful figure is the latest month, not a sum.
  const currentMrr = charts.recurringRevenue.find((p) => p.monthId === charts.currentMonthId)?.mrr ?? charts.recurringRevenue.at(-1)?.mrr ?? 0;

  const views: Array<{ id: View; label: string }> = [
    { id: "cash", label: t("trend.viewCash") },
    { id: "recurring", label: t("trend.viewRecurring") },
  ];

  return (
    <Panel
      labelledBy="dash-trend"
      title={t("trend.title")}
      description={t("trend.description", { fy: fyLabel })}
      action={
        <div role="tablist" aria-label={t("trend.title")} className="flex rounded-lg bg-muted p-0.5">
          {views.map((option) => (
            <button
              key={option.id}
              type="button"
              role="tab"
              aria-selected={view === option.id}
              onClick={() => setView(option.id)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors pointer-coarse:min-h-9",
                view === option.id ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                focusRing,
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      {!hasData ? (
        <EmptyNote
          icon={BarChart3}
          className="min-h-[240px]"
          title={view === "cash" ? t("trend.emptyTitle", { fy: fyLabel }) : t("trend.emptyRecurringTitle")}
          hint={view === "cash" ? t("trend.emptyHint") : t("trend.emptyRecurringHint")}
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={view === "cash" ? DASHBOARD_ROUTES.newInvoice : DASHBOARD_ROUTES.newRetainer}>
                {view === "cash" ? t("actions.newInvoice") : t("actions.newRetainer")}
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <dl className="flex flex-wrap gap-x-6 gap-y-2">
            {totals.map((s) => (
              <div key={s.key} className="min-w-0">
                <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
                  {view === "cash" ? s.label : t("trend.recurringNow")}
                </dt>
                <dd className="mt-0.5 text-base font-semibold tabular-nums tracking-tight text-foreground">{money(view === "cash" ? s.total : currentMrr)}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 h-[220px] w-full sm:h-[260px]" dir="ltr">
            <DashboardTrendChart data={points} series={series} currency={currency} locale={locale} money={money} />
          </div>
        </>
      )}
    </Panel>
  );
}
