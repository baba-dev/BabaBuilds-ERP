"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Box } from "lucide-react";
import { NavUser } from "@/components/navigation/nav-user";
import { Sidebar, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { navIconMap } from "@/src/config/nav-icons";
import { navigationGroups } from "@/src/config/navigation";
import { filterByRole } from "@/src/lib/nav/filterByRole";
import { filterByFlag } from "@/src/lib/nav/filterByFlag";

function SidebarBrand() {
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();

  return (
    <div className="flex h-16 items-center justify-between border-b border-zinc-800/30 px-4 shrink-0">
      <Link href="/dashboard" className="flex items-center gap-3 font-bold text-zinc-50 group min-w-0">
        <div className="rounded-xl bg-indigo-600 p-1.5 shadow-lg shadow-indigo-500/20 transition-transform duration-300 group-hover:scale-110">
          <Box className="h-5 w-5 text-white" />
        </div>
        {(open || isMobile) && (
          <span className="truncate text-lg tracking-tight text-white transition-colors hover:text-indigo-400">
            {t("bababuilds_erp")}
          </span>
        )}
      </Link>
      <SidebarTrigger className="hidden text-zinc-200 hover:bg-white/10 hover:text-white md:inline-flex" />
    </div>
  );
}

export function AppSidebar() {
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();

  const role = undefined;
  const featureFlags = {
    aiReconciliation: true,
  };

  const visibleGroups = filterByFlag(filterByRole(navigationGroups, role), featureFlags);

  return (
    <Sidebar>
      <div className="flex h-full w-full max-h-screen flex-col gap-2 bg-gradient-to-b from-white/[0.03] to-transparent">
        <SidebarBrand />

        <div className="flex-1 overflow-auto py-2 custom-scrollbar">
          <nav className="grid items-start gap-3 px-2 py-2 text-sm font-medium">
            {visibleGroups.map((group) => (
              <div key={group.id} className="space-y-1">
                {(open || isMobile) && (
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{group.label}</p>
                )}
                {group.items.map((item) => {
                  const Icon = navIconMap[item.icon];
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-200 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                        isActive ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20" : "hover:bg-white/10 hover:text-white",
                        !open && !isMobile && "justify-center px-2",
                      )}
                      title={!open && !isMobile ? t(item.label) : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {(open || isMobile) && <span className="truncate">{t(item.label)}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-zinc-800/30 px-2 pt-2 pb-4">
          <div className="px-2 pt-2">
            <NavUser />
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
