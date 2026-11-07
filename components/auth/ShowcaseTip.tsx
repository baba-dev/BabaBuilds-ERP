"use client";

import type { ReactNode } from "react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Focusable wrapper that shows a tooltip on hover *and* keyboard focus.
 * Kept tiny and client-only so the surrounding showcase can stay a server component.
 */
export default function ShowcaseTip({
  content,
  children,
  className,
  side = "top",
}: {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipProvider delayDuration={120}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div tabIndex={0} className={className}>
            {children}
          </div>
        </TooltipTrigger>
        <TooltipContent side={side} sideOffset={8} className="max-w-[16rem] text-balance border border-black/10 bg-zinc-50 py-2 leading-snug text-zinc-900 shadow-xl [&>svg]:!bg-zinc-50 [&>svg]:!fill-zinc-50">
          {content}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
