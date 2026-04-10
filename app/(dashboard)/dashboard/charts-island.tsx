"use client";

import { useEffect, useMemo, useState } from "react";
import { Landmark, Banknote } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { ChartCard } from "@/components/charts/ChartCard";
import { ChartTooltip } from "@/components/charts/ChartTooltip";
import { ChartLegend } from "@/components/charts/ChartLegend";
import { withChartTokenColors } from "@/components/charts/chart-colors";

export function ChartsIsland({
  revenueSeries,
  wealthSeries,
  t,
  fCurrency,
}: {
  revenueSeries: Array<{ name: string; revenue: number }>;
  wealthSeries: Array<{ name: string; value: number; color: string }>;
  t: (key: string) => string;
  fCurrency: (value: number) => string;
}) {
  const coloredWealth = useMemo(() => withChartTokenColors(wealthSeries), [wealthSeries]);
  const [isCompactCharts, setIsCompactCharts] = useState(
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 768px)");
    const onChange = (event: MediaQueryListEvent) => setIsCompactCharts(event.matches);
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <ChartCard title={t('revenue_trend')} description={t('monthly_billing')} hasData={revenueSeries.length > 0} noDataLabel={t('no_data_yet')} noDataHint={t("no_data_hint_revenue")} noDataIcon={Banknote}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={revenueSeries} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#52525b" opacity={0.15} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} interval={isCompactCharts ? 1 : 0} tick={{ fontSize: isCompactCharts ? 10 : 12, fill: '#71717a', fontWeight: 600 }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: isCompactCharts ? 10 : 12, fill: '#71717a', fontWeight: 600 }} tickFormatter={(value) => `${value / 1000}k`} />
            <Tooltip cursor={{ fill: 'rgba(113, 113, 122, 0.05)' }} content={<ChartTooltip formatterValue={fCurrency} compact={isCompactCharts} />} />
            <Bar dataKey="revenue" name={t("chart_revenue_name")} fill="var(--chart-1)" radius={[6, 6, 0, 0]} maxBarSize={48} className="hover:opacity-80 transition-opacity" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title={t('allocation')} description={t('functional_distribution')} hasData={coloredWealth.length > 0} noDataLabel={t('log_assets')} noDataHint={t("no_data_hint_assets")} noDataIcon={Landmark} chartClassName="flex items-center justify-center relative pb-24 sm:pb-20">
        <>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<ChartTooltip formatterValue={fCurrency} compact={isCompactCharts} />} />
              <Pie data={coloredWealth} cx="50%" cy="46%" innerRadius={isCompactCharts ? 65 : 85} outerRadius={isCompactCharts ? 90 : 115} paddingAngle={6} dataKey="value" stroke="none" className="focus:outline-none">
                {coloredWealth.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} className="hover:opacity-80 transition-opacity cursor-pointer" />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute top-1/2 -translate-y-1/2 flex flex-col items-center justify-center pointer-events-none">
            <div className="text-xs font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-1">{t('assets')}</div>
            <div className="text-3xl font-black text-zinc-900 dark:text-zinc-50">{coloredWealth.length}</div>
          </div>
          <div className="absolute left-0 right-0 bottom-0">
            <ChartLegend compact={isCompactCharts} items={coloredWealth.map((entry) => ({ label: String(entry.name), color: String(entry.color), value: fCurrency(Number(entry.value ?? 0)) }))} />
          </div>
        </>
      </ChartCard>
    </div>
  );
}
