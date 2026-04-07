import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/permissions";

export async function POST(req: Request) {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session || !session.workspaceId || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = session.workspaceId;
    const body = await req.json();
    const { targetUserId, inviteId } = body;

    // Must be an owner or admin to remove members
    const currentUserReq = await prisma.workspaceUser.findUnique({
      where: { userId_workspaceId: { userId: session.user.id, workspaceId } }
    });

    if (!currentUserReq || !hasPermission(currentUserReq.role, "MANAGE_WORKSPACE_SETTINGS")) {
      return NextResponse.json({ error: "No permission to remove members" }, { status: 403 });
    }

    if (inviteId) {
      await prisma.workspaceInvite.delete({
        where: { id: inviteId, workspaceId }
      });
      return NextResponse.json({ success: true });
    }

    if (targetUserId) {
      // Cannot remove yourself here
      if (targetUserId === session.user.id) {
         return NextResponse.json({ error: "Cannot remove yourself. Use leave workspace instead." }, { status: 400 });
      }
      
      const targetUser = await prisma.workspaceUser.findUnique({
         where: { userId_workspaceId: { userId: targetUserId, workspaceId } }
      });
      if (targetUser?.role === "OWNER" && currentUserReq.role !== "OWNER") {
         return NextResponse.json({ error: "Only owners can remove other owners" }, { status: 403 });
      }

      await prisma.workspaceUser.delete({
        where: { userId_workspaceId: { userId: targetUserId, workspaceId } }
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid request payload" }, { status: 400 });

  } catch (error: any) {
    console.error("Remove Member Error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
