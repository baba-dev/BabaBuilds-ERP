import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    const scopedSession = session as (typeof session & { workspaceId?: string }) | null;

    if (!scopedSession?.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = scopedSession.workspaceId;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { subscriptionStatus: true, subscriptionEndsAt: true },
    });

    if (!workspace) {
      return NextResponse.json({ error: "Workspace not found." }, { status: 404 });
    }

    if (workspace.subscriptionStatus !== "PRO") {
      return NextResponse.json({ error: "No active PRO subscription to cancel." }, { status: 400 });
    }

    await prisma.workspace.update({
      where: { id: workspaceId },
      data: {
        subscriptionStatus: "FREE",
        planTier: "FREE",
        planInterval: null,
        subscriptionEndsAt: workspace.subscriptionEndsAt ?? new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to cancel subscription." }, { status: 500 });
  }
}
