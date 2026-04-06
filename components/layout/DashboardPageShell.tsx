"use client";

import { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

type DashboardPageShellProps = {
  title: ReactNode;
  description?: ReactNode;
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
  actions,
  pageActions,
  breadcrumb,
  children,
  animated = true,
  animationClassName = defaultAnimationClassName,
}: DashboardPageShellProps) {
  const resolvedActions = pageActions ?? actions;

  return (
    <div className="min-h-full bg-zinc-50/50 p-4 transition-colors duration-300 dark:bg-zinc-950 md:p-8">
      <div className={cn("mx-auto max-w-7xl space-y-8", animated && animationClassName)}>
        <header className="sticky top-0 z-20 -mx-4 border-b border-zinc-200/50 bg-zinc-50/80 px-4 py-4 backdrop-blur-md transition-all duration-300 dark:border-zinc-800/50 dark:bg-zinc-950/70 md:-mx-8 md:px-8">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <SidebarTrigger className="md:hidden" />
                <span className="min-h-5">{breadcrumb}</span>
              </div>
              {resolvedActions ? <div className="shrink-0">{resolvedActions}</div> : null}
            </div>
            <div className="space-y-1.5">
              <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">{title}</h1>
              {description ? (
                <p className="max-w-xl text-sm font-medium text-zinc-500 dark:text-zinc-400">{description}</p>
              ) : null}
            </div>
          </div>
        </header>

        {children}
      </div>
    </div>
  );
}
