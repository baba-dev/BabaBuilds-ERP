"use client";

/**
 * components/rbac/access-denied.tsx
 *
 * Premium access denied block for workspace members navigating to
 * pages or sections they don't have permission to access.
 *
 * Shows the user's current role, what permission is required,
 * and a CTA to contact their workspace admin.
 */

import { ShieldAlert, Lock, ArrowRight } from "lucide-react";
import Link from "next/link";
import type { Permission } from "@/lib/permissions";
import { ROLE_LABELS, ROLE_BADGE_COLORS, type BusinessRole } from "@/lib/permissions";
import { cn } from "@/lib/utils";

interface AccessDeniedProps {
  /** The permission that was denied. */
  permission?: Permission;
  /** Human-readable description of what action was blocked. */
  action?: string;
  /** The user's current workspace role. */
  currentRole?: BusinessRole | string;
  /** Whether to show the "Contact Admin" CTA. Default: true */
  showCta?: boolean;
  /** Use compact layout for inline blocks (not full-page). */
  compact?: boolean;
}

export function AccessDenied({
  permission,
  action,
  currentRole,
  showCta = true,
  compact = false,
}: AccessDeniedProps) {
  const roleLabel =
    currentRole && ROLE_LABELS[currentRole as BusinessRole]
      ? ROLE_LABELS[currentRole as BusinessRole]
      : currentRole ?? "Unknown Role";

  const roleColors =
    currentRole && ROLE_BADGE_COLORS[currentRole as BusinessRole]
      ? ROLE_BADGE_COLORS[currentRole as BusinessRole]
      : ROLE_BADGE_COLORS["VIEWER"];

  const blockedAction = action ?? (permission ? `perform "${permission}"` : "access this");

  if (compact) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-950/20 px-3 py-2">
        <Lock className="w-4 h-4 text-amber-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Access restricted
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Your <span className="font-semibold">{roleLabel}</span> role cannot {blockedAction}.
          </p>
        </div>
        {showCta && (
          <Link
            href="/settings/team"
            className="text-xs text-amber-700 dark:text-amber-400 hover:underline whitespace-nowrap font-medium"
          >
            Manage access →
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8 text-center">
      <div className="relative mb-6">
        <div className="w-20 h-20 bg-gradient-to-br from-amber-100 to-amber-50 dark:from-amber-900/30 dark:to-amber-950/20 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-100/50 dark:shadow-amber-900/20">
          <ShieldAlert className="w-10 h-10 text-amber-500" />
        </div>
        <div className="absolute -bottom-1 -right-1 w-7 h-7 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center border-2 border-white dark:border-zinc-900">
          <Lock className="w-3.5 h-3.5 text-zinc-400" />
        </div>
      </div>

      <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
        Access Restricted
      </h2>
      <p className="text-zinc-500 dark:text-zinc-400 text-sm max-w-sm leading-relaxed mb-6">
        You don't have permission to {blockedAction}.
        {currentRole && (
          <>
            {" "}Your current workspace role is{" "}
            <span
              className={cn(
                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border mx-0.5",
                roleColors.bg, roleColors.text, roleColors.border,
              )}
            >
              {roleLabel}
            </span>.
          </>
        )}
      </p>

      {permission && (
        <div className="mb-6 px-3 py-2 bg-zinc-100 dark:bg-zinc-800/60 rounded-lg text-xs font-mono text-zinc-500 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700">
          Requires permission:{" "}
          <span className="font-semibold text-zinc-700 dark:text-zinc-300">{permission}</span>
        </div>
      )}

      {showCta && (
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/settings/team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            Manage Team Access
            <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            type="button"
            onClick={() => window.history.back()}
            className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
          >
            Go Back
          </button>
        </div>
      )}
    </div>
  );
}
