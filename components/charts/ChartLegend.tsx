"use client";

import { cn } from "@/lib/utils";

type LegendItem = {
  label: string;
  color: string;
  value?: string;
};

type ChartLegendProps = {
  items: LegendItem[];
  compact?: boolean;
  className?: string;
};

export function ChartLegend({ items, compact = false, className }: ChartLegendProps) {
  if (!items.length) return null;

  return (
    <div
      className={cn(
        "grid gap-2",
        compact ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2",
        className
      )}
    >
      {items.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex items-center justify-between rounded-lg border border-zinc-200/70 dark:border-zinc-800/80 bg-zinc-50/80 dark:bg-zinc-950/30",
            compact ? "px-2.5 py-1.5" : "px-3 py-2"
          )}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
            <span className={cn("truncate font-semibold text-zinc-700 dark:text-zinc-200", compact ? "text-[11px]" : "text-xs")}>{item.label}</span>
          </div>
          {item.value ? (
            <span className={cn("font-bold text-zinc-900 dark:text-zinc-100", compact ? "text-[11px]" : "text-xs")}>{item.value}</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
