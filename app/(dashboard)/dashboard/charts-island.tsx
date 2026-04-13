"use client";

import { BarChart3 } from "lucide-react";
import { useSyncExternalStore } from "react";
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
      <ChartCard title="Revenue vs expenses" description="Track margin direction month-over-month." hasData={charts.revenueVsExpense.length > 0} noDataLabel="No trend yet" noDataHint="Create invoices and expenses to unlock trend insights." noDataIcon={BarChart3}>
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

      <ChartCard title="Receivables aging" description="Understand what cash is slowing down." hasData={charts.receivablesAging.length > 0} noDataLabel="No receivables" noDataHint="Outstanding receivables will appear here." noDataIcon={BarChart3}>
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

      {!isMobile && <ChartCard title="Proposal funnel" description="See where deals stall before invoicing." hasData={charts.proposalFunnel.length > 0} noDataLabel="No proposals" noDataHint="Proposal pipeline metrics will render once activity starts." noDataIcon={BarChart3}>
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

      <ChartCard title="Shop order health" description="Paid vs pending vs failed storefront orders." hasData={charts.serviceOrderHealth.length > 0} noDataLabel="No shop orders" noDataHint="Service order health appears after public shop activity." noDataIcon={BarChart3} chartClassName="relative pb-20">
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
