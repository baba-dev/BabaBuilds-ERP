"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "lucide-react";
import { toast } from "sonner";
import { NavMain } from "@/components/navigation/nav-main";
import { NavSecondary } from "@/components/navigation/nav-secondary";
import { NavUser } from "@/components/navigation/nav-user";
import { Sidebar, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import {
  DEFAULT_USER_PREFERENCES,
  MAX_PINNED_ITEMS,
  type SidebarItemId,
  type UserPreferences,
} from "@/src/types/user-preferences";

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
  const { open, setOpen, setSidebarWidth } = useSidebar();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const res = await fetch("/api/user-preferences");
        if (!res.ok) return;
        const payload = (await res.json()) as UserPreferences;
        setPreferences(payload);
      } catch {
        // no-op: defaults still render
      }
    };

    void loadPreferences();
  }, []);

  useEffect(() => {
    setOpen(!preferences.sidebarCollapsed);
    setSidebarWidth(preferences.sidebarWidth);
  }, [preferences.sidebarCollapsed, preferences.sidebarWidth, setOpen, setSidebarWidth]);

  const persistPreferences = async (next: UserPreferences, previous: UserPreferences) => {
    try {
      const res = await fetch("/api/user-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Failed to save preferences.");
      }
    } catch (error) {
      setPreferences(previous);
      toast.error(error instanceof Error ? error.message : "Failed to save preferences.");
    }
  };

  const onTogglePin = (itemId: SidebarItemId, shouldPin: boolean) => {
    setPinError(null);
    const currentPinned = preferences.pinnedIds;

    if (shouldPin && !currentPinned.includes(itemId) && currentPinned.length >= MAX_PINNED_ITEMS) {
      const message = `You can only pin up to ${MAX_PINNED_ITEMS} items.`;
      setPinError(message);
      toast.error(message);
      return;
    }

    const nextPinned = shouldPin
      ? currentPinned.includes(itemId)
        ? currentPinned
        : [...currentPinned, itemId]
      : currentPinned.filter((id) => id !== itemId);

    const previous = preferences;
    const next = { ...preferences, pinnedIds: nextPinned };
    setPreferences(next);
    void persistPreferences(next, previous);
  };

  const onNavigate = (itemId: SidebarItemId) => {
    const nextRecent = [itemId, ...preferences.recentItems.filter((id) => id !== itemId)].slice(0, 10);
    const previous = preferences;
    const next = { ...preferences, recentItems: nextRecent };
    setPreferences(next);
    void persistPreferences(next, previous);
  };

  useEffect(() => {
    const collapsed = !open;
    if (preferences.sidebarCollapsed === collapsed) return;

    const previous = preferences;
    const next = { ...preferences, sidebarCollapsed: collapsed };
    setPreferences(next);
    void persistPreferences(next, previous);
  }, [open, preferences]);

  return (
    <Sidebar>
      <div className="flex h-full w-full max-h-screen flex-col gap-2 bg-gradient-to-b from-white/[0.03] to-transparent">
        <SidebarBrand />

        <div className="flex-1 overflow-auto py-2 custom-scrollbar">
          <NavMain
            preferences={preferences}
            pinError={pinError}
            onTogglePin={onTogglePin}
            onNavigate={onNavigate}
          />
        </div>

        <div className="border-t border-zinc-800/30 px-2 pt-2 pb-4">
          <NavSecondary
            preferences={preferences}
            onTogglePin={onTogglePin}
            onNavigate={onNavigate}
          />
          <div className="px-2 pt-2">
            <NavUser />
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
