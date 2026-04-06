"use client";

import { cn } from "@/lib/utils";

type ChartTooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  color?: string;
  value?: number | string;
};

type ChartTooltipProps = {
  active?: boolean;
  payload?: ChartTooltipPayloadItem[];
  label?: string | number;
  formatterValue?: (value: number) => string;
  compact?: boolean;
};

export function ChartTooltip({
  active,
  payload,
  label,
  formatterValue,
  compact = false,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-800 bg-zinc-950/95 text-zinc-50 shadow-xl backdrop-blur-sm",
        compact ? "px-2.5 py-2 text-[11px]" : "px-3.5 py-2.5 text-xs"
      )}
    >
      {label ? <p className="mb-1.5 font-bold text-zinc-200">{label}</p> : null}
      <div className="space-y-1">
        {payload.map((item) => {
          const rawValue = Number(item.value ?? 0);
          const tone = item.color || "var(--chart-1)";
          return (
            <div key={`${item.dataKey}-${item.name}`} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tone }} />
              <span className="font-semibold text-zinc-300">{item.name ?? item.dataKey}</span>
              <span className="ml-auto font-bold text-zinc-50">
                {formatterValue ? formatterValue(rawValue) : rawValue.toLocaleString()}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
