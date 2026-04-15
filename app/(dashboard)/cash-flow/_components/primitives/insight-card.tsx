import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type CashFlowInsightTone = "default" | "positive" | "warning" | "danger";

const toneClasses: Record<CashFlowInsightTone, string> = {
  default:
    "border-zinc-200/70 dark:border-zinc-800/70 bg-white/50 dark:bg-zinc-900/40",
  positive:
    "border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/40 dark:bg-emerald-950/20",
  warning:
    "border-amber-200/60 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/20",
  danger:
    "border-rose-200/60 dark:border-rose-900/40 bg-rose-50/40 dark:bg-rose-950/20",
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
        "rounded-2xl border p-4 shadow-sm backdrop-blur-sm transition-colors",
        toneClasses[tone],
        props.className,
      )}
    >
      <div className="flex items-start gap-3">
        {props.icon ? (
          <div className="mt-0.5 rounded-xl border border-zinc-200/60 dark:border-zinc-800/60 bg-white/60 dark:bg-zinc-950/20 p-2 text-zinc-700 dark:text-zinc-200">
            {props.icon}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {props.title}
          </div>
          {props.description ? (
            <div className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
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

