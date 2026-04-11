"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import {
  Archive,
  Box,
  Briefcase,
  FileSignature,
  Landmark,
  LayoutDashboard,
  Receipt,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";

type NavRoute = {
  key: string;
  path: string;
  icon: LucideIcon;
};

type RecentItem = {
  path: string;
  visitedAt: number;
};

const STORAGE_KEY = "recentItems";
const MAX_RECENT_ITEMS = 3;

const pinnedRoutes: NavRoute[] = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "invoices_and_earnings", path: "/income", icon: ReceiptText },
];

const groupedRoutes: NavRoute[] = [
  { key: "service_catalog", path: "/services", icon: Briefcase },
  { key: "shop", path: "/shop", icon: Store },
  { key: "inventory", path: "/inventory", icon: Archive },
  { key: "client_crm", path: "/clients", icon: Users },
  { key: "quotes_proposals", path: "/proposals", icon: FileSignature },
  { key: "retainers_hub", path: "/retainers", icon: Box },
  { key: "expenses_margins", path: "/expenses", icon: Receipt },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark },
];

const allRoutes = [...pinnedRoutes, ...groupedRoutes];
const routeByPath = new Map(allRoutes.map((route) => [route.path, route]));

function isExcludedRoute(pathname: string): boolean {
  const utilityPrefixes = ["/api", "/login", "/settings", "/admin", "/invite", "/share-target", "/open-file", "/help"];
  return utilityPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function readRecentItems(userId: string): RecentItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const byUser = JSON.parse(raw) as Record<string, RecentItem[] | undefined>;
    const items = byUser[userId];
    if (!Array.isArray(items)) {
      return [];
    }

    return items
      .filter((item): item is RecentItem => typeof item?.path === "string" && typeof item?.visitedAt === "number")
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, MAX_RECENT_ITEMS);
  } catch {
    return [];
  }
}

function persistRecentItems(userId: string, pathname: string): RecentItem[] {
  if (typeof window === "undefined") {
    return [];
  }

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

function RouteLink({ route, activePathname }: { route: NavRoute; activePathname: string }) {
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();
  const Icon = route.icon;
  const isActive = activePathname === route.path;

  return (
    <Link
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
}

export function NavMain() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const { open, isMobile } = useSidebar();

  const userId = (session?.user as { id?: string } | undefined)?.id;
  const shouldTrackPath = Boolean(userId && pathname && !isExcludedRoute(pathname) && routeByPath.has(pathname));

  const recentItems = useMemo(() => {
    if (!userId) {
      return [];
    }

    const storedItems = readRecentItems(userId);
    if (!shouldTrackPath || !pathname) {
      return storedItems;
    }

    return [{ path: pathname, visitedAt: Number.MAX_SAFE_INTEGER }, ...storedItems.filter((item) => item.path !== pathname)]
      .sort((a, b) => b.visitedAt - a.visitedAt)
      .slice(0, MAX_RECENT_ITEMS);
  }, [pathname, shouldTrackPath, userId]);

  useEffect(() => {
    if (!shouldTrackPath || !userId || !pathname) {
      return;
    }

    persistRecentItems(userId, pathname);
  }, [pathname, shouldTrackPath, userId]);

  const recentRoutes = recentItems
    .map((item) => routeByPath.get(item.path))
    .filter((route): route is NavRoute => Boolean(route));

  return (
    <nav className="grid items-start gap-1 px-2 py-4 text-sm font-medium">
      {(open || isMobile) && <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Pinned</p>}
      {pinnedRoutes.map((route) => (
        <RouteLink key={route.key} route={route} activePathname={pathname} />
      ))}

      {(open || isMobile) && recentRoutes.length > 0 && (
        <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Recently Visited</p>
      )}
      {recentRoutes.map((route) => (
        <RouteLink key={`recent-${route.key}`} route={route} activePathname={pathname} />
      ))}

      {(open || isMobile) && <p className="px-3 pt-4 pb-1 text-xs font-semibold uppercase tracking-wide text-zinc-500">Groups</p>}
      {groupedRoutes.map((route) => (
        <RouteLink key={route.key} route={route} activePathname={pathname} />
      ))}
    </nav>
  );
}
