"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoneyCompact, formatMonthLabel } from "./dashboard-format";

export type TrendSeries = { key: string; label: string; color: string };
export type TrendPoint = { monthId: string; name: string } & Record<string, number | string>;

type TooltipEntry = { dataKey?: string | number; value?: number | string; color?: string };

function TrendTooltip({
  active,
  payload,
  label,
  series,
  money,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: string;
  series: TrendSeries[];
  money: (value: number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-border/70 bg-popover px-3 py-2 text-popover-foreground shadow-lg">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <ul className="mt-1.5 space-y-1">
        {payload.map((entry) => {
          const meta = series.find((s) => s.key === entry.dataKey);
          return (
            <li key={String(entry.dataKey)} className="flex items-center justify-between gap-6 text-xs">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                <span className="h-2 w-2 rounded-sm" style={{ background: meta?.color }} aria-hidden />
                {meta?.label}
              </span>
              <span className="font-semibold tabular-nums text-foreground">{money(Number(entry.value ?? 0))}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Monthly bars for the selected financial year. Loaded on demand so the chart library stays out of the first paint. */
export default function DashboardTrendChart({
  data,
  series,
  currency,
  locale,
  money,
}: {
  data: TrendPoint[];
  series: TrendSeries[];
  currency: string;
  locale: string;
  money: (value: number) => string;
}) {
  const rows = data.map((point) => ({ ...point, label: formatMonthLabel(point.monthId, locale, point.name) }));
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--color-border)" strokeDasharray="3 4" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} interval="equidistantPreserveStart" minTickGap={6} tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }} />
        <YAxis
          width={52}
          tickLine={false}
          axisLine={false}
          tickCount={4}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          tickFormatter={(value: number) => formatMoneyCompact(value, currency, locale)}
        />
        <Tooltip cursor={{ fill: "var(--color-muted)", opacity: 0.6 }} content={<TrendTooltip series={series} money={money} />} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
