"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Pin, PinOff, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { appNavItems, filterAppNavItems } from "@/components/navigation/nav-config";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const RECENT_LIMIT = 5;

export function NavMain() {
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { open, isMobile, setOpenMobile } = useSidebar();
  const { data: session } = useSession();
  const [search, setSearch] = React.useState("");
  const [pinned, setPinned] = React.useState<string[]>([]);
  const [recent, setRecent] = React.useState<string[]>([]);
  const [prefsHydrated, setPrefsHydrated] = React.useState(false);

  const navItems = React.useMemo(() => filterAppNavItems(appNavItems), []);

  const storageKey = React.useMemo(() => {
    const userId = session?.user && "id" in session.user ? String(session.user.id ?? "anonymous") : "anonymous";
    return `bb.navprefs.${userId}`;
  }, [session]);

  React.useEffect(() => {
    setPrefsHydrated(false);
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) {
      setPinned([]);
      setRecent([]);
      setPrefsHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw) as { pinned?: string[]; recent?: string[] };
      setPinned(Array.isArray(parsed.pinned) ? parsed.pinned : []);
      setRecent(Array.isArray(parsed.recent) ? parsed.recent : []);
    } catch {
      window.localStorage.removeItem(storageKey);
      setPinned([]);
      setRecent([]);
    } finally {
      setPrefsHydrated(true);
    }
  }, [storageKey]);

  React.useEffect(() => {
    if (!prefsHydrated) return;
    window.localStorage.setItem(storageKey, JSON.stringify({ pinned, recent }));
  }, [pinned, prefsHydrated, recent, storageKey]);

  React.useEffect(() => {
    if (!pathname) return;
    setRecent((current) => {
      const next = [pathname, ...current.filter((item) => item !== pathname)];
      return next.slice(0, RECENT_LIMIT);
    });
  }, [pathname]);

  const togglePinned = React.useCallback((path: string) => {
    setPinned((current) => (current.includes(path) ? current.filter((item) => item !== path) : [...current, path]));
  }, []);

  const filteredItems = React.useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) {
      return navItems;
    }

    return navItems.filter((item) => t(item.key).toLowerCase().includes(normalized));
  }, [navItems, search, t]);

  const pinnedSet = new Set(pinned);
  const recentSet = new Set(recent);

  const pinnedItems = filteredItems.filter((item) => pinnedSet.has(item.path));
  const regularItems = (open || isMobile)
    ? filteredItems.filter((item) => !pinnedSet.has(item.path))
    : filteredItems;
  const recentItems = filteredItems.filter((item) => recentSet.has(item.path) && !pinnedSet.has(item.path));

  const renderRoute = (route: (typeof navItems)[number]) => {
    const Icon = route.icon;
    const isActive = pathname === route.path;
    const isPinned = pinnedSet.has(route.path);

    return (
      <div
        key={route.key}
        className={cn(
          "group flex items-center gap-1 rounded-lg",
          isActive && "bg-indigo-600 text-white shadow-md shadow-indigo-900/20",
        )}
      >
        <Link
          href={route.path}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
          }}
          className={cn(
            "flex flex-1 items-center gap-3 rounded-lg px-3 py-2 text-zinc-200 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
            !isActive && "hover:bg-white/10 hover:text-white",
            !open && !isMobile && "justify-center px-2",
          )}
          title={!open && !isMobile ? t(route.key) : undefined}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {(open || isMobile) && (
            <>
              <span className="truncate">{t(route.key)}</span>
              {route.badge ? <Badge className="ml-auto h-5 px-1.5 text-[10px]">{route.badge}</Badge> : null}
            </>
          )}
        </Link>
        {(open || isMobile) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 text-zinc-400 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
            onClick={() => togglePinned(route.path)}
            aria-label={isPinned ? `Unpin ${t(route.key)}` : `Pin ${t(route.key)}`}
          >
            {isPinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
          </Button>
        )}
      </div>
    );
  };

  return (
    <nav id="main-navigation" aria-label="Main navigation" className="grid items-start gap-2 px-2 py-4 text-sm font-medium">
      {(open || isMobile) && (
        <div className="px-1">
          <label htmlFor="nav-search" className="sr-only">Search navigation</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
            <Input
              id="nav-search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search pages"
              className="h-9 border-white/10 bg-white/5 pl-8 text-zinc-100 placeholder:text-zinc-500"
            />
          </div>
        </div>
      )}

      {pinnedItems.length > 0 && (open || isMobile) ? (
        <section className="space-y-1">
          <h3 className="px-2 text-xs uppercase tracking-wide text-zinc-500">Pinned</h3>
          {pinnedItems.map(renderRoute)}
        </section>
      ) : null}

      <section className="space-y-1">{regularItems.map(renderRoute)}</section>

      {recentItems.length > 0 && (open || isMobile) ? (
        <section className="space-y-1 pt-2">
          <h3 className="px-2 text-xs uppercase tracking-wide text-zinc-500">Recent</h3>
          {recentItems.slice(0, 3).map(renderRoute)}
        </section>
      ) : null}
    </nav>
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
