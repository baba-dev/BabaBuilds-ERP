"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import type { ComponentType } from "react";
import {
  Box,
  Briefcase,
  FileSignature,
  Landmark,
  LayoutDashboard,
  Receipt,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Users,
  Archive,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { filterSidebarItemsByRole, type SidebarItem, type SidebarRole } from "@/lib/sidebar/sidebar-rules";

type NavigationRoute = SidebarItem & {
  key: string;
  icon: ComponentType<{ className?: string }>;
};

const routes: ReadonlyArray<NavigationRoute> = [
  { id: "dashboard", key: "dashboard", path: "/dashboard", icon: LayoutDashboard, label: "Dashboard", roles: ["OWNER", "ADMIN", "MEMBER", "VIEWER"] },
  { id: "service_catalog", key: "service_catalog", path: "/services", icon: Briefcase, label: "Service Catalog", roles: ["OWNER", "ADMIN", "MEMBER"] },
  { id: "shop", key: "shop", path: "/shop", icon: Store, label: "Shop", roles: ["OWNER", "ADMIN", "MEMBER", "VIEWER"] },
  { id: "inventory", key: "inventory", path: "/inventory", icon: Archive, label: "Inventory", roles: ["OWNER", "ADMIN", "MEMBER"] },
  { id: "client_crm", key: "client_crm", path: "/clients", icon: Users, label: "Client CRM", roles: ["OWNER", "ADMIN", "MEMBER"] },
  { id: "quotes_proposals", key: "quotes_proposals", path: "/proposals", icon: FileSignature, label: "Quotes & Proposals", roles: ["OWNER", "ADMIN", "MEMBER", "VIEWER"] },
  { id: "retainers_hub", key: "retainers_hub", path: "/retainers", icon: Box, label: "Retainers Hub", roles: ["OWNER", "ADMIN", "MEMBER"] },
  { id: "expenses_margins", key: "expenses_margins", path: "/expenses", icon: Receipt, label: "Expenses & Margins", roles: ["OWNER", "ADMIN", "MEMBER"] },
  { id: "savings_tax", key: "savings_tax", path: "/tax", icon: ShieldCheck, label: "Savings Tax", roles: ["OWNER", "ADMIN"] },
  { id: "ai_reconciliation", key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles, label: "AI Reconciliation", roles: ["OWNER", "ADMIN", "MEMBER"] },
  { id: "invoices_and_earnings", key: "invoices_and_earnings", path: "/income", icon: ReceiptText, label: "Invoices & Earnings", roles: ["OWNER", "ADMIN", "MEMBER", "VIEWER"] },
  { id: "ca_compliance", key: "ca_compliance", path: "/ca-portal", icon: Landmark, label: "CA Compliance", roles: ["OWNER", "ADMIN"], pinnedToBottom: true },
] as const;

export function NavMain() {
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();
  const activeRole: SidebarRole = "MEMBER";
  const visibleRoutes = filterSidebarItemsByRole(routes, activeRole);

  return (
    <nav className="grid items-start gap-1 px-2 py-4 text-sm font-medium">
      {visibleRoutes.map((route) => {
        const Icon = route.icon;
        const isActive = pathname === route.path;

        return (
          <Link
            key={route.key}
            href={route.path}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-200 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
              isActive ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20" : "hover:bg-white/10 hover:text-white",
              !open && !isMobile && "justify-center px-2",
            )}
            title={!open && !isMobile ? t(route.key) : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {(open || isMobile) && <span className="truncate">{t(route.key)}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
