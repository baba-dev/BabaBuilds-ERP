import {
  Archive,
  Box,
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
  type LucideIcon,
} from "lucide-react";

export type AppNavItem = {
  key: string;
  path: string;
  icon: LucideIcon;
  badge?: "New" | "AI";
  requiresModule?: string; // Module key required to show this item (e.g., 'WORKFORCE')
  requiresPermission?: string;
  searchGroupKey: string;
  searchKeywords: string[];
};

function assertUniqueAppNavItemKeys(items: AppNavItem[]) {
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

export const appNavItems: AppNavItem[] = assertUniqueAppNavItemKeys([
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard, searchGroupKey: "overview", searchKeywords: ["home", "kpi", "summary"] },
  { key: "revenue_pipeline", path: "/proposals/pipeline", icon: Target, badge: "AI", requiresModule: "REVENUE_PIPELINE", searchGroupKey: "sales", searchKeywords: ["pipeline", "deals", "forecast"] },
  { key: "service_catalog", path: "/services", icon: Briefcase, searchGroupKey: "operations", searchKeywords: ["offerings", "pricing", "catalog"] },
  { key: "shop", path: "/shop", icon: Store, badge: "New", requiresModule: "SHOP", requiresPermission: "shop.view", searchGroupKey: "operations", searchKeywords: ["storefront", "orders", "public"] },
  { key: "inventory", path: "/inventory", icon: Archive, searchGroupKey: "operations", searchKeywords: ["stock", "products", "warehouse"] },
  { key: "client_crm", path: "/clients", icon: Users, searchGroupKey: "operations", searchKeywords: ["customers", "contacts", "crm"] },
  { key: "quotes_proposals", path: "/proposals", icon: FileSignature, searchGroupKey: "sales", searchKeywords: ["quotes", "deals", "proposals"] },
  { key: "retainers_hub", path: "/retainers", icon: Box, searchGroupKey: "sales", searchKeywords: ["recurring", "contracts", "retainer"] },
  { key: "expenses_margins", path: "/expenses", icon: Receipt, searchGroupKey: "finance", searchKeywords: ["costs", "purchases", "spend"] },
  { key: "cash_flow", path: "/cash-flow/overview", icon: HandCoins, badge: "New", requiresModule: "CASH_FLOW", searchGroupKey: "finance", searchKeywords: ["cash", "liquidity", "overview"] },
  {
    key: "reporting_center",
    path: "/reporting",
    icon: ChartColumnBig,
    badge: "New",
    requiresModule: "REPORTING_CENTER",
    requiresPermission: "reporting_center.view",
    searchGroupKey: "finance",
    searchKeywords: ["reports", "analytics", "insights"],
  },
  { key: "ar_collections", path: "/ar-collections", icon: Siren, badge: "New", requiresModule: "AR_COLLECTIONS", searchGroupKey: "finance", searchKeywords: ["receivables", "collections", "dunning"] },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck, searchGroupKey: "finance", searchKeywords: ["gst", "compliance", "tax"] },
  { key: "tax_advanced", path: "/tax/advanced", icon: ShieldCheck, badge: "New", requiresModule: "TAX_ADVANCED", searchGroupKey: "finance", searchKeywords: ["tax", "advanced", "compliance"] },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles, badge: "AI", searchGroupKey: "finance", searchKeywords: ["bank", "matching", "ledger"] },
  { key: "invoices_and_earnings", path: "/income", icon: ReceiptText, searchGroupKey: "sales", searchKeywords: ["billing", "revenue", "invoices"] },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark, searchGroupKey: "compliance", searchKeywords: ["chartered", "filings", "audit"] },
  { key: "documents", path: "/documents", icon: FileText, requiresModule: "DOCUMENTS", searchGroupKey: "workspace", searchKeywords: ["files", "attachments", "docs"] },
  { key: "workforce", path: "/workforce", icon: Users2, requiresModule: "WORKFORCE", searchGroupKey: "workspace", searchKeywords: ["employees", "team", "hr"] },
  { key: "payroll", path: "/payroll", icon: Wallet, requiresModule: "PAYROLL", searchGroupKey: "workspace", searchKeywords: ["salary", "payouts", "compensation"] },
  { key: "import_manager", path: "/import-manager", icon: UploadCloud, badge: "New", requiresModule: "IMPORT_MANAGER", searchGroupKey: "workspace", searchKeywords: ["csv", "upload", "ingestion"] },
]);

export function filterAppNavItems(items: AppNavItem[]) {
  return assertUniqueAppNavItemKeys(items);
}

export function isNavItemVisible(item: AppNavItem, enabledModules: Set<string>, grantedPermissions: Set<string>) {
  return (!item.requiresModule || enabledModules.has(item.requiresModule)) && (!item.requiresPermission || grantedPermissions.has(item.requiresPermission));
}
