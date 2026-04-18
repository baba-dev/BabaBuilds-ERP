"use client";

import { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";

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
  default: "text-zinc-900 dark:text-zinc-50",
  positive:
    "text-emerald-700 dark:text-emerald-400",
  warning:
    "text-amber-700 dark:text-amber-400",
  danger:
    "text-rose-700 dark:text-rose-400",
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
    <Card
      size="sm"
      variant="tinted"
      className={cn(
        "inline-flex border-0 px-5 py-2.5 text-center sm:text-right",
        kpiCardToneClassNames[kpiCard.tone ?? "default"],
      )}
    >
      <CardContent className="px-0">
        <span className="text-[0.65rem] font-bold uppercase tracking-[0.15em] opacity-60">
          {kpiCard.label}
        </span>
        <span className="text-xl font-black leading-tight tracking-tight">{kpiCard.value}</span>
      </CardContent>
    </Card>
  ) : (
    kpiCard
  );


  return (
    <div className="min-h-full bg-background/50 p-4 transition-colors duration-300 md:p-8">
      <div className={cn("mx-auto space-y-8", maxWidthClassName, animated && animationClassName)}>
        <header
          className={cn(
            "sticky top-0 z-20 -mx-4 rounded-b-2xl border-b border-zinc-200/50 px-4 backdrop-blur-md transition-all duration-200 ease-out dark:border-zinc-800/50 md:-mx-8 md:px-8",
            headerToneClassName,
            isCompactHeader ? "py-3" : "py-4",
            headerClassName,
          )}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <SidebarTrigger className="md:hidden" />
                {breadcrumb ? <span className="min-h-5">{breadcrumb}</span> : null}
              </div>
              {/* Desktop-only action placement for non-compact header handled below */}
            </div>

            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  {icon ? (
                    <div className="rounded-xl border border-indigo-200/50 bg-indigo-600/10 p-2.5 transition-all duration-200 ease-out dark:border-indigo-400/20 dark:bg-indigo-500/20">
                      {icon}
                    </div>
                  ) : null}

                  <h1 className={cn("font-bold tracking-tight text-foreground", isCompactHeader ? "text-2xl" : "text-3xl")}>
                    {title}
                  </h1>
                </div>
                {description ? (
                  <p className="max-w-xl text-sm font-medium text-zinc-500 dark:text-zinc-400">{description}</p>
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
