"use client";

import { BarChart3 } from "lucide-react";
import { useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { ChartCard } from "@/components/charts/ChartCard";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { withChartTokenColors } from "@/components/charts/chart-colors";
import type { DashboardData } from "./types";

export function ChartsIsland({
  charts,
  fCurrency,
}: {
  charts: DashboardData["charts"];
  fCurrency: (value: number) => string;
}) {
  const t = useTranslations("Dashboard");
  const tr = (key: string, fallback: string, values?: any) => {
    const translation = t(key as any, values);
    if (translation === key || translation === `Dashboard.${key}`) return fallback;
    return translation;
  };
  const isMobile = useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") return () => undefined;
      const media = window.matchMedia("(max-width: 768px)");
      const listener = () => onStoreChange();
      media.addEventListener("change", listener);
      return () => media.removeEventListener("change", listener);
    },
    () => (typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false),
    () => false,
  );
  const serviceOrderHealth = withChartTokenColors(
    charts.serviceOrderHealth.map((row) => ({ name: row.status, value: row.value })),
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <ChartCard title={tr("chart_revenue_vs_expenses", "Revenue vs expenses")} description={tr("chart_revenue_vs_expenses_desc", "Track margin direction month-over-month.")} hasData={charts.revenueVsExpense.length > 0} noDataLabel={tr("chart_no_trend", "No trend yet")} noDataHint={tr("chart_no_trend_hint", "Create invoices and expenses to unlock trend insights.")} noDataIcon={BarChart3}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={charts.revenueVsExpense}>
            <defs>
              <linearGradient id="revenueGlow" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip content={<ChartTooltip formatterValue={fCurrency} />} />
            <Area type="monotone" dataKey="revenue" stroke="var(--chart-1)" fill="url(#revenueGlow)" strokeWidth={2.5} />
            <Line type="monotone" dataKey="expenses" stroke="var(--chart-4)" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={tr("chart_receivables_aging", "Receivables aging")} description={tr("chart_receivables_aging_desc", "Understand what cash is slowing down.")} hasData={charts.receivablesAging.length > 0} noDataLabel={tr("chart_no_receivables", "No receivables")} noDataHint={tr("chart_no_receivables_hint", "Outstanding receivables will appear here.")} noDataIcon={BarChart3}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={charts.receivablesAging}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.12} vertical={false} />
            <XAxis dataKey="bucket" axisLine={false} tickLine={false} />
            <YAxis axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} />
            <Tooltip content={<ChartTooltip formatterValue={fCurrency} />} />
            <Bar dataKey="value" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {!isMobile && <ChartCard title={tr("chart_proposal_funnel", "Proposal funnel")} description={tr("chart_proposal_funnel_desc", "See where deals stall before invoicing.")} hasData={charts.proposalFunnel.length > 0} noDataLabel={tr("chart_no_proposals", "No proposals")} noDataHint={tr("chart_no_proposals_hint", "Proposal pipeline metrics will render once activity starts.")} noDataIcon={BarChart3}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={charts.proposalFunnel} layout="vertical" margin={{ left: 16 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.12} horizontal={false} />
            <XAxis type="number" axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="stage" axisLine={false} tickLine={false} width={80} />
            <Tooltip content={<ChartTooltip />} />
            <Bar dataKey="value" fill="var(--chart-3)" radius={[0, 6, 6, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>}

      <ChartCard title={tr("chart_shop_order_health", "Shop order health")} description={tr("chart_shop_order_health_desc", "Paid vs pending vs failed storefront orders.")} hasData={charts.serviceOrderHealth.length > 0} noDataLabel={tr("chart_no_shop_orders", "No shop orders")} noDataHint={tr("chart_no_shop_orders_hint", "Service order health appears after public shop activity.")} noDataIcon={BarChart3} chartClassName="relative pb-20">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={<ChartTooltip />} />
            <Pie data={serviceOrderHealth} dataKey="value" nameKey="name" innerRadius={70} outerRadius={105} stroke="none" paddingAngle={3}>
              {serviceOrderHealth.map((entry, index) => (
                <Cell key={index} fill={entry.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
