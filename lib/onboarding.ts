export type OnboardingPersona = "ca" | "agency" | "freelancer" | "contractor";

export type OnboardingStepId =
  | "dashboard_overview"
  | "add_first_client"
  | "create_service"
  | "complete_profile"
  | "open_tax_hub"
  | "send_gst_ready_invoice"
  | "verify_filing_readiness"
  | "setup_retainer"
  | "bill_first_retainer_invoice"
  | "send_first_proposal"
  | "convert_proposal_to_invoice"
  | "send_first_invoice"
  | "create_milestone_proposal"
  | "send_milestone_invoice"
  | "log_first_expense";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
  icon:
    | "layout-dashboard"
    | "users"
    | "briefcase"
    | "receipt"
    | "repeat"
    | "hard-hat"
    | "badge-check"
    | "settings";
  valueStatement: string;
};

export const DEFAULT_ONBOARDING_STEPS: OnboardingStep[] = [
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

export const PERSONA_ONBOARDING_STEPS: Record<OnboardingPersona, OnboardingStep[]> = {
  ca: [
    {
      id: "open_tax_hub",
      title: "Open tax dashboard",
      description: "Review compliance readiness and unresolved filing blockers.",
      href: "/tax/hub",
      icon: "layout-dashboard",
      valueStatement: "Start with tax readiness visibility before filing cycles begin.",
    },
    {
      id: "add_first_client",
      title: "Add your first client",
      description: "Create your first compliance client account.",
      href: "/clients",
      icon: "users",
      valueStatement: "Client records unlock filing and billing workflows.",
    },
    {
      id: "send_gst_ready_invoice",
      title: "Send GST-ready invoice",
      description: "Issue one invoice with tax fields and remittance details.",
      href: "/invoice",
      icon: "briefcase",
      valueStatement: "Complete one billable money step with tax-ready invoices.",
    },
    {
      id: "verify_filing_readiness",
      title: "Verify filing readiness",
      description: "Confirm your month-end pack is filing-ready.",
      href: "/tax/hub",
      icon: "settings",
      valueStatement: "End onboarding with a completed compliance money task.",
    },
  ],
  agency: [
    {
      id: "add_first_client",
      title: "Add your first client",
      description: "Create a client account to start your agency pipeline.",
      href: "/clients",
      icon: "users",
      valueStatement: "Client setup starts proposal-to-payment flow.",
    },
    {
      id: "create_service",
      title: "Create service package",
      description: "Define one service to bill repeatedly.",
      href: "/services",
      icon: "briefcase",
      valueStatement: "Standardized services speed proposal and invoice generation.",
    },
    {
      id: "setup_retainer",
      title: "Set up monthly retainer",
      description: "Create one recurring retainer plan.",
      href: "/retainers",
      icon: "settings",
      valueStatement: "Lock in recurring revenue with monthly retainer billing.",
    },
    {
      id: "bill_first_retainer_invoice",
      title: "Bill first retainer invoice",
      description: "Generate your first retainer invoice.",
      href: "/invoice",
      icon: "layout-dashboard",
      valueStatement: "End onboarding with your first recurring money task completed.",
    },
  ],
  freelancer: [
    {
      id: "add_first_client",
      title: "Add your first client",
      description: "Create a client record to start freelance billing.",
      href: "/clients",
      icon: "users",
      valueStatement: "Client setup is required before proposals and invoices.",
    },
    {
      id: "send_first_proposal",
      title: "Send first proposal",
      description: "Draft and send a proposal to a client.",
      href: "/proposals",
      icon: "briefcase",
      valueStatement: "Proposal delivery kickstarts your conversion loop.",
    },
    {
      id: "convert_proposal_to_invoice",
      title: "Convert proposal to invoice",
      description: "Convert one accepted proposal into an invoice.",
      href: "/proposals/pipeline",
      icon: "layout-dashboard",
      valueStatement: "Turn approved scope into billable revenue quickly.",
    },
    {
      id: "send_first_invoice",
      title: "Send first invoice",
      description: "Finalize and send your first invoice.",
      href: "/invoice",
      icon: "settings",
      valueStatement: "End onboarding with a completed money task.",
    },
  ],
  contractor: [
    {
      id: "add_first_client",
      title: "Add your first project client",
      description: "Create your first client profile for project billing.",
      href: "/clients",
      icon: "users",
      valueStatement: "A client profile anchors contracts and milestones.",
    },
    {
      id: "create_milestone_proposal",
      title: "Create milestone proposal",
      description: "Draft a proposal with milestone scope.",
      href: "/proposals",
      icon: "briefcase",
      valueStatement: "Milestone proposals reduce billing ambiguity.",
    },
    {
      id: "send_milestone_invoice",
      title: "Send milestone invoice",
      description: "Issue the first milestone invoice.",
      href: "/invoice",
      icon: "layout-dashboard",
      valueStatement: "Complete your first project billing money task.",
    },
    {
      id: "log_first_expense",
      title: "Log first project expense",
      description: "Capture one expense for margin tracking.",
      href: "/expense",
      icon: "settings",
      valueStatement: "Close onboarding with a cost-tracking money task.",
    },
  ],
};

export const ONBOARDING_STEPS = DEFAULT_ONBOARDING_STEPS;

export function getOnboardingSteps(persona: OnboardingPersona | null | undefined): OnboardingStep[] {
  if (!persona) return DEFAULT_ONBOARDING_STEPS;
  return PERSONA_ONBOARDING_STEPS[persona] ?? DEFAULT_ONBOARDING_STEPS;
}

export const getPersonaSteps = getOnboardingSteps;

export function parseOnboardingPersona(input: string | null | undefined): OnboardingPersona | null {
  if (!input) return null;
  const normalized = input.trim().toLowerCase();
  if (normalized === "ca" || normalized === "agency" || normalized === "freelancer" || normalized === "contractor") {
    return normalized;
  }
  return null;
}

export function isOnboardingPersona(input: unknown): input is OnboardingPersona {
  return typeof input === "string" && parseOnboardingPersona(input) !== null;
}

export function isDemoEmail(email: string | null | undefined) {
  return Boolean(email?.toLowerCase().endsWith("@bababuilds.demo"));
}

export function parseCompletedSteps(raw: string | null | undefined): OnboardingStepId[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const allowedStepIds = new Set(
      [...DEFAULT_ONBOARDING_STEPS, ...Object.values(PERSONA_ONBOARDING_STEPS).flat()].map(
        (step) => step.id,
      ),
    );
    return parsed.filter(
      (id): id is OnboardingStepId =>
        typeof id === "string" && allowedStepIds.has(id as OnboardingStepId),
    );
  } catch {
    return [];
  }
}

export function serializeCompletedSteps(stepIds: OnboardingStepId[]) {
  return JSON.stringify(Array.from(new Set(stepIds)));
}
