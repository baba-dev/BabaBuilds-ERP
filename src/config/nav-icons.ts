import type { LucideIcon } from "lucide-react";
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
} from "lucide-react";

export const navIconMap = {
  dashboard: LayoutDashboard,
  clientCrm: Users,
  serviceCatalog: Briefcase,
  quotesAndProposals: FileSignature,
  shop: Store,
  inventoryHub: Archive,
  retainersHub: Box,
  invoicesAndEarnings: ReceiptText,
  expensesAndMargins: Receipt,
  aiReconciliation: Sparkles,
  savingsAndTax: ShieldCheck,
  caCompliance: Landmark,
  settings: Settings,
} as const satisfies Record<string, LucideIcon>;

export type NavIconName = keyof typeof navIconMap;
