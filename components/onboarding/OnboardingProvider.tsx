"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { ONBOARDING_STEPS, type OnboardingStep, type OnboardingStepId } from "@/lib/onboarding";

type OnboardingState = {
  steps: OnboardingStep[];
  completedSteps: OnboardingStepId[];
  disabled: boolean;
  isFirstLogin: boolean;
  isDemoUser: boolean;
  isLoading: boolean;
  completeStep: (stepId: OnboardingStepId) => Promise<void>;
  dismiss: () => Promise<void>;
  complete: () => Promise<void>;
};

const OnboardingContext = createContext<OnboardingState | null>(null);

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [steps, setSteps] = useState<OnboardingStep[]>(ONBOARDING_STEPS);
  const [completedSteps, setCompletedSteps] = useState<OnboardingStepId[]>([]);
  const [disabled, setDisabled] = useState(true);
  const [isFirstLogin, setIsFirstLogin] = useState(false);
  const [isDemoUser, setIsDemoUser] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/user/onboarding", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setSteps(data.steps || ONBOARDING_STEPS);
      setCompletedSteps(Array.isArray(data.completedSteps) ? data.completedSteps : []);
      setDisabled(Boolean(data.disabled));
      setIsFirstLogin(Boolean(data.isFirstLogin));
      setIsDemoUser(Boolean(data.isDemoUser));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const updateState = (data: Partial<OnboardingState> & { steps?: OnboardingStep[]; completedSteps?: OnboardingStepId[]; disabled?: boolean; isFirstLogin?: boolean; isDemoUser?: boolean }) => {
    setSteps(data.steps || ONBOARDING_STEPS);
    setCompletedSteps(Array.isArray(data.completedSteps) ? data.completedSteps : []);
    setDisabled(Boolean(data.disabled));
    setIsFirstLogin(Boolean(data.isFirstLogin));
    setIsDemoUser(Boolean(data.isDemoUser));
  };

  const sendAction = useCallback(async (action: "dismiss" | "complete" | "complete_step", stepId?: OnboardingStepId) => {
    const res = await fetch("/api/user/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, stepId }),
    });
    if (!res.ok) {
      throw new Error("Failed to save onboarding state");
    }
    const data = await res.json();
    updateState(data);
  }, []);

  const value = useMemo<OnboardingState>(() => ({
    steps,
    completedSteps,
    disabled,
    isFirstLogin,
    isDemoUser,
    isLoading,
    completeStep: async (stepId) => sendAction("complete_step", stepId),
    dismiss: async () => sendAction("dismiss"),
    complete: async () => sendAction("complete"),
  }), [completedSteps, disabled, isDemoUser, isFirstLogin, isLoading, sendAction, steps]);

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) {
    throw new Error("useOnboarding must be used within OnboardingProvider");
  }
  return context;
}
