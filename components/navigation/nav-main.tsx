"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Archive,
  Box,
  Briefcase,
  ChevronDown,
  FileSignature,
  Landmark,
  LayoutDashboard,
  Pin,
  PinOff,
  Receipt,
  ReceiptText,
  Settings,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { NavItemBadge } from "@/src/components/sidebar/NavItemBadge";
import {
  isSidebarBadgeModuleKey,
  type SidebarItemId,
  type UserPreferences,
} from "@/src/config/navigation";
import { useSidebarBadges } from "@/src/hooks/useSidebarBadges";

type NavItem = {
  key: SidebarItemId;
  path: string;
  icon: ComponentType<{ className?: string }>;
  group?: "core" | "operations" | "finance";
};

type RecentItem = {
  path: string;
  visitedAt: number;
};

const STORAGE_KEY = "recentItems";
const MAX_RECENT_ITEMS = 3;

const allRoutes: NavItem[] = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard, group: "core" },
  { key: "service_catalog", path: "/services", icon: Briefcase, group: "core" },
  { key: "shop", path: "/shop", icon: Store, group: "core" },
  { key: "inventory", path: "/inventory", icon: Archive, group: "operations" },
  { key: "client_crm", path: "/clients", icon: Users, group: "operations" },
  { key: "quotes_proposals", path: "/proposals", icon: FileSignature, group: "operations" },
  { key: "retainers_hub", path: "/retainers", icon: Box, group: "operations" },
  { key: "expenses_margins", path: "/expenses", icon: Receipt, group: "finance" },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck, group: "finance" },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles, group: "finance" },
  { key: "invoices_and_earnings", path: "/income", icon: ReceiptText, group: "finance" },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark, group: "finance" },
  { key: "settings", path: "/settings", icon: Settings },
];

const routeByPath = new Map(allRoutes.map((route) => [route.path, route]));

function isExcludedRoute(pathname: string): boolean {
  const utilityPrefixes = [
    "/api",
    "/login",
    "/settings",
    "/admin",
    "/invite",
    "/share-target",
    "/open-file",
    "/help",
  ];
  return utilityPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function readRecentItems(userId: string): RecentItem[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const byUser = JSON.parse(raw) as Record<string, RecentItem[] | undefined>;
    const items = byUser[userId];
    if (!Array.isArray(items)) return [];

    return items
      .filter(
        (item): item is RecentItem =>
          typeof item?.path === "string" && typeof item?.visitedAt === "number",
      )
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, MAX_RECENT_ITEMS);
  } catch {
    return [];
  }
}

function persistRecentItems(userId: string, pathname: string): RecentItem[] {
  if (typeof window === "undefined") return [];

  const now = Date.now();

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const byUser = raw ? (JSON.parse(raw) as Record<string, RecentItem[] | undefined>) : {};

    const existing = Array.isArray(byUser[userId]) ? byUser[userId]! : [];
    const deduped = existing.filter((item) => item.path !== pathname);
    const next = [{ path: pathname, visitedAt: now }, ...deduped]
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, MAX_RECENT_ITEMS);

    byUser[userId] = next;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(byUser));

    return next;
  } catch {
    return [];
  }
}

type Props = {
  preferences: UserPreferences;
  pinError: string | null;
  onTogglePin: (itemId: SidebarItemId, shouldPin: boolean) => void;
  onNavigate: (itemId: SidebarItemId) => void;
};

function SidebarRow({
  item,
  isPinned,
  onTogglePin,
  onNavigate,
}: {
  item: NavItem;
  isPinned: boolean;
  onTogglePin: (itemId: SidebarItemId, shouldPin: boolean) => void;
  onNavigate: (itemId: SidebarItemId) => void;
}) {
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();
  const { badges } = useSidebarBadges({ pollIntervalMs: 90_000 });

  const Icon = item.icon;
  const isActive = pathname === item.path;
  const badgeState = isSidebarBadgeModuleKey(item.key) ? badges[item.key] : null;

  return (
    <div className="group flex items-center gap-1">
      <Link
        href={item.path}
        onClick={() => onNavigate(item.key)}
        className={cn(
          "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2 text-zinc-200 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
          isActive
            ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20"
            : "hover:bg-white/10 hover:text-white",
          !open && !isMobile && "justify-center px-2",
        )}
        title={!open && !isMobile ? t(item.key) : undefined}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {(open || isMobile) && <span className="truncate">{t(item.key)}</span>}
        <NavItemBadge
          badge={badgeState?.badge ?? null}
          isLoading={badgeState?.isLoading}
          isStale={badgeState?.isStale}
          hasError={badgeState?.hasError}
          collapsed={!open && !isMobile}
        />
      </Link>

      {(open || isMobile) && (
        <button
          type="button"
          className="rounded-md p-1 text-zinc-400 transition hover:bg-white/10 hover:text-zinc-100"
          onClick={() => onTogglePin(item.key, !isPinned)}
          aria-label={isPinned ? `Unpin ${t(item.key)}` : `Pin ${t(item.key)}`}
          title={isPinned ? `Unpin ${t(item.key)}` : `Pin ${t(item.key)}`}
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
}

export function NavMain({ preferences, pinError, onTogglePin, onNavigate }: Props) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();

  const [collapsedGroups, setCollapsedGroups] = useState<
    Record<"core" | "operations" | "finance", boolean>
  >({
    core: false,
    operations: false,
    finance: false,
  });

  const pinnedItems = allRoutes.filter((route) => preferences.pinnedIds.includes(route.key));
  const groupedRoutes = allRoutes.filter((route) => route.key !== "settings");

  const grouped: Record<"core" | "operations" | "finance", NavItem[]> = {
    core: groupedRoutes.filter((route) => route.group === "core"),
    operations: groupedRoutes.filter((route) => route.group === "operations"),
    finance: groupedRoutes.filter((route) => route.group === "finance"),
  };

  const groupLabels: Record<"core" | "operations" | "finance", string> = {
    core: "Core",
    operations: "Operations",
    finance: "Finance",
  };

  const toggleGroup = (group: "core" | "operations" | "finance") => {
    setCollapsedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const userId = (session?.user as { id?: string } | undefined)?.id;
  const shouldTrackPath = Boolean(
    userId && pathname && !isExcludedRoute(pathname) && routeByPath.has(pathname),
  );

  const recentItems = useMemo(() => {
    if (!userId) return [];

    const storedItems = readRecentItems(userId);
    if (!shouldTrackPath || !pathname) return storedItems;

    return [
      { path: pathname, visitedAt: Number.MAX_SAFE_INTEGER },
      ...storedItems.filter((item) => item.path !== pathname),
    ]
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, MAX_RECENT_ITEMS);
  }, [pathname, shouldTrackPath, userId]);

  useEffect(() => {
    if (!shouldTrackPath || !userId || !pathname) return;
    persistRecentItems(userId, pathname);
  }, [pathname, shouldTrackPath, userId]);

  const recentRoutes = recentItems
    .map((item) => routeByPath.get(item.path))
    .filter((route): route is NavItem => Boolean(route) && route.key !== "settings");

  return (
    <nav className="grid items-start gap-2 px-2 py-4 text-sm font-medium">
      {(open || isMobile) && pinnedItems.length > 0 && (
        <div className="space-y-1 pb-2">
          <div className="px-2 text-[11px] uppercase tracking-wider text-zinc-400">
            {t("pinned")}
          </div>
          {pinnedItems.map((item) => (
            <SidebarRow
              key={`pinned-${item.key}`}
              item={item}
              isPinned
              onTogglePin={onTogglePin}
              onNavigate={onNavigate}
            />
          ))}
          {pinError && <p className="px-2 pt-1 text-xs text-rose-400">{pinError}</p>}
        </div>
      )}

      {(open || isMobile) && recentRoutes.length > 0 && (
        <div className="space-y-1 pb-2">
          <div className="px-2 text-[11px] uppercase tracking-wider text-zinc-400">
            {t("recently_visited")}
          </div>
          {recentRoutes.map((item) => (
            <SidebarRow
              key={`recent-${item.key}`}
              item={item}
              isPinned={preferences.pinnedIds.includes(item.key)}
              onTogglePin={onTogglePin}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      {(["core", "operations", "finance"] as const).map((group) => (
        <div key={group} className="space-y-1">
          {(open || isMobile) && (
            <button
              type="button"
              onClick={() => toggleGroup(group)}
              className="flex w-full items-center justify-between rounded-md px-2 py-1 text-xs uppercase tracking-wider text-zinc-400 hover:bg-white/5"
            >
              <span>{groupLabels[group]}</span>
              <ChevronDown
                className={cn(
                  "h-3.5 w-3.5 transition-transform",
                  collapsedGroups[group] && "-rotate-90",
                )}
              />
            </button>
          )}

          {(!collapsedGroups[group] || !open) &&
            grouped[group].map((route) => (
              <SidebarRow
                key={route.key}
                item={route}
                isPinned={preferences.pinnedIds.includes(route.key)}
                onTogglePin={onTogglePin}
                onNavigate={onNavigate}
              />
            ))}
        </div>
      ))}
    </nav>
  );
}