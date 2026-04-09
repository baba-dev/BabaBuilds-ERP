import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";
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
    const { targetUserId, inviteId } = body;

    // Must be an owner or admin to remove members
    const currentUserReq = await prisma.workspaceUser.findUnique({
      where: { userId_workspaceId: { userId: session.user.id, workspaceId } }
    });
    actorRole = currentUserReq?.role ?? null;

    if (!currentUserReq || !hasPermission(currentUserReq.role, "MANAGE_WORKSPACE_SETTINGS")) {
      logActivity({
        action: "team_member_remove",
        outcome: "error",
        entityType: "workspace_member",
        workspaceId,
        actorId,
        actorEmail,
        metadata: {
          actorRole,
          targetUserId: targetUserId ?? null,
          inviteId: inviteId ?? null,
          reason: "forbidden",
        },
      });
      return NextResponse.json({ error: "No permission to remove members" }, { status: 403 });
    }

    if (inviteId) {
      const invite = await prisma.workspaceInvite.findFirst({
        where: { id: inviteId, workspaceId },
        select: { id: true }
      });

      if (!invite) {
        return NextResponse.json({ error: "Invite not found" }, { status: 404 });
      }

      await prisma.workspaceInvite.deleteMany({
        where: { id: inviteId, workspaceId }
      });
      logActivity({
        action: "team_member_remove",
        outcome: "success",
        entityType: "workspace_member",
        entityId: invite.id,
        workspaceId,
        actorId,
        actorEmail,
        metadata: {
          actorRole,
          targetType: "invite",
          inviteId: invite.id,
        },
      });
      return NextResponse.json({ success: true });
    }

    if (targetUserId) {
      // Cannot remove yourself here
      if (targetUserId === session.user.id) {
         return NextResponse.json({ error: "Cannot remove yourself. Use leave workspace instead." }, { status: 400 });
      }
      
      const targetUser = await prisma.workspaceUser.findUnique({
         where: { userId_workspaceId: { userId: targetUserId, workspaceId } },
         include: { user: { select: { email: true } } }
      });
      if (targetUser?.role === "OWNER" && currentUserReq.role !== "OWNER") {
         return NextResponse.json({ error: "Only owners can remove other owners" }, { status: 403 });
      }

      await prisma.workspaceUser.delete({
        where: { userId_workspaceId: { userId: targetUserId, workspaceId } }
      });
      logActivity({
        action: "team_member_remove",
        outcome: "success",
        entityType: "workspace_member",
        entityId: targetUserId,
        workspaceId,
        actorId,
        actorEmail,
        metadata: {
          actorRole,
          targetType: "workspace_user",
          targetUserId,
          targetEmail: targetUser?.user?.email ?? null,
        },
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });

  } catch (error: any) {
    console.error("Remove Member Error:", error);
    logActivity({
      action: "team_member_remove",
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
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
