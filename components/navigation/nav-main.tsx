"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Separator } from "@/components/ui/separator";
import { useSidebar } from "@/components/ui/sidebar";
import { appNavItems, filterAppNavItems } from "@/components/navigation/nav-config";
import { type SidebarItemId, type UserPreferences } from "@/src/types/user-preferences";

type Props = {
  preferences: UserPreferences;
  pinError: string | null;
  enabledModules: Set<string>;
  grantedPermissions: Set<string>;
  onTogglePin: (itemId: Exclude<SidebarItemId, "settings">, shouldPin: boolean) => void;
  onNavigate: (itemId: Exclude<SidebarItemId, "settings">) => void;
};

export function NavMain({ preferences, pinError, enabledModules, grantedPermissions, onTogglePin, onNavigate }: Props) {
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();

  // Filter items that require a module that is not enabled
  const visibleNavItems = filterAppNavItems(appNavItems, enabledModules, grantedPermissions);

  const recentIds = preferences.recentItems.filter((id): id is Exclude<SidebarItemId, "settings"> => id !== "settings");
  const pinnedIds = preferences.pinnedIds.filter((id): id is Exclude<SidebarItemId, "settings"> => id !== "settings");

  const pinnedSet = new Set(pinnedIds);
  const recentSet = new Set(recentIds);

  const pinnedItems = visibleNavItems.filter((item) => pinnedSet.has(item.key as Exclude<SidebarItemId, "settings">));
  const byKey = new Map(visibleNavItems.map((item) => [item.key, item] as const));
  const recentItems = recentIds
    .map((id) => byKey.get(id))
    .filter((item): item is (typeof visibleNavItems)[number] => Boolean(item) && !pinnedSet.has((item?.key ?? "") as Exclude<SidebarItemId, "settings">))
    .slice(0, 3);
  const regularItems = (open || isMobile)
    ? visibleNavItems.filter((item) => !pinnedSet.has(item.key as Exclude<SidebarItemId, "settings">))
    : visibleNavItems;

  const renderItem = (item: (typeof appNavItems)[number], area: "pinned" | "recent" | "all") => {
    const Icon = item.icon;
    const isActive = pathname === item.path || (item.path !== "/dashboard" && pathname.startsWith(item.path));
    const isPinned = pinnedSet.has(item.key as Exclude<SidebarItemId, "settings">);

    return (
      <div key={`${area}-${item.key}`} className="group flex items-center gap-1">
        <Link
          href={item.path}
          onClick={() => onNavigate(item.key as Exclude<SidebarItemId, "settings">)}
          className={cn(
            "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-zinc-200 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
            isActive
              ? "bg-gradient-to-br from-orange-600 to-amber-600 text-white shadow-md shadow-orange-950/25"
              : "hover:bg-white/10 hover:text-white",
            !open && !isMobile && "justify-center px-2",
          )}
          title={!open && !isMobile ? t(item.key) : undefined}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {(open || isMobile) && <span className="truncate">{t(item.key)}</span>}
        </Link>

        {(open || isMobile) && (
          <button
            type="button"
            className="rounded-md p-1 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
            onClick={() => onTogglePin(item.key as Exclude<SidebarItemId, "settings">, !isPinned)}
            aria-label={isPinned ? t("unpinItem", { item: t(item.key) }) : t("pinItem", { item: t(item.key) })}
            title={isPinned ? t("unpinItem", { item: t(item.key) }) : t("pinItem", { item: t(item.key) })}
          >
            {isPinned ? (
              <PinOff className="h-3.5 w-3.5" />
            ) : (
              <Pin className="h-3.5 w-3.5 opacity-60 group-hover:opacity-100" />
            )}
          </button>
        )}
      </div>
    );
  };

  return (
    <nav className="grid items-start gap-2 px-2 py-2 text-sm font-medium">
      {(open || isMobile) && pinnedItems.length > 0 && (
        <div className="space-y-1 pb-2">
          <div className="px-2 text-[11px] uppercase tracking-wider text-zinc-400">{t("pinned")}</div>
          {pinnedItems.map((item) => renderItem(item, "pinned"))}
          {pinError && <p className="px-2 pt-1 text-xs text-rose-400">{pinError}</p>}
        </div>
      )}

      {(open || isMobile) && recentItems.length > 0 && (
        <div className="space-y-1 pb-2">
          <div className="px-2 text-[11px] uppercase tracking-wider text-zinc-400">{t("recently_visited")}</div>
          {recentItems.map((item) => renderItem(item, "recent"))}
        </div>
      )}

      {(open || isMobile) && (pinnedItems.length > 0 || recentItems.length > 0) && (
        <div className="py-1">
          <Separator className="bg-zinc-800/50" />
        </div>
      )}
      <div className="space-y-1">{regularItems.map((item) => renderItem(item, "all"))}</div>
    </nav>
  );
}
