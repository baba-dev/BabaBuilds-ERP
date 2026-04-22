import type { NavIconName } from "@/src/config/nav-icons";
import type { ModuleKey } from "@/lib/module-keys";

export type AppRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "DEMO";

export type NavGroupName =
  | "Start Here"
  | "Setup Business"
  | "Run Operations"
  | "Get Paid & Track Money"
  | "Taxes & Compliance"
  | "System";

export type NavItemId =
  | "dashboard"
  | "client_crm"
  | "service_catalog"
  | "quotes_proposals"
  | "shop"
  | "inventory_hub"
  | "documents"
  | "workforce"
  | "retainers_hub"
  | "invoices_and_earnings"
  | "reporting_center"
  | "expenses_margins"
  | "ai_reconciliation"
  | "cash_flow"
  | "ar_collections"
  | "payroll"
  | "import_manager"
  | "savings_tax"
  | "ca_compliance"
  | "settings";

export type NavItem = {
  id: NavItemId;
  label: string;
  href: string;
  icon: NavIconName;
  group: NavGroupName;
  moduleKey?: ModuleKey;
  roleVisibility?: AppRole[];
  featureFlag?: string;
  keywords?: string[];
  badgeSource?: SidebarModuleKey;
  pinnable: boolean;
};

export type NavGroup = {
  id: string;
  label: NavGroupName;
  items: NavItem[];
};

const navItems: NavItem[] = [
  { id: "dashboard", label: "dashboard", href: "/dashboard", icon: "dashboard", group: "Start Here", keywords: ["home", "overview"], pinnable: true },
  { id: "client_crm", label: "client_crm", href: "/clients", icon: "clientCrm", group: "Start Here", keywords: ["clients", "crm"], pinnable: true },
  { id: "service_catalog", label: "service_catalog", href: "/services", icon: "serviceCatalog", group: "Start Here", keywords: ["services", "catalog"], pinnable: true },

  { id: "quotes_proposals", label: "quotes_proposals", href: "/proposals", icon: "quotesAndProposals", group: "Setup Business", keywords: ["quotes", "proposals"], pinnable: true },
  { id: "shop", label: "shop", href: "/shop", icon: "shop", group: "Setup Business", keywords: ["store", "shop"], pinnable: true },
  { id: "import_manager", label: "import_manager", href: "/import-manager", icon: "serviceCatalog", group: "Setup Business", moduleKey: "IMPORT_MANAGER", roleVisibility: ["OWNER", "ADMIN"], keywords: ["import", "csv", "xlsx"], pinnable: false },

  { id: "inventory_hub", label: "inventory", href: "/inventory", icon: "inventoryHub", group: "Run Operations", keywords: ["inventory", "stock"], pinnable: true },
  { id: "documents", label: "documents", href: "/documents", icon: "inventoryHub", group: "Run Operations", moduleKey: "DOCUMENTS", keywords: ["documents", "ocr"], pinnable: true },
  { id: "workforce", label: "workforce", href: "/workforce", icon: "clientCrm", group: "Run Operations", moduleKey: "WORKFORCE", keywords: ["employees", "attendance", "leave"], pinnable: true },
  { id: "retainers_hub", label: "retainers_hub", href: "/retainers", icon: "retainersHub", group: "Run Operations", keywords: ["retainers", "mrr"], pinnable: true },

  { id: "invoices_and_earnings", label: "invoices_and_earnings", href: "/income", icon: "invoicesAndEarnings", group: "Get Paid & Track Money", keywords: ["income", "invoices"], badgeSource: "invoices_and_earnings", pinnable: true },
  { id: "reporting_center", label: "reporting_center", href: "/reporting", icon: "reportingCenter", group: "Get Paid & Track Money", moduleKey: "REPORTING_CENTER", roleVisibility: ["OWNER", "ADMIN"], keywords: ["reports", "analytics", "reporting"], pinnable: true },
  { id: "expenses_margins", label: "expenses_margins", href: "/expenses", icon: "expensesAndMargins", group: "Get Paid & Track Money", keywords: ["expenses", "margins"], pinnable: true },
  { id: "ai_reconciliation", label: "ai_reconciliation", href: "/reconciliation", icon: "aiReconciliation", group: "Get Paid & Track Money", featureFlag: "aiReconciliation", keywords: ["bank", "reconcile"], pinnable: true },
  { id: "cash_flow", label: "cash_flow", href: "/cash-flow", icon: "retainersHub", group: "Get Paid & Track Money", moduleKey: "CASH_FLOW", keywords: ["cash", "forecast", "liquidity"], pinnable: true },
  { id: "ar_collections", label: "ar_collections", href: "/ar-collections", icon: "aiReconciliation", group: "Get Paid & Track Money", moduleKey: "AR_COLLECTIONS", keywords: ["aging", "collections", "receivables"], pinnable: true },
  { id: "payroll", label: "payroll", href: "/payroll", icon: "caCompliance", group: "Get Paid & Track Money", moduleKey: "PAYROLL", keywords: ["payroll", "salary", "wages"], pinnable: true },

  { id: "savings_tax", label: "savings_tax", href: "/tax", icon: "savingsAndTax", group: "Taxes & Compliance", keywords: ["tax", "savings"], pinnable: true },
  { id: "ca_compliance", label: "ca_compliance", href: "/ca-portal", icon: "caCompliance", group: "Taxes & Compliance", roleVisibility: ["OWNER", "ADMIN"], keywords: ["ca", "compliance"], badgeSource: "ca_compliance", pinnable: false },

  { id: "settings", label: "settings", href: "/settings", icon: "settings", group: "System", keywords: ["preferences", "configuration"], pinnable: false },
];

const groupOrder: NavGroupName[] = [
  "Start Here",
  "Setup Business",
  "Run Operations",
  "Get Paid & Track Money",
  "Taxes & Compliance",
  "System",
];

export const navigationGroups: NavGroup[] = groupOrder.map((groupLabel) => ({
  id: groupLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
  label: groupLabel,
  items: navItems.filter((item) => item.group === groupLabel),
}));

export type SidebarModuleKey =
  | "client_crm"
  | "quotes_proposals"
  | "invoices_and_earnings"
  | "ai_reconciliation"
  | "ca_compliance";

export type SidebarBadgeVariant = "count" | "dot" | "new";

export type SidebarBadge = {
  variant: SidebarBadgeVariant;
  count?: number;
};

export type SidebarBadgeSource = {
  key: SidebarModuleKey;
  endpoint: string;
  staleAfterMs: number;
  failureFallback: "hide" | "dot";
};

export const SIDEBAR_BADGE_SOURCES: Record<SidebarModuleKey, SidebarBadgeSource> = {
  client_crm: {
    key: "client_crm",
    endpoint: "/api/clients?page=1&limit=50",
    staleAfterMs: 2 * 60_000,
    failureFallback: "dot",
  },
  quotes_proposals: {
    key: "quotes_proposals",
    endpoint: "/api/proposals",
    staleAfterMs: 2 * 60_000,
    failureFallback: "dot",
  },
  invoices_and_earnings: {
    key: "invoices_and_earnings",
    endpoint: "/api/invoices/open-count",
    staleAfterMs: 2 * 60_000,
    failureFallback: "dot",
  },
  ai_reconciliation: {
    key: "ai_reconciliation",
    endpoint: "/api/dashboard",
    staleAfterMs: 2 * 60_000,
    failureFallback: "dot",
  },
  ca_compliance: {
    key: "ca_compliance",
    endpoint: "/api/ca-portal",
    staleAfterMs: 2 * 60_000,
    failureFallback: "dot",
  },
};

export const SIDEBAR_BADGE_MODULE_KEYS = Object.keys(SIDEBAR_BADGE_SOURCES) as SidebarModuleKey[];

export const isSidebarBadgeModuleKey = (value: string): value is SidebarModuleKey =>
  value in SIDEBAR_BADGE_SOURCES;
