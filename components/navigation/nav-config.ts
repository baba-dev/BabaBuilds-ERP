import {
  Archive,
  Box,
  Building2,
  Briefcase,
  HandCoins,
  FileSignature,
  Landmark,
  LayoutDashboard,
  Receipt,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  Users2,
  Target,
  FileText,
  Wallet,
  Siren,
  ChartColumnBig,
  UploadCloud,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";

export type NavGroupKey = "overview" | "operations" | "sales" | "finance" | "compliance" | "workspace";

export type CanonicalNavItem = {
  key: string;
  path: string;
  icon: LucideIcon;
  group: NavGroupKey;
  keywords: string[];
  /**
   * Backward-compatibility aliases used by search consumers during migration.
   */
  searchGroupKey?: string;
  searchKeywords?: string[];
  badge?: "New" | "AI";
  requiresModule?: string;
  requiresPermission?: string;
};

function assertUniqueAppNavItemKeys(items: CanonicalNavItem[]) {
  if (process.env.NODE_ENV === "production") {
    return items;
  }

  const keys = new Set<string>();

  for (const item of items) {
    if (keys.has(item.key)) {
      throw new Error(
        `[nav-config] Duplicate app navigation key detected: "${item.key}". Each appNavItems entry must use a unique key.`,
      );
    }

    keys.add(item.key);
  }

  return items;
}

export const canonicalNavItems: CanonicalNavItem[] = assertUniqueAppNavItemKeys([
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard, group: "overview", keywords: ["home", "kpi", "summary"] },
  { key: "companies", path: "/companies", icon: Building2, group: "workspace", keywords: ["multi company", "group", "consolidation"], badge: "New", requiresModule: "MULTI_COMPANY" },
  { key: "revenue_pipeline", path: "/proposals/pipeline", icon: Target, group: "sales", keywords: ["pipeline", "deals", "forecast"], badge: "AI", requiresModule: "REVENUE_PIPELINE" },
  { key: "service_catalog", path: "/services", icon: Briefcase, group: "operations", keywords: ["offerings", "pricing", "catalog"] },
  { key: "shop", path: "/shop", icon: Store, group: "operations", keywords: ["storefront", "orders", "public"], badge: "New", requiresModule: "SHOP", requiresPermission: "shop.view" },
  { key: "inventory", path: "/inventory", icon: Archive, group: "operations", keywords: ["stock", "products", "warehouse"] },
  { key: "client_crm", path: "/clients", icon: Users, group: "operations", keywords: ["customers", "contacts", "crm"] },
  { key: "quotes_proposals", path: "/proposals", icon: FileSignature, group: "sales", keywords: ["quotes", "deals", "proposals"] },
  { key: "pos", path: "/pos", icon: ShoppingCart, group: "sales", keywords: ["point of sale", "checkout", "register", "cart"], badge: "New", requiresModule: "POS", requiresPermission: "pos.view" },
  { key: "retainers_hub", path: "/retainers", icon: Box, group: "sales", keywords: ["recurring", "contracts", "retainer"] },
  { key: "expenses_margins", path: "/expenses", icon: Receipt, group: "finance", keywords: ["costs", "purchases", "spend"] },
  { key: "cash_flow", path: "/cash-flow/overview", icon: HandCoins, group: "finance", keywords: ["liquidity", "cash", "forecast"], badge: "New", requiresModule: "CASH_FLOW" },
  { key: "reporting_center", path: "/reporting", icon: ChartColumnBig, group: "finance", keywords: ["reports", "analytics", "insights"], badge: "New", requiresModule: "REPORTING_CENTER", requiresPermission: "reporting_center.view" },
  { key: "ar_collections", path: "/ar-collections", icon: Siren, group: "finance", keywords: ["collections", "receivables", "follow up"], badge: "New", requiresModule: "AR_COLLECTIONS" },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck, group: "finance", keywords: ["gst", "compliance", "tax"] },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles, group: "finance", keywords: ["bank", "matching", "ledger"], badge: "AI" },
  { key: "invoices_and_earnings", path: "/income", icon: ReceiptText, group: "sales", keywords: ["billing", "revenue", "invoices"] },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark, group: "compliance", keywords: ["chartered", "filings", "audit"] },
  { key: "documents", path: "/documents", icon: FileText, group: "operations", keywords: ["files", "storage", "records"], requiresModule: "DOCUMENTS" },
  { key: "workforce", path: "/workforce", icon: Users2, group: "workspace", keywords: ["team", "staff", "hr"], requiresModule: "WORKFORCE" },
  { key: "payroll", path: "/payroll", icon: Wallet, group: "workspace", keywords: ["salary", "payout", "payroll"], requiresModule: "PAYROLL" },
  { key: "import_manager", path: "/import-manager", icon: UploadCloud, group: "operations", keywords: ["import", "csv", "migration"], badge: "New", requiresModule: "IMPORT_MANAGER" },
]);

export const appNavItems = canonicalNavItems;

export function filterAppNavItems(items: CanonicalNavItem[], enabledModules: Set<string>, grantedPermissions: Set<string>) {
  return items.filter(
    (item) =>
      (!item.requiresModule || enabledModules.has(item.requiresModule)) &&
      (!item.requiresPermission || grantedPermissions.has(item.requiresPermission)),
  );
}

export function isNavItemVisible(item: CanonicalNavItem, enabledModules: Set<string>, grantedPermissions: Set<string>) {
  return (!item.requiresModule || enabledModules.has(item.requiresModule)) && (!item.requiresPermission || grantedPermissions.has(item.requiresPermission));
}
