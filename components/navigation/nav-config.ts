import {
  Archive,
  Box,
  Briefcase,
  CircleHelp,
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

export const appNavItems: AppNavItem[] = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "revenue_pipeline", path: "/proposals/pipeline", icon: Target, badge: "AI", requiresModule: "REVENUE_PIPELINE" },
  { key: "service_catalog", path: "/services", icon: Briefcase },
  { key: "shop", path: "/shop", icon: Store, badge: "New" },
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
  { key: "reporting_center", path: "/reporting", icon: ChartColumnBig, requiresModule: "REPORTING_CENTER", requiresPermission: "reporting_center.view" },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles, badge: "AI" },
  { key: "invoices_and_earnings", path: "/income", icon: ReceiptText },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark },
  { key: "documents", path: "/documents", icon: FileText, requiresModule: "DOCUMENTS" },
  { key: "workforce", path: "/workforce", icon: Users2, requiresModule: "WORKFORCE" },
  { key: "payroll", path: "/payroll", icon: Wallet, requiresModule: "PAYROLL" },
  { key: "help_center", path: "/dashboard/help", icon: CircleHelp },
];

export function filterAppNavItems(items: AppNavItem[]) {
  return items;
}
