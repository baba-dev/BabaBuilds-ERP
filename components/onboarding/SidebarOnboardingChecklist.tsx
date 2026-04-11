"use client";

import Link from "next/link";
import { CheckCircle2, Circle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { useSidebar } from "@/components/ui/sidebar";

export function SidebarOnboardingChecklist() {
  const { open, isMobile } = useSidebar();
  const { steps, completedSteps, disabled, isLoading, completeStep, dismiss, complete } = useOnboarding();

  if (isLoading || disabled || (!open && !isMobile)) {
    return null;
  }

  const completedSet = new Set(completedSteps);
  const remaining = steps.length - completedSet.size;

  return (
    <section className="mx-2 mb-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-200">Start Here</p>
          <p className="mt-1 text-xs text-zinc-200">{remaining === 0 ? "All done" : `${remaining} step${remaining === 1 ? "" : "s"} left`}</p>
        </div>
        <Button size="icon" variant="ghost" className="h-6 w-6 text-zinc-300 hover:text-white" onClick={() => void dismiss()} aria-label="Dismiss onboarding">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <ul className="space-y-2">
        {steps.map((step) => {
          const isDone = completedSet.has(step.id);
          return (
            <li key={step.id} className="rounded-lg border border-white/10 bg-black/10 p-2">
              <div className="flex items-start gap-2">
                {isDone ? <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" /> : <Circle className="mt-0.5 h-4 w-4 text-zinc-400" />}
                <div className="min-w-0">
                  <Link href={step.href} className="text-xs font-semibold text-zinc-100 hover:text-white">
                    {step.title}
                  </Link>
                  <p className="mt-0.5 text-[11px] leading-4 text-zinc-400">{step.description}</p>
                  {!isDone && (
                    <button className="mt-1 text-[10px] font-bold uppercase tracking-wider text-indigo-300 hover:text-indigo-200" onClick={() => void completeStep(step.id)}>
                      Mark complete
                    </button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <Button className="mt-3 h-8 w-full text-[11px] font-bold uppercase tracking-wider" onClick={() => void complete()}>
        <Sparkles className="mr-1 h-3.5 w-3.5" /> Complete onboarding
      </Button>
    </section>
  );
}
