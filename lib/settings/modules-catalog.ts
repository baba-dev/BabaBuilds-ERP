import type { ModuleKey } from "@/lib/module-keys";

export type ModuleGroup = "finance" | "people" | "sales" | "compliance" | "data";

export type ModuleEntry = {
  key: ModuleKey;
  group: ModuleGroup;
  icon: string;
  /** Where the module lives once it is on. */
  href: string;
};

/**
 * Optional modules, grouped for the settings page. TAX_ADVANCED is left out on purpose: its screens were folded into
 * CA Compliance, so there is nothing to switch. SHOP is controlled from Online shop.
 */
export const MODULE_CATALOG: ModuleEntry[] = [
  { key: "CASH_FLOW", group: "finance", icon: "Waves", href: "/cash-flow" },
  { key: "AR_COLLECTIONS", group: "finance", icon: "Siren", href: "/ar-collections" },
  { key: "REVENUE_PIPELINE", group: "sales", icon: "Target", href: "/proposals/pipeline" },
  { key: "POS", group: "sales", icon: "ShoppingCart", href: "/pos" },
  { key: "WORKFORCE", group: "people", icon: "Users2", href: "/workforce" },
  { key: "PAYROLL", group: "people", icon: "HandCoins", href: "/payroll" },
  { key: "DOCUMENTS", group: "compliance", icon: "FileText", href: "/documents" },
  { key: "REPORTING_CENTER", group: "compliance", icon: "ChartColumnBig", href: "/reporting" },
  { key: "MULTI_COMPANY", group: "data", icon: "Building2", href: "/companies" },
  { key: "IMPORT_MANAGER", group: "data", icon: "UploadCloud", href: "/import-manager" },
  { key: "MIAB_BILLING", group: "data", icon: "Mailbox", href: "/email-billing" },
];

export const MODULE_GROUP_ORDER: ModuleGroup[] = ["finance", "sales", "people", "compliance", "data"];
