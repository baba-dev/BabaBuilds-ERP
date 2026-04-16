"use client";

/**
 * components/rbac/permission-gate.tsx
 *
 * Client component for permission-gated UI rendering.
 * Reads from the permissions context populated by the team members API.
 *
 * Usage:
 *   <PermissionGate permission="invoices.create" fallback={<AccessDeniedBadge />}>
 *     <CreateInvoiceButton />
 *   </PermissionGate>
 *
 * For server components, use requirePermission() or checkPermission() from lib/rbac.ts.
 */

import React from "react";
import type { Permission } from "@/lib/permissions";

interface PermissionGateProps {
  /** The module.action permission key to check. */
  permission: Permission;
  /** The user's granted permissions map (from team members API). */
  grantedPermissions: Partial<Record<Permission, boolean>>;
  /** Content to render when permission is denied. Defaults to null. */
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function PermissionGate({
  permission,
  grantedPermissions,
  fallback = null,
  children,
}: PermissionGateProps) {
  const isGranted = grantedPermissions[permission] === true;
  return isGranted ? <>{children}</> : <>{fallback}</>;
}

/** Inline badge shown when a UI element is hidden due to permissions. */
export function AccessDeniedBadge({ label = "No access" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700 select-none cursor-not-allowed">
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" />
      </svg>
      {label}
    </span>
  );
}
