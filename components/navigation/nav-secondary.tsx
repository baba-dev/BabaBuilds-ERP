"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pin, PinOff, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { type UserPreferences } from "@/src/types/user-preferences";

type Props = {
  preferences: UserPreferences;
  onTogglePin: (itemId: "settings", shouldPin: boolean) => void;
  onNavigate: (itemId: "settings") => void;
};

export function NavSecondary({ preferences, onTogglePin, onNavigate }: Props) {
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();
  const isActive = pathname.startsWith("/settings");
  const isPinned = preferences.pinnedIds.includes("settings");

  return (
    <nav className="grid items-start gap-1 px-2 py-0 text-sm font-medium">
      {(open || isMobile) && (
        <div className="px-2 py-2">
          <Separator className="bg-zinc-800/50" />
        </div>
      )}

      <div className="group flex items-center gap-1">
        <Link
          href="/settings"
          onClick={() => onNavigate("settings")}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-zinc-200 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
            isActive ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20" : "hover:bg-white/10 hover:text-white",
            !open && !isMobile && "justify-center px-2",
          )}
          title={!open && !isMobile ? t("settings") : undefined}
        >
          <Settings className="h-4 w-4 shrink-0" />
          {(open || isMobile) && <span className="truncate">{t("settings")}</span>}
        </Link>

        {(open || isMobile) && (
          <button
            type="button"
            className="rounded-md p-1 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
            onClick={() => onTogglePin("settings", !isPinned)}
            aria-label={isPinned ? "Unpin settings" : "Pin settings"}
            title={isPinned ? "Unpin settings" : "Pin settings"}
          >
            {isPinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
            )}
          </button>
        )}
      </div>
    </nav>
  );
}