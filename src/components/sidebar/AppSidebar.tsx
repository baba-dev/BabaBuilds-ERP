"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { useTranslations } from "next-intl";
import { Box } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavUser } from "@/components/navigation/nav-user";
import { Sidebar, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { navIconMap } from "@/src/config/nav-icons";
import { type AppRole, isSidebarBadgeModuleKey, navigationGroups, type NavGroup } from "@/src/config/navigation";
import { NavItemBadge } from "@/src/components/sidebar/NavItemBadge";
import { useSidebarBadges } from "@/src/hooks/useSidebarBadges";
import { getAllowedNavModulesForRole, navItemIdToModule, normalizeRole } from "@/src/config/role-nav-policy";
import { filterByRole } from "@/src/lib/nav/filterByRole";
import { filterByFlag } from "@/src/lib/nav/filterByFlag";

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
  const pathname = usePathname();
  const t = useTranslations("Sidebar");
  const { open, isMobile } = useSidebar();
  const { data: session } = useSession();
  const { badges } = useSidebarBadges();
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({
    aiReconciliation: false,
  });
  const [enabledModules, setEnabledModules] = useState<Set<string> | null>(null);

  const sessionRole = ((session?.user as { role?: string } | undefined)?.role ?? "").toUpperCase();
  const role = sessionRole as AppRole;

  useEffect(() => {
    let active = true;

    async function loadRuntimeFlags() {
      try {
        const response = await fetch("/api/runtime-flags", { cache: "no-store" });
        if (!response.ok) return;
        const runtimeFlags = (await response.json()) as { aiReconciliation?: boolean };
        if (!active) return;
        setFeatureFlags((prev) => ({
          ...prev,
          aiReconciliation: Boolean(runtimeFlags.aiReconciliation),
        }));
      } catch {
        // Keep defaults when runtime flags are unavailable.
      }
    }

    async function loadEnabledModules() {
      try {
        const response = await fetch('/api/workspace/modules', { cache: 'no-store' });
        if (!response.ok) {
          return;
        }
        const payload = (await response.json()) as { modules?: string[] };
        if (!active) return;
        setEnabledModules(new Set(Array.isArray(payload.modules) ? payload.modules : []));
      } catch {
        // keep last-known module state during transient failures
      }
    }

    void loadRuntimeFlags();
    void loadEnabledModules();

    return () => {
      active = false;
    };
  }, []);

  const moduleAwareGroups = useMemo((): NavGroup[] => {
    const moduleSet = enabledModules;
    if (!moduleSet) return navigationGroups;

    return navigationGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => !item.moduleKey || moduleSet.has(item.moduleKey)),
      }))
      .filter((group) => group.items.length > 0);
  }, [enabledModules]);

  const policyRole = normalizeRole(sessionRole);
  const allowedPolicyModules = useMemo(
    () => new Set(policyRole ? getAllowedNavModulesForRole(policyRole) : []),
    [policyRole],
  );

  const rolePolicyFilteredGroups = useMemo((): NavGroup[] => {
    if (!policyRole) return moduleAwareGroups;

    return moduleAwareGroups
      .map((group) => ({
        ...group,
        items: group.items.filter((item) => {
          const navModule = navItemIdToModule(item.id);
          return navModule ? allowedPolicyModules.has(navModule) : true;
        }),
      }))
      .filter((group) => group.items.length > 0);
  }, [allowedPolicyModules, moduleAwareGroups, policyRole]);

  const visibleGroups = filterByFlag(filterByRole(rolePolicyFilteredGroups, role), featureFlags);

  return (
    <Sidebar>
      <div className="flex h-full w-full max-h-screen flex-col gap-2 bg-gradient-to-b from-white/[0.03] to-transparent">
        <SidebarBrand />

        <div className="flex-1 overflow-auto py-2 custom-scrollbar">
          <nav className="grid items-start gap-3 px-2 py-2 text-sm font-medium">
            {visibleGroups.map((group) => (
              <div key={group.id} className="space-y-1">
                {(open || isMobile) && (
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{group.label}</p>
                )}
                {group.items.map((item) => {
                  const Icon = navIconMap[item.icon];
                  const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
                  const badgeKey = item.badgeSource;
                  const badgeState = badgeKey && isSidebarBadgeModuleKey(badgeKey) ? badges[badgeKey] : null;

                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2 text-zinc-200 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                        isActive ? "bg-indigo-600 text-white shadow-md shadow-indigo-900/20" : "hover:bg-white/10 hover:text-white",
                        !open && !isMobile && "justify-center px-2",
                      )}
                      title={!open && !isMobile ? t(item.label) : undefined}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {(open || isMobile) && <span className="truncate">{t(item.label)}</span>}
                      <NavItemBadge
                        badge={badgeState?.badge ?? null}
                        isLoading={badgeState?.isLoading ?? false}
                        isStale={badgeState?.isStale ?? false}
                        hasError={badgeState?.hasError ?? false}
                        collapsed={!open && !isMobile}
                      />
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
        </div>

        <div className="border-t border-zinc-800/30 px-2 pt-2 pb-4">
          <div className="px-2 pt-2">
            <NavUser />
          </div>
        </div>
      </div>
    </Sidebar>
  );
}
