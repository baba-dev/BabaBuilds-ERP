"use client";

import Link from "next/link";
import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useSession } from "next-auth/react";
import {
  Archive,
  Box,
  Briefcase,
  ChevronDown,
  FileSignature,
  Landmark,
  LayoutDashboard,
  MessageSquare,
  Pin,
  Receipt,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { emitSidebarAnalyticsEvent } from "@/lib/sidebar-analytics";

type RouteItem = {
  key: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
};

const routes: RouteItem[] = [
  { key: "dashboard", path: "/dashboard", icon: LayoutDashboard },
  { key: "service_catalog", path: "/services", icon: Briefcase },
  { key: "shop", path: "/shop", icon: Store },
  { key: "inventory", path: "/inventory", icon: Archive },
  { key: "client_crm", path: "/clients", icon: Users },
  { key: "quotes_proposals", path: "/proposals", icon: FileSignature },
  { key: "retainers_hub", path: "/retainers", icon: Box },
  { key: "expenses_margins", path: "/expenses", icon: Receipt },
  { key: "savings_tax", path: "/tax", icon: ShieldCheck },
  { key: "ai_reconciliation", path: "/reconciliation", icon: Sparkles },
  { key: "invoices_and_earnings", path: "/income", icon: ReceiptText },
  { key: "ca_compliance", path: "/ca-portal", icon: Landmark },
];

const PIN_STORAGE_KEY = "sidebar:pinned-items";

export function NavMain() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();

  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [pinned, setPinned] = React.useState<string[]>([]);
  const [showPinned, setShowPinned] = React.useState(true);
  const [showAll, setShowAll] = React.useState(true);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);

  const role = session?.user && "role" in session.user ? String((session.user as { role?: string }).role ?? "unknown") : "unknown";

  React.useEffect(() => {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as string[];
      if (Array.isArray(parsed)) {
        setPinned(parsed);
      }
    } catch {
      setPinned([]);
    }
  }, []);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName ?? "";
      const isEditableTarget =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        target?.isContentEditable === true ||
        target?.getAttribute("role") === "textbox";

      if (event.key === "/" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        if (isEditableTarget || !searchRef.current) {
          return;
        }
        event.preventDefault();
        searchRef.current.focus();
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (!searchRef.current) {
          return;
        }
        event.preventDefault();
        searchRef.current.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleRoutes = React.useMemo(() => {
    const lowered = query.trim().toLowerCase();
    if (!lowered) {
      return routes;
    }
    return routes.filter((route) => t(route.key).toLowerCase().includes(lowered));
  }, [query, t]);

  const pinnedRoutes = React.useMemo(() => routes.filter((route) => pinned.includes(route.key)), [pinned]);

  React.useEffect(() => {
    emitSidebarAnalyticsEvent("sidebar_search_query", {
      route: pathname,
      role,
      module: "navigation",
      query_length: query.length,
      result_count: visibleRoutes.length,
    });

    if (query.trim().length > 0 && visibleRoutes.length === 0) {
      emitSidebarAnalyticsEvent("sidebar_search_no_results", {
        route: pathname,
        role,
        module: "navigation",
        query_length: query.length,
      });
    }
  }, [pathname, query, role, visibleRoutes.length]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  const keyboardItems = visibleRoutes;

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (keyboardItems.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % keyboardItems.length);
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + keyboardItems.length) % keyboardItems.length);
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = keyboardItems[activeIndex];
      if (!selected) return;
      emitSidebarAnalyticsEvent("sidebar_item_click", {
        route: pathname,
        role,
        module: selected.key,
        target_path: selected.path,
        source: "keyboard",
      });
      router.push(selected.path);
    }
  };

  const togglePin = (route: RouteItem) => {
    setPinned((prev) => {
      const exists = prev.includes(route.key);
      const next = exists ? prev.filter((item) => item !== route.key) : [...prev, route.key];
      window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(next));
      emitSidebarAnalyticsEvent(exists ? "sidebar_pin_remove" : "sidebar_pin_add", {
        route: pathname,
        role,
        module: route.key,
        target_path: route.path,
      });
      return next;
    });
  };

  const renderRouteLink = (route: RouteItem, idx: number) => {
    const Icon = route.icon;
    const isActive = pathname === route.path;
    const isFocused = idx === activeIndex && isSearchFocused;
    const isPinned = pinned.includes(route.key);

    return (
      <div key={route.key} className="group relative">
        <Link
          href={route.path}
          onClick={() =>
            emitSidebarAnalyticsEvent("sidebar_item_click", {
              route: pathname,
              role,
              module: route.key,
              target_path: route.path,
              source: "mouse",
            })
          }
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-200 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
            isActive ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20" : "hover:bg-white/10 hover:text-white",
            isFocused && "ring-2 ring-indigo-500",
            !open && !isMobile && "justify-center px-2",
          )}
          title={!open && !isMobile ? t(route.key) : undefined}
        >
          <Icon className="h-4 w-4 shrink-0" />
          {(open || isMobile) && <span className="truncate">{t(route.key)}</span>}
        </Link>
        {(open || isMobile) && (
          <button
            type="button"
            onClick={() => togglePin(route)}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-zinc-400 hover:bg-zinc-700/50 hover:text-zinc-100"
            aria-label={isPinned ? `Unpin ${t(route.key)}` : `Pin ${t(route.key)}`}
          >
            <Pin className={cn("h-3.5 w-3.5", isPinned && "fill-current text-indigo-300")} />
          </button>
        )}
      </div>
    );
  };

  return (
    <nav className="grid items-start gap-2 px-2 py-4 text-sm font-medium">
      {(open || isMobile) && (
        <div className="px-1">
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onSearchKeyDown}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Search modules…"
            className="h-9 border-zinc-700 bg-zinc-900 text-zinc-100"
            aria-label="Sidebar search"
          />
          <p className="mt-1 text-[10px] text-zinc-500">Shortcuts: / or Ctrl/Cmd+K</p>
          <button
            type="button"
            onClick={() =>
              emitSidebarAnalyticsEvent("sidebar_ask_ai_click", {
                route: pathname,
                role,
                module: "ai_assistant",
                source: "sidebar",
              })
            }
            className="mt-2 flex w-full items-center gap-2 rounded-md border border-indigo-500/30 bg-indigo-500/10 px-2 py-1.5 text-xs text-indigo-200 hover:bg-indigo-500/20"
          >
            <MessageSquare className="h-3.5 w-3.5" /> Ask AI
          </button>
        </div>
      )}

      {(open || isMobile) && pinnedRoutes.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => {
              setShowPinned((prev) => {
                const next = !prev;
                emitSidebarAnalyticsEvent("sidebar_group_toggle", {
                  route: pathname,
                  role,
                  module: "pinned_group",
                  open: next,
                });
                return next;
              });
            }}
            className="mb-1 flex w-full items-center justify-between px-2 text-[11px] uppercase tracking-wider text-zinc-400"
          >
            Pinned
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !showPinned && "-rotate-90")} />
          </button>
          {showPinned && <div className="grid gap-1">{pinnedRoutes.map((route, idx) => renderRouteLink(route, idx))}</div>}
        </div>
      )}

      <div>
        {(open || isMobile) && (
          <button
            type="button"
            onClick={() => {
              setShowAll((prev) => {
                const next = !prev;
                emitSidebarAnalyticsEvent("sidebar_group_toggle", {
                  route: pathname,
                  role,
                  module: "all_modules_group",
                  open: next,
                });
                return next;
              });
            }}
            className="mb-1 flex w-full items-center justify-between px-2 text-[11px] uppercase tracking-wider text-zinc-400"
          >
            All modules
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", !showAll && "-rotate-90")} />
          </button>
        )}
        {showAll && <div className="grid gap-1">{visibleRoutes.map((route, idx) => renderRouteLink(route, idx))}</div>}
      </div>
    </nav>
  );
}
