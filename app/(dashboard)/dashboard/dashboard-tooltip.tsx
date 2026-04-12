"use client";

import { CircleHelp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function DashboardTooltip({ label }: { label: string }) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors" aria-label={label}>
            <CircleHelp className="h-3.5 w-3.5" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[260px] text-xs leading-relaxed">{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
