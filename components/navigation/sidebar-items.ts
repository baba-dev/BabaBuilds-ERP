import {
  Archive,
  Box,
  Briefcase,
  FileSignature,
  Landmark,
  LayoutDashboard,
  Receipt,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

export type SidebarItem = {
  key: string;
  path: string;
  icon: LucideIcon;
  groupKey: string;
  keywords: string[];
};

export const sidebarItems: SidebarItem[] = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard, groupKey: "overview", keywords: ["home", "kpi", "summary"] },
  { key: "service_catalog", path: "/services", icon: Briefcase, groupKey: "operations", keywords: ["offerings", "pricing", "catalog"] },
  { key: "shop", path: "/shop", icon: Store, groupKey: "operations", keywords: ["storefront", "orders", "public"] },
  { key: "inventory", path: "/inventory", icon: Archive, groupKey: "operations", keywords: ["stock", "products", "warehouse"] },
  { key: "client_crm", path: "/clients", icon: Users, groupKey: "operations", keywords: ["customers", "contacts", "crm"] },
  { key: "quotes_proposals", path: "/proposals", icon: FileSignature, groupKey: "sales", keywords: ["quotes", "deals", "proposals"] },
  { key: "retainers_hub", path: "/retainers", icon: Box, groupKey: "sales", keywords: ["recurring", "contracts", "retainer"] },
  { key: "referrals_rewards", path: "/referrals", icon: Users, groupKey: "sales", keywords: ["affiliate", "reseller", "customer referral"] },
  { key: "expenses_margins", path: "/expenses", icon: Receipt, groupKey: "finance", keywords: ["costs", "purchases", "spend"] },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck, groupKey: "finance", keywords: ["gst", "compliance", "tax"] },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles, groupKey: "finance", keywords: ["bank", "matching", "ledger"] },
  { key: "invoices_and_earnings", path: "/income", icon: ReceiptText, groupKey: "finance", keywords: ["billing", "revenue", "invoices"] },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark, groupKey: "compliance", keywords: ["chartered", "filings", "audit"] },
  { key: "settings", path: "/settings", icon: Settings, groupKey: "workspace", keywords: ["preferences", "team", "configuration"] },
];
