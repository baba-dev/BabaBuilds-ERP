"use client";

import { useMemo } from "react";
import {
  Building2,
  Calculator,
  BriefcaseBusiness,
  HardHat,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/components/onboarding/OnboardingProvider";
import type { OnboardingPersona } from "@/lib/onboarding";

const personaCards: Array<{
  key: OnboardingPersona;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: "ca",
    title: "CA / Accountant",
    description: "Tax and compliance-first setup with filing readiness milestones.",
    icon: Calculator,
  },
  {
    key: "agency",
    title: "Agency",
    description: "Pipeline, retainers, and monthly billing workflow.",
    icon: BriefcaseBusiness,
  },
  {
    key: "freelancer",
    title: "Freelancer",
    description: "Proposal-to-invoice flow with recurring income focus.",
    icon: UserRound,
  },
  {
    key: "contractor",
    title: "Contractor",
    description: "Milestone invoicing, expenses, and project cash control.",
    icon: HardHat,
  },
];

export function PersonaPicker() {
  const { persona, isLoading, isDemoUser, setPersona } = useOnboarding();
  const shouldShow = useMemo(
    () => !isLoading && !isDemoUser && !persona,
    [isDemoUser, isLoading, persona],
  );

  if (!shouldShow) return null;

  return (
    <section className="rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50 via-white to-cyan-50 p-5 shadow-sm dark:border-indigo-900/50 dark:from-indigo-950/25 dark:via-zinc-900 dark:to-cyan-950/20">
      <div className="mb-4 flex items-center gap-2">
        <Building2 className="h-5 w-5 text-indigo-500" />
        <h3 className="text-lg font-black text-zinc-900 dark:text-zinc-50">
          Personalize your onboarding
        </h3>
      </div>
      <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-300">
        Pick your business persona to get a focused path ending with a money task.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {personaCards.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.key}
              variant="outline"
              className="h-auto items-start justify-start gap-3 rounded-xl border-zinc-200 p-4 text-left hover:border-indigo-300 hover:bg-indigo-50 dark:border-zinc-800 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30"
              onClick={() => void setPersona(item.key)}
            >
              <div className="rounded-lg bg-indigo-100 p-2 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300">
                <Icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
                  {item.title}
                </p>
                <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                  {item.description}
                </p>
              </div>
            </Button>
          );
        })}
      </div>
    </section>
  );
}
