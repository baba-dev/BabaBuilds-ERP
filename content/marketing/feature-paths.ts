import type { ModuleKey } from "@/lib/module-keys";

export const FEATURES_PATH = "/features";
export const OPTIONAL_MODULES_PATH = `${FEATURES_PATH}#optional-modules`;

export const optionalFeatureSlugs = {
  POS: "point-of-sale",
  SHOP: "online-store",
  WORKFORCE: "workforce-management",
  PAYROLL: "payroll",
  REVENUE_PIPELINE: "sales-pipeline",
  AR_COLLECTIONS: "accounts-receivable-collections",
  CASH_FLOW: "cash-flow-forecasting",
  DOCUMENTS: "document-management",
  TAX_ADVANCED: "tax-compliance",
  REPORTING_CENTER: "financial-reporting",
  IMPORT_MANAGER: "data-import",
  MULTI_COMPANY: "multi-company-erp",
  MIAB_BILLING: "email-hosting-billing",
} as const satisfies Record<ModuleKey, string>;

export const featureHref = (slug: string) => `${FEATURES_PATH}/${slug}`;
