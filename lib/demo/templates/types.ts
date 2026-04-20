import type { ModuleKey } from '@/lib/module-keys';
import type { Prisma } from "@prisma/client";

export const DEMO_TEMPLATE_KEYS = ["dm_agency", "software_company", "tax_agency"] as const;
export type DemoTemplateKey = (typeof DEMO_TEMPLATE_KEYS)[number];

export type DemoSeedContext = {
  tx: Prisma.TransactionClient;
  workspaceId: string;
  userId: string;
  now: Date;
};

export type DemoWorkspaceDefinition = {
  name: string;
  countryCode: string;
  baseCurrency: string;
  planTier: string;
  subscriptionStatus: string;
};

export type DemoBusinessProfileDefinition = {
  companyName: string;
  proprietorName: string;
  address: string;
  email: string;
  phone: string;
  website?: string | null;
  panNumber: string;
  gstin?: string | null;
  udyamNumber?: string | null;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  taxLabel?: string;
  taxIdLabel?: string;
  routingLabel?: string;
  defaultSacCode?: string | null;
  defaultTaxRate?: number | null;
  // Used only for demo provisioning; will be encrypted before persistence.
  groqApiKeyPlaintext?: string | null;
};

export type DemoClientDefinition = {
  ref: string;
  name: string;
  address?: string | null;
  country?: string | null;
  taxId?: string | null;
  email?: string | null;
  isExport?: boolean;
};

export type DemoServiceDefinition = {
  ref: string;
  name: string;
  defaultPrice: number;
  description?: string | null;
};

export type DemoProposalDefinition = {
  proposalNo: string;
  clientRef: string;
  serviceRef: string;
  title: string;
  status: string;
  validDays: number;
  quantity: number;
};

export type DemoInvoiceDefinition = {
  clientRef: string;
  daysAgo: number;
  amount: number;
  description: string;
  status: "PAID" | "PENDING";
  pdfPath?: string | null;
};

export type DemoExpenseDefinition = {
  daysAgo: number;
  category: string;
  vendor: string;
  amount: number;
  description?: string | null;
};

export type DemoInvestmentDefinition = {
  daysAgo: number;
  category: string;
  assetName: string;
  amount: number;
};

export type DemoRetainerDefinition = {
  clientRef: string;
  serviceName: string;
  amount: number;
  frequency: string;
  nextBillingInDays: number;
  status: string;
  autoAppendMonth: boolean;
  sacCode?: string | null;
};

export type DemoTemplateDefinition = {
  key: DemoTemplateKey;
  label: string;
  shortDescription: string;
  workspace: DemoWorkspaceDefinition;
  businessProfile: DemoBusinessProfileDefinition;
  clients: DemoClientDefinition[];
  services: DemoServiceDefinition[];
  proposals: DemoProposalDefinition[];
  invoices: DemoInvoiceDefinition[];
  expenses: DemoExpenseDefinition[];
  investments: DemoInvestmentDefinition[];
  retainers: DemoRetainerDefinition[];
  modules: Partial<Record<ModuleKey, boolean>>;
  // Human-maintained declaration of which enabled modules have showcase-oriented seeded data.
  // Used by validation and runtime safeguards to prevent empty enabled modules in demos.
  seededModules: ModuleKey[];
  seed?: (ctx: DemoSeedContext) => Promise<void>;
};
