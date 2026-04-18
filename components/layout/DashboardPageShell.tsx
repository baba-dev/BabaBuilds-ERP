"use client";

import { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { typography as ty, tx } from "@/lib/ui/typography";
import { cn } from "@/lib/utils";

type DashboardPageShellKpiCard =
  | ReactNode
  | {
      label: ReactNode;
      value: ReactNode;
      tone?: "default" | "positive" | "warning" | "danger";
    };

type DashboardPageShellProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  kpiCard?: DashboardPageShellKpiCard;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  headerVariant?: "default" | "compact";
  actions?: ReactNode;
  pageActions?: ReactNode;
  breadcrumb?: ReactNode;
  headerTone?: "plain" | "transparent";
  headerClassName?: string;
  children: ReactNode;
  animated?: boolean;
  animationClassName?: string;
  maxWidthClassName?: string;
};

const defaultAnimationClassName =
  "animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out";

const kpiCardToneClassNames = {
  default: "border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 text-zinc-900 dark:text-zinc-50",
  positive:
    "border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400",
  warning:
    "border-amber-200/60 dark:border-amber-900/40 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400",
  danger:
    "border-rose-200/60 dark:border-rose-900/40 bg-rose-50/50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-400",
};


function isStructuredKpiCard(
  value: DashboardPageShellKpiCard | undefined,
): value is Exclude<DashboardPageShellKpiCard, ReactNode> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return "label" in value && "value" in value;
}

export function DashboardPageShell({
  title,
  description,
  icon,
  kpiCard,
  primaryAction,
  secondaryActions,
  headerVariant = "default",
  actions,
  pageActions,
  breadcrumb,
  headerTone = "plain",
  headerClassName,
  children,
  animated = true,
  animationClassName = defaultAnimationClassName,
  maxWidthClassName = "max-w-7xl",
}: DashboardPageShellProps) {
  const resolvedActions =
    pageActions ??
    actions ??
    (primaryAction || secondaryActions ? (
      <div className="flex items-center gap-2">
        {secondaryActions}
        {primaryAction}
      </div>
    ) : null);

  const isCompactHeader = headerVariant === "compact";
  const headerToneClassName =
    headerTone === "transparent"
      ? "bg-transparent dark:bg-transparent"
      : "bg-background dark:bg-background";
  const resolvedKpiCard = isStructuredKpiCard(kpiCard) ? (
    <div
      className={cn(
        "inline-flex flex-col gap-0.5 rounded-xl border px-5 py-2.5 shadow-sm text-center sm:text-right backdrop-blur-sm transition-all",
        kpiCardToneClassNames[kpiCard.tone ?? "default"],
      )}
    >
      <span className="text-[0.65rem] font-bold uppercase tracking-[0.15em] opacity-60">
        {kpiCard.label}
      </span>
      <span className={tx(ty.metricValueMd, "text-xl font-black")}>{kpiCard.value}</span>
    </div>
  ) : (
    kpiCard
  );


  return (
    <div className="min-h-full bg-background/50 p-4 transition-colors duration-300 md:p-8">
      <div className={cn("mx-auto space-y-8", maxWidthClassName, animated && animationClassName)}>
        <header
          className={cn(
            "sticky top-0 z-20 -mx-4 border-b border-zinc-200/50 px-4 backdrop-blur-md transition-all duration-300 dark:border-zinc-800/50 md:-mx-8 md:px-8",
            headerToneClassName,
            isCompactHeader ? "py-3" : "py-4",
            headerClassName,
          )}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className={tx(ty.labelUpper, "text-muted-foreground flex items-center gap-2")}>
                <SidebarTrigger className="md:hidden" />
                {breadcrumb ? <span className="min-h-5">{breadcrumb}</span> : null}
              </div>
              {/* Desktop-only action placement for non-compact header handled below */}
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  {icon ? (
                    <div className="p-2.5 bg-indigo-600/10 dark:bg-indigo-500/20 rounded-xl border border-indigo-200/50 dark:border-indigo-400/20 transition-all duration-300">
                      {icon}
                    </div>
                  ) : null}

                  <h1 className={cn(ty.pageTitle, "text-foreground", isCompactHeader ? "text-2xl sm:text-2xl lg:text-2xl" : "text-3xl sm:text-3xl lg:text-3xl")}>
                    {title}
                  </h1>
                </div>
                {description ? (
                  <p className={tx(ty.helper, "max-w-xl font-medium")}>{description}</p>
                ) : null}
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                {resolvedKpiCard ? <div className="backdrop-blur-sm">{resolvedKpiCard}</div> : null}
                {headerVariant === "default" && resolvedActions ? (
                  <div className="shrink-0">{resolvedActions}</div>
                ) : null}
              </div>
            </div>
          </div>
        </header>


        {children}
      </div>
    </div>
  );
}
