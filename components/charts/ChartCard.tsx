"use client";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type ChartCardProps = {
  title: string;
  description?: string;
  children: ReactNode;
  hasData: boolean;
  noDataLabel: string;
  noDataHint?: string;
  noDataIcon?: LucideIcon;
  className?: string;
  chartClassName?: string;
  headerAction?: ReactNode;
  icon?: LucideIcon;
};

export function ChartCard({
  title,
  description,
  children,
  hasData,
  noDataLabel,
  noDataHint,
  noDataIcon: NoDataIcon,
  className,
  chartClassName,
  headerAction,
  icon: Icon,
}: ChartCardProps) {
  return (
    <Card className={cn(
      "shadow-sm border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-900/60 overflow-hidden",
      "hover:border-zinc-300 dark:hover:border-zinc-700/60 transition-colors duration-200", 
      className
    )}>
      <CardHeader className="pb-4 sm:pb-6 flex flex-row items-start justify-between space-y-0">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-zinc-400 dark:text-zinc-500" strokeWidth={2.5} />}
            <CardTitle className="text-xs font-bold uppercase tracking-[0.1em] text-zinc-800 dark:text-zinc-100">
              {title}
            </CardTitle>
          </div>
          {description ? <CardDescription className="text-[11px] sm:text-xs dark:text-zinc-400 font-medium leading-relaxed">{description}</CardDescription> : null}
        </div>
        {headerAction && <div className="flex-shrink-0">{headerAction}</div>}
      </CardHeader>
      <CardContent>
        <div className={cn("h-[280px] w-full", chartClassName)}>
          {hasData ? (
            children
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 text-center text-zinc-500 dark:text-zinc-400 px-6 animate-in fade-in zoom-in-95 duration-500">
              {NoDataIcon ? (
                <div className="mb-3 rounded-full border border-zinc-200 dark:border-zinc-800/80 bg-white dark:bg-zinc-900/40 p-3 shadow-sm">
                  <NoDataIcon className="h-4 w-4 opacity-50 text-zinc-400" />
                </div>
              ) : null}
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-zinc-400 dark:text-zinc-500">{noDataLabel}</p>
              {noDataHint ? <p className="mt-1 text-[11px] font-medium text-zinc-400/80 dark:text-zinc-500/80 max-w-[200px]">{noDataHint}</p> : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

