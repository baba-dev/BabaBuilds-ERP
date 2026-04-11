"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BookText,
  Box,
  Briefcase,
  FilePlus,
  FileSignature,
  Landmark,
  LayoutDashboard,
  Receipt,
  ShieldCheck,
  Sparkles,
  Users,
  Archive,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

const routes = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "service_catalog", path: "/services", icon: Briefcase },
  { key: "shop", path: "/shop", icon: Store },
  { key: "inventory", path: "/inventory", icon: Archive },
  { key: "client_crm", path: "/clients", icon: Users },
  { key: "quotes_proposals", path: "/proposals", icon: FileSignature },
  { key: "new_invoice", path: "/invoice", icon: FilePlus },
  { key: "retainers_hub", path: "/retainers", icon: Box },
  { key: "expenses_margins", path: "/expenses", icon: Receipt },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles },
  { key: "audit_ledger", path: "/ledger", icon: BookText },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark },
] as const;

export function NavMain() {
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();

  return (
    <nav className="grid items-start gap-1 px-2 py-4 text-sm font-medium">
      {routes.map((route) => {
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
