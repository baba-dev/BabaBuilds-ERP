/**
 * app/api/team/role/route.ts
 *
 * Changes a workspace member's business role.
 *
 * PATCH { targetUserId: string, newRole: BusinessRole }
 *
 * Ownership rules enforced:
 *   1. Workspace must retain at least one OWNER
 *   2. You cannot change your own role (self-demotion locked)
 *   3. Only OWNER can assign/revoke OWNER, ADMIN, FINANCE_MANAGER, ACCOUNTANT roles
 *   4. ADMIN can only assign lower-privilege roles (SALES_MANAGER, OPERATIONS_MANAGER, INVENTORY_MANAGER, STAFF, VIEWER)
 *   5. High-privilege role assignments trigger elevated privilege alerts
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  isValidBusinessRole,
  canAssignRole,
  ROLE_LABELS,
  HIGH_RISK_BUSINESS_ROLES,
  type BusinessRole,
} from "@/lib/permissions";
import {
  withPermission,
  logRbacEvent,
  hasOtherActiveOwner,
  RbacDeniedError,
  rbacDeniedResponse,
} from "@/lib/rbac";
import { alertElevatedPrivilegeGrant } from "@/lib/security/access-risk";

export async function PATCH(req: Request) {
  let workspaceId = "";
  let actorId: string | null = null;
  let actorEmail: string | null = null;

  try {
    const session = await getServerSession(authOptions);
    if (!session?.workspaceId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    workspaceId = session.workspaceId;
    actorId = session.user.id ?? null;
    actorEmail = session.user.email ?? null;

    // ── 1. RBAC enforcement — requires workspace.manage_roles ─────────────
    const permCheck = await withPermission(actorId!, workspaceId, "workspace.manage_roles");
    if (!permCheck.granted) return permCheck.response;
    const actorRole = permCheck.role;

    // ── 2. Parse and validate request ─────────────────────────────────────
    const body = await req.json();
    const { targetUserId, newRole } = body;

    if (!targetUserId || !newRole) {
      return NextResponse.json({ error: "targetUserId and newRole are required." }, { status: 400 });
    }

    if (!isValidBusinessRole(newRole)) {
      return NextResponse.json({ error: `Invalid role: '${newRole}'.` }, { status: 400 });
    }

    const targetRole = newRole as BusinessRole;

    // ── 3. Self-demotion block ─────────────────────────────────────────────
    if (targetUserId === actorId) {
      await logRbacEvent({
        workspaceId,
        eventType: "owner_safeguard_blocked",
        actorUserId: actorId,
        actorEmail,
        targetUserId,
        newRole: targetRole,
        metadata: { reason: "self_role_change_blocked" },
      });
      return NextResponse.json(
        {
          error: "You cannot change your own role. Ask another Owner to update your role.",
          code: "SELF_ROLE_CHANGE_BLOCKED",
        },
        { status: 400 },
      );
    }

    // ── 4. Check if target member exists ──────────────────────────────────
    const targetMembership = await prisma.workspaceUser.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
      include: { user: { select: { email: true, name: true } } },
    });

    if (!targetMembership || !targetMembership.isActive) {
      return NextResponse.json(
        { error: "Member not found or is not currently active in this workspace." },
        { status: 404 },
      );
    }

    const currentRole = (targetMembership.businessRole ?? targetMembership.role) as BusinessRole;

    // No-op check (already has this role)
    if (currentRole === targetRole) {
      return NextResponse.json({ success: true, message: "Member already has this role." });
    }

    // ── 5. Role assignment authorization ──────────────────────────────────
    if (!canAssignRole(actorRole, targetRole)) {
      await logRbacEvent({
        workspaceId,
        eventType: "rbac_access_denied",
        actorUserId: actorId,
        actorEmail,
        targetUserId,
        targetEmail: targetMembership.user.email ?? undefined,
        previousRole: currentRole,
        newRole: targetRole,
        metadata: { reason: "insufficient_role_to_assign", actorRole },
      });
      return NextResponse.json(
        {
          error: `Your role (${ROLE_LABELS[actorRole]}) cannot assign the '${ROLE_LABELS[targetRole]}' role. Only workspace Owners can grant this role.`,
          code: "ROLE_ASSIGNMENT_FORBIDDEN",
        },
        { status: 403 },
      );
    }

    // Also check — if removing an OWNER role, is there another owner?
    if (currentRole === "OWNER" && targetRole !== "OWNER") {
      const hasOtherOwner = await hasOtherActiveOwner(workspaceId, targetUserId);
      if (!hasOtherOwner) {
        await logRbacEvent({
          workspaceId,
          eventType: "owner_safeguard_blocked",
          actorUserId: actorId,
          actorEmail,
          targetUserId,
          targetEmail: targetMembership.user.email ?? undefined,
          previousRole: currentRole,
          newRole: targetRole,
          metadata: { reason: "last_owner_demotion_blocked" },
        });
        return NextResponse.json(
          {
            error: "This workspace must have at least one active Owner. Designate another Owner before demoting this member.",
            code: "LAST_OWNER_SAFEGUARD",
          },
          { status: 400 },
        );
      }
    }

    // ── 6. Apply the role change ───────────────────────────────────────────
    await prisma.workspaceUser.update({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
      data: {
        businessRole: targetRole,
        role: targetRole,  // keep legacy field in sync
      },
    });

    // ── 7. Audit log ───────────────────────────────────────────────────────
    await logRbacEvent({
      workspaceId,
      eventType: "role_changed",
      actorUserId: actorId,
      actorEmail,
      targetUserId,
      targetEmail: targetMembership.user.email ?? undefined,
      previousRole: currentRole,
      newRole: targetRole,
      metadata: {
        memberName: targetMembership.user.name,
        previousRoleLabel: ROLE_LABELS[currentRole] ?? currentRole,
        newRoleLabel: ROLE_LABELS[targetRole],
      },
    });

    // Alert on high-privilege escalation
    if (HIGH_RISK_BUSINESS_ROLES.has(targetRole)) {
      await alertElevatedPrivilegeGrant({
        workspaceId,
        actorId,
        actorEmail,
        targetEmail: targetMembership.user.email ?? "",
        targetRole,
      });
    }

    return NextResponse.json({
      success: true,
      previousRole: currentRole,
      newRole: targetRole,
    });
  } catch (err: unknown) {
    console.error("[team/role] Error:", err);
    if (err instanceof RbacDeniedError) return rbacDeniedResponse(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
