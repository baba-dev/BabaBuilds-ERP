import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const workspaceId = session.workspaceId;

    const { id } = await context.params;
    const { status } = await request.json();

    const updated = await prisma.proposal.updateMany({
      where: { 
        id: id, 
        workspaceId: workspaceId 
      },
      data: { status }
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "Proposal not found or unauthorized" }, { status: 404 });
    }

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'proposal', action: 'status_update', error: String(error) });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Status Update Error:", error);
    return NextResponse.json({ error: "Failed to update proposal status" }, { status: 500 });
  }
}
