import type { DemoTemplateKey } from "@/lib/demo/templates";

export type PersonaTestimonial = {
  quote: string;
  author: string;
  role: string;
};

export type PersonaConfig = {
  slug: "for-ca" | "for-agencies" | "for-contractors" | "for-small-businesses" | "for-freelancers";
  navLabel: string;
  headline: string;
  subheadline: string;
  painPoints: string[];
  features: string[];
  demoFlow: string[];
  trustChips: string[];
  testimonials: PersonaTestimonial[];
  primaryCta: {
    label: string;
    href: string;
  };
  secondaryCta: {
    label: string;
    templateKey: DemoTemplateKey;
  };
  metadata: {
    title: string;
    description: string;
    keywords: string[];
  };
};

const PRIMARY_CTA = {
  label: "Start 15-Day Pro Trial",
  href: "/api/auth/signin",
} as const;

export const personaConfigs: Record<PersonaConfig["slug"], PersonaConfig> = {
  "for-ca": {
    slug: "for-ca",
    navLabel: "For CAs",
    headline: "Built for CAs and accountants running compliance at scale.",
    subheadline:
      "Deliver GST/TDS-ready books, client billing, and document trails from one orange-amber command center.",
    painPoints: [
      "Chasing clients for documents and recon data every month",
      "Switching between filing sheets, invoices, and follow-up threads",
      "No single view of compliance blockers across clients",
    ],
    features: [
      "Compliance-focused demo workspace with tax milestones",
      "Document inbox + OCR-ready intake for monthly filings",
      "Client-wise receivables and follow-up workflow",
      "Proposal and invoice engine with GST-aligned fields",
      "Audit-friendly activity trail across billing and records",
    ],
    demoFlow: [
      "Open Tax Dashboard and review readiness blockers",
      "Jump into document vault and verify filing documents",
      "Send invoice + reminder and track outstanding collection",
      "Close with monthly compliance status by client",
    ],
    trustChips: ["Secure billing", "GST/VAT support", "Proposal-to-invoice flow", "Multi-currency ready"],
    testimonials: [
      {
        quote:
          "Our team now closes monthly compliance packs faster because billing, docs, and blocker visibility are finally in one place.",
        author: "Aditi Bhardwaj",
        role: "Partner, LedgerBridge CA Associates",
      },
      {
        quote: "The tax workflow view reduced follow-up chaos with clients by making every open task visible.",
        author: "Nitin Khandelwal",
        role: "Compliance Lead, Northline Advisors",
      },
    ],
    primaryCta: PRIMARY_CTA,
    secondaryCta: {
      label: "Try Live Demo",
      templateKey: "tax_agency",
    },
    metadata: {
      title: "ERP for CAs and accountants | BabaBuilds ERP",
      description:
        "A CA-first workspace for compliance, invoicing, and document governance. Start a 15-day trial or explore the tax agency demo instantly.",
      keywords: [
        "ERP for chartered accountants",
        "GST compliance software India",
        "CA billing and receivables tool",
      ],
    },
  },
  "for-agencies": {
    slug: "for-agencies",
    navLabel: "For Agencies",
    headline: "Run your agency finances on autopilot, not spreadsheets.",
    subheadline:
      "From proposal to retainer billing and cash-flow visibility, get one operational hub for growth teams.",
    painPoints: [
      "Retainer billing delays hurt monthly cash flow",
      "Client approvals, proposals, and invoices are scattered",
      "No clean signal for overdue payments and team execution",
    ],
    features: [
      "Retainer automation with recurring billing cycles",
      "Pipeline + proposals tied directly to invoice actions",
      "Receivable risk insights and follow-up reminders",
      "Client profitability visibility in one dashboard",
      "Team and payroll modules for delivery operations",
    ],
    demoFlow: [
      "Review pipeline and accepted proposals",
      "Generate recurring retainer invoices in one click",
      "Track payment risk in AR and cash-flow widgets",
      "Check delivery + payroll panels for execution health",
    ],
    trustChips: ["Secure billing", "Global tax workflows", "Proposal + invoicing", "AR follow-up alerts"],
    testimonials: [
      {
        quote:
          "We cut revenue leakage by moving retainers and payment follow-ups into one system instead of four tools.",
        author: "Rhea Malhotra",
        role: "Founder, PixelRidge Studio",
      },
      {
        quote: "The sales-to-invoice flow finally matches how agencies actually operate month to month.",
        author: "Mateo Silva",
        role: "Operations Director, BrightWave Growth",
      },
    ],
    primaryCta: PRIMARY_CTA,
    secondaryCta: {
      label: "Try Live Demo",
      templateKey: "dm_agency",
    },
    metadata: {
      title: "ERP for agencies | BabaBuilds ERP",
      description:
        "Automate retainers, proposals, invoices, and collections with a growth-focused agency ERP. Start your 15-day trial or try the live demo.",
      keywords: ["agency ERP", "retainer invoicing software", "agency receivables management"],
    },
  },
  "for-contractors": {
    slug: "for-contractors",
    navLabel: "For Contractors",
    headline: "For contractors and builders who need tighter project cash control.",
    subheadline:
      "Track milestone billing, vendor costs, and payment delays without losing visibility across active jobs.",
    painPoints: [
      "Milestone billing gets delayed and collections slip",
      "Site expenses and vendor payouts are hard to reconcile",
      "Cash position uncertainty across simultaneous projects",
    ],
    features: [
      "Milestone-ready proposal and invoice workflow",
      "Expense capture and categorized outflow tracking",
      "Cash-flow snapshots for upcoming inflow/outflow periods",
      "Document vault for work orders and compliance records",
      "Team operations modules for workforce visibility",
    ],
    demoFlow: [
      "Open the dashboard and inspect project cash indicators",
      "Create or review milestone invoice records",
      "Validate vendor expenses and receipts in one ledger",
      "Check upcoming cash position before next billing cycle",
    ],
    trustChips: ["Secure billing", "GST/VAT support", "Project invoicing", "Expense + cash flow visibility"],
    testimonials: [
      {
        quote: "It gave us clarity on pending billing and vendor outflows across all active contracts.",
        author: "Rohit Sengar",
        role: "Owner, BuildAxis Projects",
      },
      {
        quote: "Collections and cost tracking are now visible in one place, which helped our monthly planning.",
        author: "Arjun Thomas",
        role: "Finance Head, StonePeak Constructions",
      },
    ],
    primaryCta: PRIMARY_CTA,
    secondaryCta: {
      label: "Try Live Demo",
      templateKey: "contractor_builder",
    },
    metadata: {
      title: "ERP for contractors and builders | BabaBuilds ERP",
      description:
        "Manage milestone billing, expenses, and cash flow in one contractor-focused ERP workspace. Start a 15-day trial or explore live demo data.",
      keywords: ["contractor billing software", "builder ERP", "project cash flow management"],
    },
  },
  "for-small-businesses": {
    slug: "for-small-businesses",
    navLabel: "For Small Businesses",
    headline: "A practical finance command center for small businesses and service firms.",
    subheadline:
      "Handle invoicing, collections, and tax-ready records without stitching together disconnected apps.",
    painPoints: [
      "Manual invoicing and follow-up takes too much owner time",
      "Cash tracking is reactive instead of predictable",
      "Compliance and billing records are spread across files",
    ],
    features: [
      "Fast invoice generation with tax-aware defaults",
      "Receivables tracking with reminder support",
      "Expense ledger and profitability signals",
      "Compliance-friendly document organization",
      "Multi-currency and global client billing support",
    ],
    demoFlow: [
      "Create and send an invoice in under a minute",
      "Track outstanding payments by client",
      "Review expense and margin summary blocks",
      "Validate tax-ready records before month-end close",
    ],
    trustChips: ["Secure billing", "GST/VAT support", "Invoice + proposal stack", "Multi-currency collection"],
    testimonials: [
      {
        quote: "It replaced our patchwork of tools and gave us cleaner month-end control.",
        author: "Sneha Vora",
        role: "Founder, ServiceLoop Solutions",
      },
      {
        quote: "The dashboard tells us what needs action right now instead of digging through sheets.",
        author: "Karan Puri",
        role: "Director, PrimeNest Services",
      },
    ],
    primaryCta: PRIMARY_CTA,
    secondaryCta: {
      label: "Try Live Demo",
      templateKey: "dm_agency",
    },
    metadata: {
      title: "ERP for small businesses and service firms | BabaBuilds ERP",
      description:
        "Simplify invoicing, collections, expenses, and tax workflows for small business operations. Start a 15-day trial or explore an interactive demo.",
      keywords: ["small business ERP", "service business invoicing", "GST ready billing software"],
    },
  },
  "for-freelancers": {
    slug: "for-freelancers",
    navLabel: "For Freelancers",
    headline: "For freelancers and consultants who want faster billing and cleaner books.",
    subheadline:
      "Create polished invoices, track retainers, and manage taxes without spending weekends on admin.",
    painPoints: [
      "Late invoices and unpaid retainers break income predictability",
      "Proposal, billing, and expense records are not linked",
      "Tax prep becomes stressful at filing time",
    ],
    features: [
      "Proposal-to-invoice flow for faster client conversion",
      "Retainer automation with recurring billing support",
      "Expense and investment tracking for cleaner records",
      "Tax-ready invoice defaults for GST/VAT scenarios",
      "Realtime financial dashboard tailored for solo operators",
    ],
    demoFlow: [
      "Send proposal and convert it to invoice workflow",
      "Enable recurring retainer setup for monthly billing",
      "Track outstanding dues and reminders",
      "Review income-expense snapshot before filing",
    ],
    trustChips: ["Secure billing", "GST/VAT support", "Proposal + invoicing", "Retainer automation"],
    testimonials: [
      {
        quote: "I moved from scattered docs to one dependable billing and finance workflow in a single week.",
        author: "Ishita Rao",
        role: "Independent Growth Consultant",
      },
      {
        quote: "Retainer automation alone saved hours each month and reduced missed invoices.",
        author: "Dev Patel",
        role: "Freelance Product Designer",
      },
    ],
    primaryCta: PRIMARY_CTA,
    secondaryCta: {
      label: "Try Live Demo",
      templateKey: "freelancer_consultant",
    },
    metadata: {
      title: "ERP for freelancers and consultants | BabaBuilds ERP",
      description:
        "Automate proposals, invoices, retainers, and expense tracking in one freelancer-friendly ERP. Start a 15-day trial or jump into a live demo.",
      keywords: ["freelancer invoicing software", "consultant billing tool", "retainer management for freelancers"],
    },
  },
};

export const personaOrder: PersonaConfig["slug"][] = [
  "for-ca",
  "for-agencies",
  "for-contractors",
  "for-small-businesses",
  "for-freelancers",
];

export const personaNavigationLinks = personaOrder.map((slug) => {
  const config = personaConfigs[slug];
  return {
    label: config.navLabel,
    href: `/${slug}`,
  };
});
