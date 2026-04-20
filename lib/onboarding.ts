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
  icon:
    | "layout-dashboard"
    | "users"
    | "briefcase"
    | "settings";
  valueStatement: string;
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: "dashboard_overview",
    title: "Review your dashboard",
    description: "See your financial command center and key health indicators.",
    href: "/dashboard",
    icon: "layout-dashboard",
    valueStatement: "Get a quick pulse on setup, compliance, and revenue momentum.",
  },
  {
    id: "add_first_client",
    title: "Add your first client",
    description: "Create your first CRM client profile so invoices have a recipient.",
    href: "/clients",
    icon: "users",
    valueStatement: "Unlock billing workflows by defining your first customer account.",
  },
  {
    id: "create_service",
    title: "Create a service",
    description: "Define at least one service for proposals, retainers, and invoices.",
    href: "/services",
    icon: "briefcase",
    valueStatement: "Standardize your offers so proposals and invoices can be generated fast.",
  },
  {
    id: "complete_profile",
    title: "Complete business profile",
    description: "Finalize company preferences and invoicing defaults.",
    href: "/settings/profile",
    icon: "settings",
    valueStatement: "Improve trust and reduce rework with complete profile and remittance details.",
  },
];

export function isDemoEmail(email: string | null | undefined) {
  return Boolean(email?.toLowerCase().endsWith("@bababuilds.demo"));
}

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
