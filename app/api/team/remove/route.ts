/**
 * app/api/team/remove/route.ts
 *
 * Removes or deactivates a workspace member / cancels an invite.
 * Uses the new RBAC enforcement layer.
 *
 * Actions:
 *   - { targetUserId, action: "remove" }    → hard-delete the WorkspaceUser record
 *   - { targetUserId, action: "deactivate" } → set isActive=false (preserves audit)
 *   - { inviteId }                           → cancel the pending invite
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withPermission, logRbacEvent, hasOtherActiveOwner, RbacDeniedError, rbacDeniedResponse } from "@/lib/rbac";
import { ROLE_LABELS, isValidBusinessRole } from "@/lib/permissions";

export async function POST(req: Request) {
  let workspaceId = "";
  let actorId: string | null = null;
  let actorEmail: string | null = null;

  try {
    const session: any = await getServerSession(authOptions);
    if (!session?.workspaceId || !session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    workspaceId = session.workspaceId;
    actorId = session.user.id ?? null;
    actorEmail = session.user.email ?? null;

    // ── 1. RBAC enforcement (fresh DB lookup) ─────────────────────────────
    const permCheck = await withPermission(actorId!, workspaceId, "workspace.manage_members");
    if (!permCheck.granted) return permCheck.response;
    const actorRole = permCheck.role;

    const body = await req.json();
    const { targetUserId, inviteId, action = "remove" } = body;

    // ── 2. Cancel invite ──────────────────────────────────────────────────
    if (inviteId) {
      const invite = await prisma.workspaceInvite.findFirst({
        where: { id: inviteId, workspaceId },
        select: { id: true, email: true, businessRole: true },
      });

      if (!invite) {
        return NextResponse.json({ error: "Invite not found" }, { status: 404 });
      }

      await prisma.workspaceInvite.delete({ where: { id: inviteId } });

      await logRbacEvent({
        workspaceId,
        eventType: "invite_cancelled",
        actorUserId: actorId,
        actorEmail,
        targetEmail: invite.email,
        previousRole: invite.businessRole ?? undefined,
        metadata: { inviteId },
      });

      return NextResponse.json({ success: true, action: "invite_cancelled" });
    }

    // ── 3. Remove or deactivate a member ─────────────────────────────────
    if (!targetUserId) {
      return NextResponse.json({ error: "targetUserId or inviteId is required." }, { status: 400 });
    }

    // Self-action protection
    if (targetUserId === actorId) {
      return NextResponse.json(
        { error: "You cannot remove or deactivate yourself. Contact another Owner to make changes to your own account." },
        { status: 400 },
      );
    }

    const targetMembership = await prisma.workspaceUser.findUnique({
      where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
      include: { user: { select: { email: true, name: true } } },
    });

    if (!targetMembership) {
      return NextResponse.json({ error: "Member not found in this workspace." }, { status: 404 });
    }

    const targetRole = targetMembership.businessRole ?? targetMembership.role;

    // Only OWNER can target another OWNER, ADMIN, or FINANCE_MANAGER
    if (
      ["OWNER", "ADMIN", "FINANCE_MANAGER", "ACCOUNTANT"].includes(targetRole) &&
      actorRole !== "OWNER"
    ) {
      await logRbacEvent({
        workspaceId,
        eventType: "rbac_access_denied",
        actorUserId: actorId,
        actorEmail,
        targetUserId,
        targetEmail: targetMembership.user.email ?? undefined,
        metadata: {
          reason: "only_owner_can_remove_elevated_roles",
          actorRole,
          targetRole,
        },
      });
      return NextResponse.json(
        {
          error: `Only a workspace Owner can remove or deactivate a ${isValidBusinessRole(targetRole) ? ROLE_LABELS[targetRole] : targetRole}.`,
          code: "INSUFFICIENT_ROLE_FOR_TARGET",
        },
        { status: 403 },
      );
    }

    // Owner safeguard — you cannot remove/deactivate the last owner
    if (targetRole === "OWNER") {
      const hasOtherOwner = await hasOtherActiveOwner(workspaceId, targetUserId);
      if (!hasOtherOwner) {
        await logRbacEvent({
          workspaceId,
          eventType: "owner_safeguard_blocked",
          actorUserId: actorId,
          actorEmail,
          targetUserId,
          targetEmail: targetMembership.user.email ?? undefined,
          metadata: { reason: "last_owner_safeguard", requestedAction: action },
        });
        return NextResponse.json(
          {
            error: "This workspace must have at least one active Owner. Designate another Owner before removing this member.",
            code: "LAST_OWNER_SAFEGUARD",
          },
          { status: 400 },
        );
      }
    }

    if (action === "deactivate") {
      // Soft deactivation — record preserved, seat freed, access blocked
      await prisma.workspaceUser.update({
        where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
        data: { isActive: false },
      });

      await logRbacEvent({
        workspaceId,
        eventType: "member_deactivated",
        actorUserId: actorId,
        actorEmail,
        targetUserId,
        targetEmail: targetMembership.user.email ?? undefined,
        previousRole: targetRole,
        metadata: { action: "deactivate", memberName: targetMembership.user.name },
      });

      return NextResponse.json({ success: true, action: "deactivated" });
    } else {
      // Hard remove — completely removes the WorkspaceUser record
      await prisma.workspaceUser.delete({
        where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
      });

      await logRbacEvent({
        workspaceId,
        eventType: "member_removed",
        actorUserId: actorId,
        actorEmail,
        targetUserId,
        targetEmail: targetMembership.user.email ?? undefined,
        previousRole: targetRole,
        metadata: { action: "remove", memberName: targetMembership.user.name },
      });

      return NextResponse.json({ success: true, action: "removed" });
    }
  } catch (err: any) {
    console.error("[team/remove] Error:", err);
    if (err instanceof RbacDeniedError) return rbacDeniedResponse(err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
