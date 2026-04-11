export type OnboardingStepId =
  | "dashboard_overview"
  | "add_first_client"
  | "create_service"
  | "complete_profile";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "dashboard_overview",
    title: "Review your dashboard",
    description: "See your financial command center and key health indicators.",
    href: "/dashboard",
  },
  {
    id: "add_first_client",
    title: "Add your first client",
    description: "Create your first CRM client profile so invoices have a recipient.",
    href: "/clients",
  },
  {
    id: "create_service",
    title: "Create a service",
    description: "Define at least one service for proposals, retainers, and invoices.",
    href: "/services",
  },
  {
    id: "complete_profile",
    title: "Complete business profile",
    description: "Finalize company preferences and invoicing defaults.",
    href: "/settings/profile",
  },
];

const allowedStepIds = new Set(ONBOARDING_STEPS.map((step) => step.id));

export function parseCompletedSteps(raw: string | null | undefined): OnboardingStepId[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is OnboardingStepId => typeof id === "string" && allowedStepIds.has(id as OnboardingStepId));
  } catch {
    return [];
  }
}

export function serializeCompletedSteps(stepIds: OnboardingStepId[]) {
  return JSON.stringify(Array.from(new Set(stepIds)));
}
