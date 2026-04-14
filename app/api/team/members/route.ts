import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session: any = await getServerSession(authOptions);
    if (!session || !session.workspaceId || !session.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId: string = session.workspaceId;
    const currentUserId: string = session.user.id;

    const membership = await prisma.workspaceUser.findUnique({
      where: { userId_workspaceId: { userId: currentUserId, workspaceId } },
      select: { role: true },
    });

    if (!membership) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [members, invites] = await Promise.all([
      prisma.workspaceUser.findMany({
        where: { workspaceId },
        orderBy: { id: "asc" },
        select: {
          id: true,
          role: true,
          userId: true,
          user: {
            select: {
              name: true,
              email: true,
              image: true,
            },
          },
        },
      }),
      prisma.workspaceInvite.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          role: true,
          expiresAt: true,
          createdAt: true,
        },
      }),
    ]);

    return NextResponse.json({
      data: {
        currentUserRole: membership.role,
        members,
        invites,
      },
    });
  } catch (error) {
    console.error("Team members GET error", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

