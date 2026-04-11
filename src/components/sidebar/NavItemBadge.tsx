"use client";

import { cn } from "@/lib/utils";
import type { SidebarBadge } from "@/src/config/navigation";

type NavItemBadgeProps = {
  badge: SidebarBadge | null;
  isLoading?: boolean;
  isStale?: boolean;
  hasError?: boolean;
  collapsed?: boolean;
};

export function NavItemBadge({ badge, isLoading = false, isStale = false, hasError = false, collapsed = false }: NavItemBadgeProps) {
  if (!badge && !isLoading && !hasError) {
    return null;
  }

  const effectiveBadge = badge ?? (hasError ? { variant: "dot" as const } : null);
  if (!effectiveBadge) {
    return null;
  }

  if (effectiveBadge.variant === "dot" || collapsed) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-block size-2 rounded-full bg-indigo-400",
          isLoading && "animate-pulse",
          isStale && "bg-amber-400",
          hasError && "bg-zinc-400",
        )}
      />
    );
  }

  if (effectiveBadge.variant === "new") {
    return (
      <span
        className={cn(
          "ml-auto rounded-full border border-indigo-300/40 bg-indigo-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-indigo-100",
          isLoading && "animate-pulse",
          isStale && "border-amber-300/40 bg-amber-500/20 text-amber-100",
          hasError && "border-zinc-500/40 bg-zinc-500/20 text-zinc-200",
        )}
      >
        New
      </span>
    );
  }

  const safeCount = Math.max(0, effectiveBadge.count ?? 0);

  return (
    <span
      className={cn(
        "ml-auto inline-flex min-w-5 items-center justify-center rounded-full bg-indigo-500/25 px-1.5 py-0.5 text-[11px] font-semibold text-indigo-100",
        isLoading && "animate-pulse",
        isStale && "bg-amber-500/20 text-amber-100",
        hasError && "bg-zinc-500/20 text-zinc-200",
      )}
      aria-label={`${safeCount} pending items`}
    >
      {safeCount > 99 ? "99+" : safeCount}
    </span>
  );
}
