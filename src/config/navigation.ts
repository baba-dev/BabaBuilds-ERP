import type { NavIconName } from "@/src/config/nav-icons";

export type AppRole = "OWNER" | "ADMIN" | "MEMBER" | "VIEWER" | "DEMO";

export type NavGroupName =
  | "Start Here"
  | "Set Up Your Business"
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
  | "retainers_hub"
  | "invoices_earnings"
  | "expenses_margins"
  | "ai_reconciliation"
  | "savings_tax"
  | "ca_compliance"
  | "settings";

export type NavItem = {
  id: NavItemId;
  label: string;
  href: string;
  icon: NavIconName;
  group: NavGroupName;
  roleVisibility?: AppRole[];
  featureFlag?: string;
  keywords?: string[];
  badgeSource?: string;
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

  { id: "quotes_proposals", label: "quotes_proposals", href: "/proposals", icon: "quotesAndProposals", group: "Set Up Your Business", keywords: ["quotes", "proposals"], pinnable: true },
  { id: "shop", label: "shop", href: "/shop", icon: "shop", group: "Set Up Your Business", keywords: ["store", "shop"], pinnable: true },

  { id: "inventory_hub", label: "inventory", href: "/inventory", icon: "inventoryHub", group: "Run Operations", keywords: ["inventory", "stock"], pinnable: true },
  { id: "retainers_hub", label: "retainers_hub", href: "/retainers", icon: "retainersHub", group: "Run Operations", keywords: ["retainers", "mrr"], pinnable: true },

  { id: "invoices_earnings", label: "invoices_and_earnings", href: "/income", icon: "invoicesAndEarnings", group: "Get Paid & Track Money", keywords: ["income", "invoices"], badgeSource: "openInvoices", pinnable: true },
  { id: "expenses_margins", label: "expenses_margins", href: "/expenses", icon: "expensesAndMargins", group: "Get Paid & Track Money", keywords: ["expenses", "margins"], pinnable: true },
  { id: "ai_reconciliation", label: "ai_reconciliation", href: "/reconciliation", icon: "aiReconciliation", group: "Get Paid & Track Money", featureFlag: "aiReconciliation", keywords: ["bank", "reconcile"], pinnable: true },

  { id: "savings_tax", label: "savings_tax", href: "/tax", icon: "savingsAndTax", group: "Taxes & Compliance", keywords: ["tax", "savings"], pinnable: true },
  { id: "ca_compliance", label: "ca_compliance", href: "/ca-portal", icon: "caCompliance", group: "Taxes & Compliance", roleVisibility: ["OWNER", "ADMIN"], keywords: ["ca", "compliance"], pinnable: false },

  { id: "settings", label: "settings", href: "/settings", icon: "settings", group: "System", keywords: ["preferences", "configuration"], pinnable: false },
];

const groupOrder: NavGroupName[] = [
  "Start Here",
  "Set Up Your Business",
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
