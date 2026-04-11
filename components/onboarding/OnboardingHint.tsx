"use client";

import { Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import type { OnboardingStepId } from "@/lib/onboarding";

export function OnboardingHint({
  stepId,
  title,
  message,
  className,
}: {
  stepId: OnboardingStepId;
  title: string;
  message: string;
  className?: string;
}) {
  const { completedSteps, disabled, isLoading, completeStep } = useOnboarding();
  if (isLoading || disabled || completedSteps.includes(stepId)) {
    return null;
  }

  return (
    <div className={[
      "rounded-xl border border-amber-300/70 bg-amber-50/80 p-3 text-amber-950 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-100",
      className,
    ].filter(Boolean).join(" ")}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider">{title}</p>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className="mt-1 cursor-help text-xs text-amber-900/90 dark:text-amber-200/90 inline-flex items-center gap-1">
                  <Lightbulb className="h-3.5 w-3.5" /> {message}
                </p>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-xs">
                Once you finish this action, mark the step complete to hide onboarding permanently.
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <Button size="sm" variant="outline" className="h-7 text-[10px] font-bold uppercase tracking-wider" onClick={() => void completeStep(stepId)}>
          Done
        </Button>
      </div>
    </div>
  );
}
