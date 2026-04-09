import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import { sendEmail } from "@/lib/mailer";
import { canInviteMembers, getMaxUsersForPlan, Role } from "@/lib/permissions";
import { logActivity } from "@/lib/activity-log";

export async function POST(req: Request) {
  let workspaceId = "";
  let actorId: string | null = null;
  let actorEmail: string | null = null;
  let actorRole: string | null = null;

  try {
    const session: any = await getServerSession(authOptions);
    if (!session || !session.workspaceId || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    workspaceId = session.workspaceId;
    actorId = session.user.id ?? null;
    actorEmail = session.user.email ?? null;
    const body = await req.json();
    const { email, role } = body;

    if (!email || !role) {
      return NextResponse.json({ error: "Email and role are required." }, { status: 400 });
    }

    // 1. Check if user has permission to invite
    const currentUserReq = await prisma.workspaceUser.findUnique({
      where: { userId_workspaceId: { userId: session.user.id, workspaceId } }
    });
    actorRole = currentUserReq?.role ?? null;

    if (!currentUserReq || !canInviteMembers(currentUserReq.role)) {
      logActivity({
        action: "team_member_invite",
        outcome: "error",
        entityType: "workspace_member",
        workspaceId,
        actorId,
        actorEmail,
        metadata: {
          actorRole,
          targetEmail: typeof email === "string" ? email : null,
          reason: "forbidden",
        },
      });
      return NextResponse.json({ error: "You do not have permission to invite members." }, { status: 403 });
    }

    // 2. Check Plan limits
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      include: {
        users: true,
        workspaceInvites: true,
        businessProfile: true,
      }
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    const currentMemberCount = workspace.users.length + workspace.workspaceInvites.length;
    const maxUsers = getMaxUsersForPlan(workspace.planTier);

    if (currentMemberCount >= maxUsers) {
      return NextResponse.json({ 
        error: `Your current plan (${workspace.planTier}) allows up to ${maxUsers} user(s). You have reached the limit.` 
      }, { status: 400 });
    }

    // 3. Create Invite
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiration

    const invite = await prisma.workspaceInvite.create({
      data: {
        workspaceId,
        email,
        role: role as Role,
        token,
        expiresAt,
      }
    });

    // 4. Send Email
    const profile = workspace.businessProfile;
    if (profile) {
      const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/invite/${token}`;
      try {
         await sendEmail({
           profile,
           to: email,
           subject: `You have been invited to join ${workspace.name} on BabaERP`,
           html: `
             <h2>You're invited!</h2>
             <p>${session.user.name} has invited you to join the workspace <strong>${workspace.name}</strong> as a ${role}.</p>
             <p>Click the link below to accept the invitation:</p>
             <a href="${inviteUrl}">${inviteUrl}</a>
             <p>This link will expire in 7 days.</p>
           `
         });
      } catch (err: any) {
         console.error("Failed to send email", err);
         logActivity({
           action: "team_member_invite",
           outcome: "error",
           entityType: "workspace_member",
           workspaceId,
           actorId,
           actorEmail,
           metadata: {
             actorRole,
             targetEmail: email,
             inviteId: invite.id,
             reason: "email_delivery_failed",
           },
         });
         // Optionally, you could delete the invite here, or just inform the frontend it was created but email failed.
         return NextResponse.json({ error: "Invite created, but failed to send email: " + err.message }, { status: 500 });
      }
    }

    logActivity({
      action: "team_member_invite",
      outcome: "success",
      entityType: "workspace_member",
      entityId: invite.id,
      workspaceId,
      actorId,
      actorEmail,
      metadata: {
        actorRole,
        targetEmail: email,
        targetRole: role,
      },
    });

    return NextResponse.json({ success: true, invite });
  } catch (error: any) {
    console.error("Invite Error:", error);
    logActivity({
      action: "team_member_invite",
      outcome: "error",
      entityType: "workspace_member",
      workspaceId: workspaceId || null,
      actorId,
      actorEmail,
      metadata: {
        actorRole,
        reason: "unhandled_exception",
      },
    });
    if (error.code === 'P2002') {
      return NextResponse.json({ error: "An invite for this email already exists." }, { status: 400 });
    }
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
