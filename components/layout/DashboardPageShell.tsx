"use client";

import { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
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
  actions?: ReactNode;
  pageActions?: ReactNode;
  icon?: ReactNode;
  kpiCard?: DashboardPageShellKpiCard;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  headerVariant?: "default" | "retainersHero";
  breadcrumb?: ReactNode;
  children: ReactNode;
  animated?: boolean;
  animationClassName?: string;
};

const defaultAnimationClassName =
  "animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out";

const headerBaseClassName =
  "sticky top-0 z-20 -mx-4 border-b bg-background/80 px-4 py-4 backdrop-blur-md transition-all duration-300 md:-mx-8 md:px-8";

const headerDividerClassName = "border-border/60";

const kpiCardToneClassNames = {
  default: "border-border/60 bg-card text-card-foreground",
  positive: "border-emerald-300/60 bg-emerald-50 text-emerald-800 dark:border-emerald-700/60 dark:bg-emerald-950/40 dark:text-emerald-200",
  warning: "border-amber-300/60 bg-amber-50 text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200",
  danger: "border-rose-300/60 bg-rose-50 text-rose-900 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-200",
};

function isStructuredKpiCard(value: DashboardPageShellKpiCard | undefined): value is Exclude<DashboardPageShellKpiCard, ReactNode> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  return "label" in value && "value" in value;
}

export function DashboardPageShell({
  title,
  description,
  actions,
  pageActions,
  icon,
  kpiCard,
  primaryAction,
  secondaryActions,
  headerVariant = "default",
  breadcrumb,
  children,
  animated = true,
  animationClassName = defaultAnimationClassName,
}: DashboardPageShellProps) {
  const resolvedActions = pageActions ?? actions;
  const resolvedSecondaryActions = secondaryActions ?? resolvedActions;
  const structuredKpiCard = isStructuredKpiCard(kpiCard) ? kpiCard : null;
  const kpiCardNode = structuredKpiCard ? null : (kpiCard as ReactNode | undefined);

  return (
    <div className="min-h-full bg-background/50 p-4 transition-colors duration-300 md:p-8">
      <div className={cn("mx-auto max-w-7xl space-y-8", animated && animationClassName)}>
        <header className={cn(headerBaseClassName, headerDividerClassName)}>
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <SidebarTrigger className="md:hidden" />
                <span className="min-h-5">{breadcrumb}</span>
              </div>
              {headerVariant === "default" && resolvedActions ? <div className="shrink-0">{resolvedActions}</div> : null}
            </div>

            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 flex-1 items-start gap-3">
                {icon ? (
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-card text-card-foreground">
                    {icon}
                  </div>
                ) : null}
                <div className="min-w-0 space-y-1.5">
                  <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
                  {description ? <p className="max-w-xl text-sm font-medium text-muted-foreground">{description}</p> : null}
                </div>
              </div>

              {(kpiCard || primaryAction || resolvedSecondaryActions) && (
                <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:min-w-[220px] md:items-end">
                  {kpiCard ? (
                    structuredKpiCard ? (
                      <div
                        className={cn(
                          "w-full rounded-lg border p-3 text-left md:w-auto md:min-w-[220px]",
                          kpiCardToneClassNames[structuredKpiCard.tone ?? "default"],
                        )}
                      >
                        <p className="text-xs font-medium uppercase tracking-wide opacity-75">{structuredKpiCard.label}</p>
                        <p className="text-2xl font-semibold leading-tight">{structuredKpiCard.value}</p>
                      </div>
                    ) : (
                      <div className="w-full md:w-auto">{kpiCardNode}</div>
                    )
                  ) : null}

                  {(primaryAction || resolvedSecondaryActions) && (
                    <div className="flex w-full flex-wrap items-center justify-start gap-2 md:w-auto md:justify-end">
                      {resolvedSecondaryActions}
                      {primaryAction}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
