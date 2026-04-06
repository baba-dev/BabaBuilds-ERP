"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

export function NavSecondary() {
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();
  const isActive = pathname.startsWith("/settings");

  return (
    <nav className="grid items-start gap-1 px-2 py-2 text-sm font-medium">
      <Link
        href="/settings"
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-200 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
          isActive ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20" : "hover:bg-white/10 hover:text-white",
          !open && !isMobile && "justify-center px-2",
        )}
        title={!open && !isMobile ? t("settings") : undefined}
      >
        <Settings className="h-4 w-4 shrink-0" />
        {(open || isMobile) && <span className="truncate">{t("settings")}</span>}
      </Link>
    </nav>
  );
}
