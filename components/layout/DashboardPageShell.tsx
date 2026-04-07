"use client";

import { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type DashboardPageShellProps = {
  title: ReactNode;
  description?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  kpiCard?: ReactNode;
  maxWidthClassName?: string;
  actions?: ReactNode;
  pageActions?: ReactNode;
  breadcrumb?: ReactNode;
  children: ReactNode;
  animated?: boolean;
  animationClassName?: string;
};

const defaultAnimationClassName =
  "animate-in fade-in slide-in-from-bottom-4 duration-500 ease-out";

export function DashboardPageShell({
  title,
  description,
  primaryAction,
  secondaryActions,
  kpiCard,
  maxWidthClassName = "max-w-7xl",
  actions,
  pageActions,
  breadcrumb,
  children,
  animated = true,
  animationClassName = defaultAnimationClassName,
}: DashboardPageShellProps) {
  const resolvedSecondaryActions = secondaryActions ?? pageActions ?? actions;

  return (
    <div className="min-h-full bg-zinc-50/50 p-4 transition-colors duration-300 dark:bg-zinc-950 md:p-8">
      <div className={cn("mx-auto space-y-8", maxWidthClassName, animated && animationClassName)}>
        <header className="sticky top-0 z-20 -mx-4 border-b border-zinc-200/50 bg-zinc-50/80 px-4 py-4 backdrop-blur-md transition-all duration-300 dark:border-zinc-800/50 dark:bg-zinc-950/70 md:-mx-8 md:px-8">
          <div className={cn("mx-auto flex w-full flex-col gap-4", maxWidthClassName)}>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <SidebarTrigger className="md:hidden" />
                <span className="min-h-5">{breadcrumb}</span>
              </div>
              {resolvedSecondaryActions ? <div className="shrink-0">{resolvedSecondaryActions}</div> : null}
            </div>
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1.5">
                <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
                {description ? (
                  <p className="max-w-xl text-sm font-medium text-zinc-500 dark:text-zinc-400">{description}</p>
                ) : null}
              </div>
              {(kpiCard || primaryAction) ? (
                <div className="flex shrink-0 items-center gap-3 self-start md:justify-end">
                  {kpiCard ? <div>{kpiCard}</div> : null}
                  {primaryAction ? <div>{primaryAction}</div> : null}
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
