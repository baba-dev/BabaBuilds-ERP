import {
  Archive,
  Box,
  Briefcase,
  CircleHelp,
  FileSignature,
  Landmark,
  LayoutDashboard,
  Receipt,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AppNavItem = {
  key: string;
  path: string;
  icon: LucideIcon;
  badge?: "New" | "AI";
};

export const appNavItems: AppNavItem[] = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "service_catalog", path: "/services", icon: Briefcase },
  { key: "shop", path: "/shop", icon: Store, badge: "New" },
  { key: "inventory", path: "/inventory", icon: Archive },
  { key: "client_crm", path: "/clients", icon: Users },
  { key: "quotes_proposals", path: "/proposals", icon: FileSignature },
  { key: "retainers_hub", path: "/retainers", icon: Box },
  { key: "expenses_margins", path: "/expenses", icon: Receipt },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles, badge: "AI" },
  { key: "invoices_and_earnings", path: "/income", icon: ReceiptText },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark },
  { key: "help_center", path: "/help", icon: CircleHelp },
];

export function filterAppNavItems(items: AppNavItem[]) {
  return items;
}
