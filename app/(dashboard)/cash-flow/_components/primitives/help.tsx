"use client";

import * as React from "react";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { cashFlowIcon } from "./styles";

export function CashFlowHelp({
  label,
  children,
  className,
  iconClassName,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "h-7 w-7 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100/55 dark:hover:bg-zinc-800/55",
              className,
            )}
            aria-label={label}
          >
            <Info className={cn(cashFlowIcon.inline, iconClassName)} />
          </Button>
        </TooltipTrigger>
        <TooltipContent sideOffset={8} className="max-w-sm">
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider opacity-80">{label}</div>
            <div className="text-xs leading-relaxed text-background/90">{children}</div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
