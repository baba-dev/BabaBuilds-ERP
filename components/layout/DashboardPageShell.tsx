"use client";

import { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type DashboardPageShellProps = {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  kpiCard?: ReactNode;
  primaryAction?: ReactNode;
  secondaryActions?: ReactNode;
  headerVariant?: "default" | "compact";
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
  icon,
  kpiCard,
  primaryAction,
  secondaryActions,
  headerVariant = "default",
  actions,
  pageActions,
  breadcrumb,
  children,
  animated = true,
  animationClassName = defaultAnimationClassName,
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

  return (
    <div className="min-h-full bg-zinc-50/50 p-4 transition-colors duration-300 dark:bg-zinc-950 md:p-8">
      <div className={cn("mx-auto max-w-7xl space-y-8", animated && animationClassName)}>
        <header
          className={cn(
            "sticky top-0 z-20 -mx-4 border-b border-zinc-200/50 bg-zinc-50/80 px-4 backdrop-blur-md transition-all duration-300 dark:border-zinc-800/50 dark:bg-zinc-950/70 md:-mx-8 md:px-8",
            isCompactHeader ? "py-3" : "py-4",
          )}
        >
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <SidebarTrigger className="md:hidden" />
                <span className="min-h-5">{breadcrumb}</span>
              </div>
              {resolvedActions ? <div className="shrink-0">{resolvedActions}</div> : null}
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-3">
                {icon ? <span className="shrink-0">{icon}</span> : null}
                <h1 className={cn("font-bold tracking-tight text-foreground", isCompactHeader ? "text-2xl" : "text-3xl")}>
                  {title}
                </h1>
              </div>
              {description ? (
                <p className="max-w-xl text-sm font-medium text-zinc-500 dark:text-zinc-400">{description}</p>
              ) : null}
              {kpiCard ? <div>{kpiCard}</div> : null}
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
