import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { dt, cashFlowTypography } from "../cash-flow-typography";
import { cashFlowChrome } from "./styles";

export type CashFlowInsightTone = "default" | "positive" | "warning" | "danger";

const toneClasses: Record<CashFlowInsightTone, string> = {
  default:
    "border-zinc-200/55 dark:border-zinc-800/55 bg-white/45 dark:bg-zinc-900/30",
  positive:
    "border-emerald-200/55 dark:border-emerald-900/40 bg-emerald-50/30 dark:bg-emerald-950/16",
  warning:
    "border-amber-200/55 dark:border-amber-900/40 bg-amber-50/30 dark:bg-amber-950/16",
  danger:
    "border-rose-200/55 dark:border-rose-900/40 bg-rose-50/30 dark:bg-rose-950/16",
};

export function CashFlowInsightCard(props: {
  title: ReactNode;
  description?: ReactNode;
  tone?: CashFlowInsightTone;
  icon?: ReactNode;
  ctas?: Array<
    | { label: string; onClick: () => void; variant?: "default" | "outline" | "secondary"; disabled?: boolean }
    | { label: string; href: string; variant?: "default" | "outline" | "secondary" }
  >;
  className?: string;
}) {
  const tone = props.tone ?? "default";
  return (
    <div
      className={cn(
        cashFlowChrome.card,
        toneClasses[tone],
        props.className,
      )}
    >
      <div className="flex items-start gap-3">
        {props.icon ? (
          <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl border border-zinc-200/55 bg-white/55 text-zinc-700 shadow-[0_1px_2px_rgba(15,23,42,0.06)] [&_svg]:h-4 [&_svg]:w-4 dark:border-zinc-800/55 dark:bg-zinc-950/22 dark:text-zinc-200">
            {props.icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className={dt(cashFlowTypography.cardTitle)}>{props.title}</div>
          {props.description ? (
            <div className={dt("mt-1.5", cashFlowTypography.helper)}>
              {props.description}
            </div>
          ) : null}
          {props.ctas && props.ctas.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {props.ctas.map((cta, idx) => {
                if ("href" in cta) {
                  return (
                    <Button
                      key={idx}
                      variant={cta.variant ?? "outline"}
                      size="sm"
                      asChild
                      className="h-8 gap-1.5"
                    >
                      <Link href={cta.href}>
                        {cta.label} <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  );
                }
                return (
                  <Button
                    key={idx}
                    variant={cta.variant ?? "outline"}
                    size="sm"
                    onClick={cta.onClick}
                    disabled={cta.disabled}
                    className="h-8"
                  >
                    {cta.label}
                  </Button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
