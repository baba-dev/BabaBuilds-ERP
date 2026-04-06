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
}: ChartCardProps) {
  return (
    <Card className={cn("shadow-sm border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900", className)}>
      <CardHeader className="pb-6">
        <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-800 dark:text-zinc-100">{title}</CardTitle>
        {description ? <CardDescription className="text-xs dark:text-zinc-400 font-medium">{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>
        <div className={cn("h-[300px] w-full", chartClassName)}>
          {hasData ? (
            children
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/30 text-center text-zinc-500 dark:text-zinc-400 px-6">
              {NoDataIcon ? (
                <div className="mb-3 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5">
                  <NoDataIcon className="h-4 w-4" />
                </div>
              ) : null}
              <p className="text-xs font-bold uppercase tracking-widest">{noDataLabel}</p>
              {noDataHint ? <p className="mt-1 text-[11px] font-medium text-zinc-400 dark:text-zinc-500">{noDataHint}</p> : null}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
