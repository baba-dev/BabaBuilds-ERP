import { cn } from "@/lib/utils";

export type MetricTone = "default" | "positive" | "warning" | "danger";

const toneClassName: Record<MetricTone, string> = {
  default: "border-zinc-200/70 dark:border-zinc-800/70 bg-white/50 dark:bg-zinc-900/40",
  positive: "border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/15",
  warning: "border-amber-200/60 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/15",
  danger: "border-rose-200/60 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/15",
};

export function CashFlowMetricCard(props: {
  label: React.ReactNode;
  value: React.ReactNode;
  subtext?: React.ReactNode;
  tone?: MetricTone;
  indicator?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border p-4 shadow-sm backdrop-blur-sm transition-colors",
        toneClassName[props.tone ?? "default"],
        props.className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500 dark:text-zinc-400">
            {props.label}
          </div>
          <div className="mt-2 text-2xl font-black tracking-tight text-zinc-900 dark:text-zinc-50 tabular-nums">
            {props.value}
          </div>
          {props.subtext ? (
            <div className="mt-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">{props.subtext}</div>
          ) : null}
        </div>
        {props.indicator ? <div className="shrink-0">{props.indicator}</div> : null}
      </div>
    </div>
  );
}

