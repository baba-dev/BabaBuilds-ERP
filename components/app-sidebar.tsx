"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Box } from "lucide-react";
import { NavMain } from "@/components/navigation/nav-main";
import { NavSecondary } from "@/components/navigation/nav-secondary";
import { NavUser } from "@/components/navigation/nav-user";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";

function SidebarBrand() {
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();

  return (
    <div className="flex h-16 items-center border-b border-zinc-800/30 px-4 shrink-0">
      <Link href="/" className="flex items-center gap-3 font-bold text-zinc-50 group w-full">
        <div className="rounded-xl bg-indigo-600 p-1.5 shadow-lg shadow-indigo-500/20 transition-transform duration-300 group-hover:scale-110">
          <Box className="h-5 w-5 text-white" />
        </div>
        {(open || isMobile) && (
          <span className="truncate text-lg tracking-tight text-white transition-colors hover:text-indigo-400">
            {t("bababuilds_erp")}
          </span>
        )}
      </Link>
    </div>
  );
}

export function AppSidebar() {
  return (
    <Sidebar>
      <div className="flex h-full w-full max-h-screen flex-col gap-2 bg-gradient-to-b from-white/[0.03] to-transparent">
        <SidebarBrand />

        <div className="flex-1 overflow-auto py-2 custom-scrollbar">
          <NavMain />
        </div>

        <div className="border-t border-zinc-800/30 px-2 pt-2 pb-4">
          <NavSecondary />
          <div className="px-2 pt-2">
            <NavUser />
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
