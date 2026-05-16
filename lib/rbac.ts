/**
 * lib/rbac.ts
 *
 * Server-only RBAC enforcement helper for BabaBuilds ERP.
 *
 * This module is the authoritative gate for all permission checks on the server.
 * It performs FRESH DB LOOKUPS — it never trusts the JWT session role for
 * permission decisions. The JWT role is used only for lightweight client-side UI
 * hints; all security-critical decisions go through this module.
 *
 * Audit trail strategy:
 *   Every RBAC event writes to BOTH:
 *   1. RbacAuditLog — structured table with eventType, previousRole, newRole, etc.
 *      (powers the "Access Activity" UI tab)
 *   2. AppActivityLog — general audit trail (unified audit log for compliance)
 *   Single write path: logRbacEvent() handles both atomically.
 */

import 'server-only';

import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import {
  BusinessRole,
  Permission,
  DEFAULT_ROLE_PERMISSIONS,
  getSeatLimit,
  formatSeatLimit,
  legacyRoleToBusinessRole,
  isValidBusinessRole,
} from '@/lib/permissions';
import { NextResponse } from 'next/server';
import { resolveSeatLimitKey } from '@/lib/entitlements';

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type RbacEventType =
  | 'invite_sent'
  | 'invite_accepted'
  | 'invite_cancelled'
  | 'role_changed'
  | 'member_removed'
  | 'member_deactivated'
  | 'member_reactivated'
  | 'seat_limit_hit'
  | 'rbac_access_denied'
  | 'owner_safeguard_blocked';

export type RbacAuditEvent = {
  workspaceId: string;
  eventType: RbacEventType;
  actorUserId?: string | null;
  actorEmail?: string | null;
  targetUserId?: string | null;
  targetEmail?: string | null;
  previousRole?: string | null;
  newRole?: string | null;
  permission?: string | null;   // for rbac_access_denied
  metadata?: Record<string, unknown>;
};

export type SeatAvailability = {
  activeMembers: number;
  pendingInvites: number;
  used: number;
  limit: number;
  limitDisplay: string;       // Seat limit label for UI
  available: number;
  availableDisplay: string;   // Available seats label for UI
  canInvite: boolean;
  planTier: string;
  atWarningThreshold: boolean; // true when used >= 80% of limit
  atLimit: boolean;
};

export type MembershipWithRole = {
  role: string;
  businessRole: string | null;
};

/** Resolved RBAC denial error — thrown by requirePermission() */
export class RbacDeniedError extends Error {
  public readonly permission: Permission;
  public readonly resolvedRole: BusinessRole;

  constructor(permission: Permission, resolvedRole: BusinessRole) {
    super(`Permission denied: '${permission}' required. Your role is '${resolvedRole}'.`);
    this.name = 'RbacDeniedError';
    this.permission = permission;
    this.resolvedRole = resolvedRole;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// CORE PERMISSION RESOLUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Resolves the effective BusinessRole for a user in a workspace.
 * Prefers `businessRole` (the granular ERP role) over `role` (legacy).
 * Falls back to system-safe VIEWER if membership is missing.
 */
async function resolveBusinessRole(userId: string, workspaceId: string): Promise<BusinessRole | null> {
  const membership = await prisma.workspaceUser.findUnique({
    where: { userId_workspaceId: { userId, workspaceId } },
    select: { role: true, businessRole: true, isActive: true },
  });

  if (!membership || !membership.isActive) return null;

  const raw = membership.businessRole ?? membership.role;
  if (isValidBusinessRole(raw)) return raw;
  return legacyRoleToBusinessRole(membership.role);
}

/**
 * Authoritative server-side permission check.
 *
 * Performs a fresh DB lookup to get the user's current role — never trusts the JWT.
 * Throws RbacDeniedError if the permission is not granted.
 * Also logs a rbac_access_denied event to both audit logs on denial.
 *
 * Usage in Route Handlers:
 *   const { role } = await requirePermission(userId, workspaceId, 'invoices.create');
 *
 * Usage in Server Components:
 *   try {
 *     await requirePermission(userId, workspaceId, 'invoices.view');
 *   } catch {
 *     redirect('/access-denied');
 *   }
 */
export async function requirePermission(
  userId: string,
  workspaceId: string,
  permission: Permission,
): Promise<{ granted: true; role: BusinessRole }> {
  const role = await resolveBusinessRole(userId, workspaceId);

  if (!role) {
    // User is not a member or is deactivated
    await logRbacEvent({
      workspaceId,
      eventType: 'rbac_access_denied',
      actorUserId: userId,
      permission,
      metadata: { reason: 'not_a_member_or_deactivated' },
    });
    throw new RbacDeniedError(permission, 'VIEWER');
  }

  const granted = (DEFAULT_ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);

  if (!granted) {
    await logRbacEvent({
      workspaceId,
      eventType: 'rbac_access_denied',
      actorUserId: userId,
      permission,
      previousRole: role,
      metadata: { reason: 'insufficient_permission' },
    });
    throw new RbacDeniedError(permission, role);
  }

  return { granted: true, role };
}

/**
 * Returns all granted permissions for a user in a workspace.
 * Useful for Server Components that need to render conditional UI.
 * Each key maps to true (granted) or false (denied).
 */
export async function getGrantedPermissions(
  userId: string,
  workspaceId: string,
): Promise<Record<Permission, boolean>> {
  const role = await resolveBusinessRole(userId, workspaceId);
  const grantedSet = role ? new Set<string>(DEFAULT_ROLE_PERMISSIONS[role]) : new Set<string>();

  // Iterate every known permission key and map to granted/denied
  const { PERMISSION_KEYS } = await import('@/lib/permissions');
  return Object.fromEntries(
    (PERMISSION_KEYS as readonly string[]).map((key) => [key, grantedSet.has(key)]),
  ) as Record<Permission, boolean>;
}

/**
 * Silent permission check for read-only gating.
 *
 * Resolves the current role from the database and returns a boolean grant result.
 * This function does NOT emit RBAC denial audit records.
 *
 * Use this for non-enforcement scenarios only, such as:
 *   - conditional rendering in Server Components
 *   - capability booleans in "what can I do?" payloads
 *   - non-security-critical data shaping
 *
 * IMPORTANT:
 *   Enforcement and security-critical paths MUST continue to use
 *   requirePermission() (or withPermission()) so denied access is blocked and
 *   denial events are audited.
 */
export async function checkPermissionSilent(
  userId: string,
  workspaceId: string,
  permission: Permission,
): Promise<boolean> {
  const grants = await checkPermissionsSilent(userId, workspaceId, [permission]);
  return grants[permission];
}

/**
 * Silent multi-permission check for read-only gating.
 *
 * Uses a single role resolution and evaluates all requested permissions in-memory.
 * This function does NOT emit RBAC denial audit records.
 */
export async function checkPermissionsSilent<const TPermission extends Permission>(
  userId: string,
  workspaceId: string,
  permissions: readonly TPermission[],
): Promise<Record<TPermission, boolean>> {
  const role = await resolveBusinessRole(userId, workspaceId);
  const grantedSet = role ? new Set<string>(DEFAULT_ROLE_PERMISSIONS[role]) : new Set<string>();
  return Object.fromEntries(
    permissions.map((permission) => [permission, grantedSet.has(permission)]),
  ) as Record<TPermission, boolean>;
}

/**
 * Legacy convenience helper.
 *
 * Unlike checkPermissionSilent(), this variant routes through
 * requirePermission(), so denied checks are written to RBAC audit logs.
 *
 * Prefer checkPermissionSilent() for read-only gating. Keep this helper only
 * where denial audit writes are intentionally desired.
 */
export async function checkPermission(
  userId: string,
  workspaceId: string,
  permission: Permission,
): Promise<boolean> {
  try {
    await requirePermission(userId, workspaceId, permission);
    return true;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SEAT MANAGEMENT
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the current seat availability for a workspace.
 *
 * Seat counting rules (see SEAT_SEMANTICS in lib/permissions.ts):
 *   - Active members count toward seats (regardless of role, including OWNER)
 *   - Pending invites (non-expired) count toward seats  
 *   - Deactivated members (isActive=false) do NOT count
 */
export async function checkSeatAvailability(workspaceId: string): Promise<SeatAvailability> {
  const [workspace, activeMembers, pendingInvites] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        planTier: true,
        seatAddonCount: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        signupIntentJson: true,
      },
    }),
    prisma.workspaceUser.count({
      where: { workspaceId, isActive: true },
    }),
    prisma.workspaceInvite.count({
      where: { workspaceId, expiresAt: { gt: new Date() } },
    }),
  ]);

  if (!workspace) throw new Error('Workspace not found');

  const seatLimitKey = resolveSeatLimitKey(workspace);
  const planTier = seatLimitKey;
  const baseLimit = getSeatLimit(seatLimitKey);
  const addonSeats = workspace.seatAddonCount ?? 0;
  const limit = baseLimit === Infinity ? Infinity : baseLimit + addonSeats;
  const used = activeMembers + pendingInvites;
  const available = limit === Infinity ? Infinity : Math.max(0, limit - used);
  const canInvite = limit === Infinity || available > 0;

  return {
    activeMembers,
    pendingInvites,
    used,
    limit,
    limitDisplay: formatSeatLimit(planTier) === 'Unlimited' ? 'Unlimited' : String(limit),
    available,
    availableDisplay: available === Infinity ? 'Unlimited' : String(available),
    canInvite,
    planTier,
    atWarningThreshold: limit !== Infinity && used >= Math.floor(limit * 0.8),
    atLimit: limit !== Infinity && used >= limit,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OWNERSHIP SAFETY GUARDS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the workspace has at least one other active OWNER besides
 * the given userId. Used to prevent removing/demoting the last owner.
 */
export async function hasOtherActiveOwner(workspaceId: string, excludeUserId: string): Promise<boolean> {
  const otherOwnerCount = await prisma.workspaceUser.count({
    where: {
      workspaceId,
      userId: { not: excludeUserId },
      isActive: true,
      businessRole: 'OWNER',
    },
  });
  return otherOwnerCount > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// RBAC AUDIT LOGGING
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Single write path for all RBAC audit events.
 *
 * Writes to BOTH:
 *   1. RbacAuditLog (structured RBAC event table → powers Access Activity UI)
 *   2. AppActivityLog (general audit trail → unified compliance log)
 *
 * Never throws — audit failures are logged to console but do not block the operation.
 */
export async function logRbacEvent(event: RbacAuditEvent): Promise<void> {
  const action = `rbac_${event.eventType}`;

  try {
    // 1. Write to RbacAuditLog (structured RBAC-specific table)
    await prisma.rbacAuditLog.create({
      data: {
        workspaceId: event.workspaceId,
        eventType: event.eventType,
        actorUserId: event.actorUserId ?? null,
        actorEmail: event.actorEmail ?? null,
        targetUserId: event.targetUserId ?? null,
        targetEmail: event.targetEmail ?? null,
        previousRole: event.previousRole ?? null,
        newRole: event.newRole ?? null,
        metadata: event.metadata ? (event.metadata as any) : undefined,
      },
    });

    // 2. Also write to AppActivityLog (general audit trail)
    await logActivity({
      action,
      status: event.eventType === 'rbac_access_denied' ? 'FAILURE' : 'SUCCESS',
      workspaceId: event.workspaceId,
      actor: {
        userId: event.actorUserId,
        email: event.actorEmail,
      },
      entity: event.targetUserId
        ? { type: 'workspace_member', id: event.targetUserId }
        : { type: 'rbac_event' },
      metadata: {
        eventType: event.eventType,
        previousRole: event.previousRole,
        newRole: event.newRole,
        permission: event.permission,
        targetEmail: event.targetEmail,
        ...event.metadata,
      },
    });
  } catch (err) {
    // Audit failures must never block the operation
    console.error('[RBAC] Audit logging failed (non-blocking):', err);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP RESPONSE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Converts an RbacDeniedError into a structured 403 NextResponse.
 * Use in Route Handlers that wrap requirePermission() in a try/catch:
 *
 *   } catch (err) {
 *     if (err instanceof RbacDeniedError) return rbacDeniedResponse(err);
 *     throw err;
 *   }
 */
export function rbacDeniedResponse(err: RbacDeniedError): NextResponse {
  return NextResponse.json(
    {
      error: 'Access denied. You do not have the required permission for this action.',
      code: 'RBAC_PERMISSION_DENIED',
      permission: err.permission,
      role: err.resolvedRole,
    },
    { status: 403 },
  );
}

/**
 * Wraps requirePermission() with automatic 403 response generation.
 * Returns null if denied (caller should then return the 403 response).
 * Returns the granted role if permitted.
 *
 * Usage:
 *   const check = await withPermission(userId, workspaceId, 'invoices.create', req);
 *   if (!check.granted) return check.response;
 *   const { role } = check;
 */
export async function withPermission(
  userId: string,
  workspaceId: string,
  permission: Permission,
): Promise<
  | { granted: true; role: BusinessRole; response?: never }
  | { granted: false; role?: never; response: NextResponse }
> {
  try {
    const result = await requirePermission(userId, workspaceId, permission);
    return result;
  } catch (err) {
    if (err instanceof RbacDeniedError) {
      return { granted: false, response: rbacDeniedResponse(err) };
    }
    throw err;
  }
}
