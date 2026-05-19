/**
 * app/api/team/invite/route.ts
 *
 * Sends a workspace invite with a specific business role.
 * Uses the new RBAC enforcement layer (requirePermission / checkSeatAvailability).
 */

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendEmail } from "@/lib/mailer";
import { layout } from "@/lib/notifications/email-templates";
import {
  isValidBusinessRole,
  ROLE_LABELS,
  HIGH_RISK_BUSINESS_ROLES,
  canAssignRole,
  OWNER_ONLY_ASSIGNABLE_ROLES,
  type BusinessRole,
} from "@/lib/permissions";
import {
  withPermission,
  checkSeatAvailability,
  logRbacEvent,
  RbacDeniedError,
  rbacDeniedResponse,
} from "@/lib/rbac";
import { alertElevatedPrivilegeGrant } from "@/lib/security/access-risk";

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

    // ── 2. Validate request body ──────────────────────────────────────────
    const body = await req.json();
    const { email, businessRole } = body;

    if (!email || !businessRole) {
      return NextResponse.json(
        { error: "Email and businessRole are required." },
        { status: 400 },
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (!isValidBusinessRole(businessRole)) {
      return NextResponse.json(
        { error: `Invalid role. Accepted values: ${["OWNER","ADMIN","FINANCE_MANAGER","ACCOUNTANT","SALES_MANAGER","OPERATIONS_MANAGER","INVENTORY_MANAGER","STAFF","VIEWER"].join(", ")}` },
        { status: 400 },
      );
    }

    const targetRole = businessRole as BusinessRole;

    // ── 3. Role assignment authorization ─────────────────────────────────
    // Only OWNER can assign OWNER/ADMIN/FINANCE_MANAGER/ACCOUNTANT roles.
    if (!canAssignRole(actorRole, targetRole)) {
      await logRbacEvent({
        workspaceId,
        eventType: "rbac_access_denied",
        actorUserId: actorId,
        actorEmail,
        targetEmail: normalizedEmail,
        newRole: targetRole,
        metadata: {
          reason: "insufficient_role_to_assign",
          actorRole,
          requiresOwnerOnly: OWNER_ONLY_ASSIGNABLE_ROLES.has(targetRole),
        },
      });
      return NextResponse.json(
        {
          error: `Your role (${ROLE_LABELS[actorRole]}) cannot assign the '${ROLE_LABELS[targetRole]}' role. Only workspace Owners can grant this role.`,
          code: "ROLE_ASSIGNMENT_FORBIDDEN",
        },
        { status: 403 },
      );
    }

    // ── 4. Seat availability check (includes pending invites) ─────────────
    const seats = await checkSeatAvailability(workspaceId);
    if (!seats.canInvite) {
      await logRbacEvent({
        workspaceId,
        eventType: "seat_limit_hit",
        actorUserId: actorId,
        actorEmail,
        targetEmail: normalizedEmail,
        metadata: {
          used: seats.used,
          limit: seats.limitDisplay,
          planTier: seats.planTier,
        },
      });
      return NextResponse.json(
        {
          error: `Seat limit reached. Your ${seats.planTier} plan allows ${seats.limitDisplay} seat(s). You are using ${seats.used} (${seats.activeMembers} active member(s) + ${seats.pendingInvites} pending invite(s)). Remove or deactivate a member to free a seat, or upgrade your plan.`,
          code: "SEAT_LIMIT_EXCEEDED",
          seats,
        },
        { status: 400 },
      );
    }

    // ── 5. Check warn threshold (still allow, but return warning) ─────────
    const atWarning = seats.atWarningThreshold;

    // ── 6. Create invite ───────────────────────────────────────────────────
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { name: true, businessProfile: { select: { companyName: true } } },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email: normalizedEmail,
        role: targetRole,        // legacy compat
        businessRole: targetRole,
        token,
        expiresAt,
      },
    });

    // ── 7. Send invite email ───────────────────────────────────────────────
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://erp.bababuilds.com";
    const inviteUrl = `${appUrl}/invite/${token}`;
    const workspaceName = workspace.businessProfile?.companyName || workspace.name;
    const roleName = ROLE_LABELS[targetRole];

    try {
      await sendEmail({
        route: "system",
        to: normalizedEmail,
        subject: `You've been invited to join ${workspaceName} on BabaBuilds ERP`,
        html: layout({
          appUrl,
          companyName: workspaceName,
          emoji: "👋",
          headline: "You're Invited!",
          subheadline: `Join ${workspaceName} as ${roleName}`,
          body: `<p><strong>${session.user.name || actorEmail}</strong> has invited you to collaborate in <strong>${workspaceName}</strong> on BabaBuilds ERP as <strong>${roleName}</strong>.</p>
                 <p>Click below to accept and set up your access. This invitation expires in 7 days.</p>`,
          ctaLabel: "Accept Invitation",
          ctaUrl: inviteUrl,
        }),
      });
    } catch (emailErr: any) {
      console.error("[team/invite] Email delivery failed:", emailErr);
      // Invite was created — log the email failure but don't delete the invite
      // The admin can resend or user can use the token directly
      await logRbacEvent({
        workspaceId,
        eventType: "invite_sent",
        actorUserId: actorId,
        actorEmail,
        targetEmail: normalizedEmail,
        newRole: targetRole,
        metadata: { inviteId: invite.id, emailFailed: true, emailError: emailErr?.message },
      });
      return NextResponse.json(
        {
          error: "Invite created, but the invitation email could not be sent. The invite is still active.",
          invite,
          seatWarning: atWarning ? `You are approaching your seat limit (${seats.used}/${seats.limitDisplay}).` : null,
        },
        { status: 202 },
      );
    }

    // ── 8. Audit log ───────────────────────────────────────────────────────
    await logRbacEvent({
      workspaceId,
      eventType: "invite_sent",
      actorUserId: actorId,
      actorEmail,
      targetEmail: normalizedEmail,
      newRole: targetRole,
      metadata: { inviteId: invite.id, roleName },
    });

    // Alert on high-privilege grants
    if (HIGH_RISK_BUSINESS_ROLES.has(targetRole)) {
      await alertElevatedPrivilegeGrant({
        workspaceId,
        actorId,
        actorEmail,
        targetEmail: normalizedEmail,
        targetRole,
      });
    }

    return NextResponse.json({
      success: true,
      invite,
      seatWarning: atWarning
        ? `You are approaching your seat limit (${seats.used}/${seats.limitDisplay}). Consider upgrading your plan.`
        : null,
    });
  } catch (err: any) {
    console.error("[team/invite] Error:", err);
    if (err instanceof RbacDeniedError) return rbacDeniedResponse(err);
    if (err?.code === "P2002") {
      return NextResponse.json(
        { error: "An active invite for this email already exists." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
