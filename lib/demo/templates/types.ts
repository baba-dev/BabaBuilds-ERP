import type { ModuleKey } from "@/lib/modules";

export const DEMO_TEMPLATE_KEYS = ["dm_agency", "software_company", "tax_agency"] as const;
export type DemoTemplateKey = (typeof DEMO_TEMPLATE_KEYS)[number];

export type DemoWorkspaceDefaults = {
  name: string;
  countryCode: string;
  baseCurrency: string;
  planTier: string;
  subscriptionStatus: string;
};

export type DemoBusinessProfileDefaults = {
  companyName: string;
  proprietorName: string;
  address: string;
  email: string;
  phone: string;
  website: string;
  panNumber: string;
  udyamNumber?: string;
  gstin?: string;
  bankName: string;
  accountName: string;
  accountNumber: string;
  ifscCode: string;
  taxLabel?: string;
  taxIdLabel?: string;
  routingLabel?: string;
  defaultTaxRate?: number;
  defaultSacCode?: string;
  groqApiKeyPlaintext?: string;
};

export type DemoClientSeed = {
  ref: string;
  name: string;
  address: string;
  country: string;
  taxId?: string;
  email?: string;
  isExport: boolean;
};

export type DemoServiceSeed = {
  ref: string;
  name: string;
  defaultPrice: number;
  description: string;
};

export type DemoProposalSeed = {
  proposalNo: string;
  title: string;
  status: string;
  validDays: number;
  quantity: number;
  clientRef: string;
  serviceRef: string;
};

export type DemoInvoiceSeed = {
  daysAgo: number;
  amount: number;
  description: string;
  status: "PAID" | "PENDING";
  clientRef: string;
};

export type DemoExpenseSeed = {
  daysAgo: number;
  category: string;
  vendor: string;
  amount: number;
  description: string;
};

export type DemoInvestmentSeed = {
  daysAgo: number;
  category: string;
  assetName: string;
  amount: number;
};

export type DemoRetainerSeed = {
  clientRef: string;
  serviceName: string;
  amount: number;
  frequency: string;
  nextBillingInDays: number;
  status: string;
  autoAppendMonth: boolean;
  sacCode?: string;
};

export type DemoTemplateDefinition = {
  key: DemoTemplateKey;
  workspace: DemoWorkspaceDefaults;
  businessProfile: DemoBusinessProfileDefaults;
  clients: DemoClientSeed[];
  services: DemoServiceSeed[];
  proposals: DemoProposalSeed[];
  invoices: DemoInvoiceSeed[];
  expenses: DemoExpenseSeed[];
  investments: DemoInvestmentSeed[];
  retainers: DemoRetainerSeed[];
  modules: Partial<Record<ModuleKey, boolean>>;
};
