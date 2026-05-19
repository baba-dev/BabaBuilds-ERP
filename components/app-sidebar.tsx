"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Box } from "lucide-react";
import { toast } from "sonner";
import { NavMain } from "@/components/navigation/nav-main";
import { NavSecondary } from "@/components/navigation/nav-secondary";
import { NavUser } from "@/components/navigation/nav-user";
import { SidebarOnboardingChecklist } from "@/components/onboarding/SidebarOnboardingChecklist";
import { Sidebar, useSidebar } from "@/components/ui/sidebar";
import { SidebarSearch } from "@/src/components/sidebar/SidebarSearch";
import { getCurrentFinancialYear } from "@/lib/financial-year";
import {
  DEFAULT_USER_PREFERENCES,
  MAX_PINNED_ITEMS,
  type SidebarItemId,
  type UserPreferences,
} from "@/src/types/user-preferences";
import TrialStatusPill from "@/components/dashboard/TrialStatusPill";

function SidebarBrand() {
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();
  const fy = getCurrentFinancialYear();
  const fyParts = fy.split("-");
  const ay = `${parseInt(fyParts[0]) + 1}-${parseInt(fyParts[1]) + 1}`;

  return (
    <div className="flex h-16 items-center justify-between border-b border-zinc-800/30 px-4 shrink-0">
      <Link href="/dashboard" className="flex items-center gap-3 font-bold text-zinc-50 group min-w-0">
        <div className="rounded-xl bg-gradient-to-br from-orange-600 to-amber-600 p-1.5 shadow-lg shadow-orange-950/30 transition-transform duration-300 group-hover:scale-110">
          <Box className="h-5 w-5 text-white" />
        </div>
        {(open || isMobile) && (
          <div className="flex flex-col min-w-0">
            <span className="truncate text-lg tracking-tight text-white transition-colors hover:text-amber-300">
              {t("bababuilds_erp")}
            </span>
            <span className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">
              FY {fy} • AY {ay}
            </span>
          </div>
        )}
      </Link>
    </div>
  );
}

export function AppSidebar() {
  const { open, setOpen, setSidebarWidth, isMobile } = useSidebar();
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_USER_PREFERENCES);
  const [pinError, setPinError] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);
  const [enabledModules, setEnabledModules] = useState<Set<string>>(new Set());
  const [grantedPermissions, setGrantedPermissions] = useState<Set<string>>(new Set());
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);
  const [isTrialing, setIsTrialing] = useState(false);
  const skipNextOpenSyncRef = useRef(false);

  const loadPreferences = useCallback(async () => {
    try {
      const [prefRes, modulesRes, teamRes] = await Promise.all([
        fetch("/api/user-preferences"),
        fetch("/api/workspace/modules"),
        fetch("/api/team/members"),
      ]);

      if (prefRes.ok) {
        const payload = (await prefRes.json()) as UserPreferences;
        setPreferences(payload);
      }

      const settingsRes = await fetch("/api/settings", { cache: "no-store" });
      if (settingsRes.ok) {
        const settings = (await settingsRes.json()) as {
          subscriptionStatus?: string;
          subscriptionEndsAt?: string | null;
        };
        setIsTrialing(settings.subscriptionStatus === "TRIALING");
        setTrialEndsAt(settings.subscriptionEndsAt ?? null);
      }

      if (modulesRes.ok) {
        const { modules } = (await modulesRes.json()) as { modules: string[] };
        setEnabledModules(new Set(modules));
      }

      if (teamRes.ok) {
        const payload = (await teamRes.json()) as { data?: { grantedPermissions?: Record<string, boolean> } };
        const granted = Object.entries(payload.data?.grantedPermissions ?? {}).filter(([,v]) => v).map(([k]) => k);
        setGrantedPermissions(new Set(granted));
      }
    } catch {
      // no-op: defaults still render
    } finally {
      setIsHydrated(true);
    }
  }, []);

  const persistPreferencePatch = useCallback(
    async (patch: Partial<UserPreferences>) => {
      try {
        const res = await fetch("/api/user-preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "Failed to save preferences.");
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to save preferences.");
        await loadPreferences();
      }
    },
    [loadPreferences],
  );

  useEffect(() => {
    skipNextOpenSyncRef.current = true;
    void loadPreferences();
  }, [loadPreferences]);

  useEffect(() => {
    setSidebarWidth(preferences.sidebarWidth);
    const nextOpen = true; // Always open on desktop
    if (open !== nextOpen) {
      skipNextOpenSyncRef.current = true;
      setOpen(nextOpen);
    }
  }, [preferences.sidebarWidth, open, setOpen, setSidebarWidth]);

  const updatePreferencesOptimistically = useCallback(
    (
      updater: (current: UserPreferences) => UserPreferences,
      patchFromNext: (next: UserPreferences) => Partial<UserPreferences>,
    ) => {
      let patchToPersist: Partial<UserPreferences> | null = null;

      setPreferences((current) => {
        const next = updater(current);
        if (next === current) {
          return current;
        }

        patchToPersist = patchFromNext(next);
        return next;
      });

      if (patchToPersist) {
        void persistPreferencePatch(patchToPersist);
      }
    },
    [persistPreferencePatch],
  );

  const onTogglePin = (itemId: SidebarItemId, shouldPin: boolean) => {
    setPinError(null);

    updatePreferencesOptimistically(
      (current) => {
        if (shouldPin && !current.pinnedIds.includes(itemId) && current.pinnedIds.length >= MAX_PINNED_ITEMS) {
          const message = `You can only pin up to ${MAX_PINNED_ITEMS} items.`;
          setPinError(message);
          toast.error(message);
          return current;
        }

        const nextPinned = shouldPin
          ? current.pinnedIds.includes(itemId)
            ? current.pinnedIds
            : [...current.pinnedIds, itemId]
          : current.pinnedIds.filter((id) => id !== itemId);

        return { ...current, pinnedIds: nextPinned };
      },
      (next) => ({ pinnedIds: next.pinnedIds }),
    );
  };

  const onNavigate = (itemId: SidebarItemId) => {
    updatePreferencesOptimistically(
      (current) => {
        const nextRecent = [itemId, ...current.recentItems.filter((id) => id !== itemId)].slice(0, 10);
        return { ...current, recentItems: nextRecent };
      },
      (next) => ({ recentItems: next.recentItems }),
    );
  };

  useEffect(() => {
    if (!isHydrated) return;

    if (skipNextOpenSyncRef.current) {
      skipNextOpenSyncRef.current = false;
      return;
    }

    const collapsed = !open;
    let didChange = false;

    setPreferences((current) => {
      if (current.sidebarCollapsed === collapsed) {
        return current;
      }

      didChange = true;
      return { ...current, sidebarCollapsed: collapsed };
    });

    if (didChange) {
      void persistPreferencePatch({ sidebarCollapsed: collapsed });
    }
  }, [open, isHydrated, persistPreferencePatch]);

  return (
    <Sidebar>
      <div className="flex h-full w-full max-h-screen flex-col gap-2 bg-gradient-to-b from-white/[0.03] to-transparent">
        <SidebarBrand />
      {(open || isMobile) && (
        <div className="px-4 pb-2">
          <TrialStatusPill trialEndsAt={trialEndsAt} isTrialing={isTrialing} />
        </div>
      )}

        <SidebarSearch enabledModules={enabledModules} grantedPermissions={grantedPermissions} />

        <div className="flex-1 overflow-auto py-2 custom-scrollbar">
          <NavMain
            preferences={preferences}
            pinError={pinError}
            enabledModules={enabledModules}
            grantedPermissions={grantedPermissions}
            onTogglePin={onTogglePin}
            onNavigate={onNavigate}
          />
          <SidebarOnboardingChecklist />
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