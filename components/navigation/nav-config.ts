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
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "revenue_pipeline", path: "/proposals/pipeline", icon: Target, badge: "AI", requiresModule: "REVENUE_PIPELINE" },
  { key: "service_catalog", path: "/services", icon: Briefcase },
  { key: "shop", path: "/shop", icon: Store, badge: "New", requiresModule: "SHOP", requiresPermission: "shop.view" },
  { key: "inventory", path: "/inventory", icon: Archive },
  { key: "client_crm", path: "/clients", icon: Users },
  { key: "quotes_proposals", path: "/proposals", icon: FileSignature },
  { key: "retainers_hub", path: "/retainers", icon: Box },
  { key: "expenses_margins", path: "/expenses", icon: Receipt },
  { key: "cash_flow", path: "/cash-flow/overview", icon: HandCoins, badge: "New", requiresModule: "CASH_FLOW" },
  {
    key: "reporting_center",
    path: "/reporting",
    icon: ChartColumnBig,
    badge: "New",
    requiresModule: "REPORTING_CENTER",
    requiresPermission: "reporting_center.view",
  },
  { key: "ar_collections", path: "/ar-collections", icon: Siren, badge: "New", requiresModule: "AR_COLLECTIONS" },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck },
  { key: "tax_advanced", path: "/tax/advanced", icon: ShieldCheck, badge: "New", requiresModule: "TAX_ADVANCED" },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles, badge: "AI" },
  { key: "invoices_and_earnings", path: "/income", icon: ReceiptText },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark },
  { key: "documents", path: "/documents", icon: FileText, requiresModule: "DOCUMENTS" },
  { key: "workforce", path: "/workforce", icon: Users2, requiresModule: "WORKFORCE" },
  { key: "payroll", path: "/payroll", icon: Wallet, requiresModule: "PAYROLL" },
  { key: "import_manager", path: "/import-manager", icon: UploadCloud, badge: "New", requiresModule: "IMPORT_MANAGER" },
]);

export function filterAppNavItems(items: AppNavItem[]) {
  return assertUniqueAppNavItemKeys(items);
}
