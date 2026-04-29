"use client";

import Link from "next/link";
import {
  BadgeCheck,
  Briefcase,
  CheckCircle2,
  Circle,
  Flag,
  HardHat,
  LayoutDashboard,
  Receipt,
  Repeat,
  Settings2,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import { useSidebar } from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export function SidebarOnboardingChecklist() {
  const { open, isMobile } = useSidebar();
  const { steps, completedSteps, disabled, isDemoUser, isLoading, completeStep, dismiss, complete, persona } = useOnboarding();

  if (isLoading || disabled || isDemoUser || (!open && !isMobile)) {
    return null;
  }

  const completedSet = new Set(completedSteps);
  const remaining = steps.length - completedSet.size;
  const progressPercent = Math.round((completedSet.size / steps.length) * 100);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="mx-3 mb-2 flex items-center justify-between gap-3 rounded-xl border border-indigo-500/20 bg-indigo-500/5 p-3 text-left transition-all hover:border-indigo-500/40 hover:bg-indigo-500/10 group"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-600 shadow-lg shadow-indigo-500/20 transition-transform group-hover:scale-110">
              <Flag className="h-4 w-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-400">
                {persona ? `${persona.toUpperCase()} Path` : "Start Here"}
              </p>
              <p className="truncate text-xs font-semibold text-zinc-200">
                {remaining === 0 ? "Setup Complete" : "Finish your setup"}
              </p>
            </div>
          </div>
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-800/50 text-[10px] font-bold text-zinc-400 group-hover:bg-indigo-500/20 group-hover:text-indigo-300">
            {progressPercent}%
          </div>
        </button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[480px] bg-zinc-950 border-white/10 p-0 overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-1 bg-indigo-600" />
        
        <div className="p-6">
          <DialogHeader className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <DialogTitle className="text-xl font-bold text-zinc-50">Welcome to BabaBuilds</DialogTitle>
                <DialogDescription className="mt-1 text-zinc-400">
                  {persona
                    ? `Follow this ${persona.toUpperCase()} path and complete your first money task.`
                    : "Follow these steps to get your ERP ready for business."}
                </DialogDescription>
              </div>
              <div className="rounded-full bg-indigo-600/10 p-2">
                <Sparkles className="h-6 w-6 text-indigo-400" />
              </div>
            </div>
          </DialogHeader>

          <div className="mb-6">
            <div className="flex items-baseline justify-between mb-2">
              <span className="text-sm font-medium text-zinc-300">Overall Progress</span>
              <span className="text-sm font-bold text-indigo-400">{progressPercent}%</span>
            </div>
            <Progress value={progressPercent} className="h-2 bg-zinc-800" />
          </div>

          <TooltipProvider>
            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
              {steps.map((step) => {
                const isDone = completedSet.has(step.id);
                const iconKey = step.icon as string;
                const StepIcon =
                  iconKey === "layout-dashboard"
                    ? LayoutDashboard
                    : iconKey === "users"
                      ? Users
                      : iconKey === "briefcase"
                        ? Briefcase
                        : iconKey === "receipt"
                          ? Receipt
                          : iconKey === "repeat"
                            ? Repeat
                            : iconKey === "hard-hat"
                              ? HardHat
                              : iconKey === "badge-check"
                                ? BadgeCheck
                                : Settings2;
                return (
                  <div
                    key={step.id}
                    className={`group relative flex items-start gap-4 rounded-xl border p-4 transition-all ${
                      isDone
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.04]"
                    }`}
                  >
                    <div className="mt-0.5 shrink-0">
                      {isDone ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <Circle className="h-5 w-5 text-zinc-600 group-hover:text-zinc-500" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <Link
                            href={step.href}
                            className={`text-sm font-bold transition-colors inline-flex items-center gap-2 ${
                              isDone ? "text-zinc-400 line-through" : "text-zinc-100 hover:text-indigo-400"
                            }`}
                          >
                            <StepIcon className="h-3.5 w-3.5 shrink-0" />
                            {step.title}
                          </Link>
                          <p className="mt-1 text-[11px] uppercase tracking-wider text-indigo-300/80">
                            {step.valueStatement}
                          </p>
                        </div>
                      </div>
                      <p className={`mt-1 text-xs leading-relaxed ${isDone ? "text-zinc-500" : "text-zinc-400"}`}>
                        {step.description}
                      </p>

                      {!isDone && (
                        <div className="mt-3 flex items-center gap-3">
                          <Button
                            asChild
                            variant="secondary"
                            size="sm"
                            className="h-7 px-3 text-[10px] font-bold uppercase tracking-wider bg-indigo-600 text-white hover:bg-indigo-500 border-none"
                          >
                            <Link href={step.href}>Go to step</Link>
                          </Button>
                          <button
                            onClick={() => void completeStep(step.id)}
                            className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 hover:text-emerald-400 transition-colors"
                          >
                            Mark Done
                          </button>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-[10px] cursor-help rounded-full border border-zinc-700 px-2 py-0.5 text-zinc-400">
                                Tip
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>{step.description}</p>
                            </TooltipContent>
                          </Tooltip>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </TooltipProvider>

          <div className="mt-8 flex items-center justify-between pt-6 border-t border-white/5">
            <button 
              onClick={() => void dismiss()}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-300 transition-colors"
            >
              Skip onboarding for now
            </button>
            <Button 
              onClick={() => void complete()}
              disabled={remaining > 0}
              className="px-6 bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
            >
              Claim Reward
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
