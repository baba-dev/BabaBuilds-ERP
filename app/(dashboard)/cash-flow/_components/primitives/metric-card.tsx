import { cn } from "@/lib/utils";
import { cashFlowTypography, dt } from "../cash-flow-typography";
import { cashFlowChrome } from "./styles";

export type MetricTone = "default" | "positive" | "warning" | "danger";

const toneClassName: Record<MetricTone, string> = {
  default: "border-zinc-200/55 dark:border-zinc-800/55 bg-white/45 dark:bg-zinc-900/30",
  positive: "border-emerald-200/55 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/14",
  warning: "border-amber-200/55 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/14",
  danger: "border-rose-200/55 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/14",
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
        cashFlowChrome.card,
        toneClassName[props.tone ?? "default"],
        props.className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className={dt(cashFlowTypography.labelUpperStrong)}>
            {props.label}
          </div>
          <div className={dt("mt-2.5", cashFlowTypography.value2xlLight)}>
            {props.value}
          </div>
          {props.subtext ? (
            <div className={dt("mt-2", cashFlowTypography.helperXs)}>{props.subtext}</div>
          ) : null}
        </div>
        {props.indicator ? <div className="shrink-0">{props.indicator}</div> : null}
      </div>
    </div>
  );
}
