import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { invalidateDashboardCacheForWorkspace, noteDashboardCacheIncident } from '@/lib/dashboard-cache';

// --- EDIT RETAINER LOGIC ---
export async function PATCH(
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const resolvedParams = await params;
    const retainerId = resolvedParams.id;

    const body = await request.json();
    const { frequency } = body;

    // 1. Verify ownership before updating
    const existingRetainer = await prisma.retainer.findFirst({
      where: { id: retainerId, workspaceId: workspaceId }
    });

    if (!existingRetainer) {
      return NextResponse.json({ error: "Retainer not found or unauthorized" }, { status: 404 });
    }

    // 2. Perform the update
    const updatedRetainer = await prisma.retainer.update({
      where: { id: retainerId },
      data: {
        frequency: frequency || existingRetainer.frequency,
      }
    });

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'retainer', action: 'update', error: String(error) });
    }

    return NextResponse.json({ success: true, retainer: updatedRetainer });

  } catch (error: unknown) {
    console.error("Retainer Update Error:", error);
    return NextResponse.json({ error: "An error occurred while updating the retainer" }, { status: 500 });
  }
}

// --- DELETE RETAINER LOGIC ---
export async function DELETE(
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !session.workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = session.workspaceId;

    const resolvedParams = await params;
    const retainerId = resolvedParams.id;

    if (!retainerId) {
      return NextResponse.json({ error: "Retainer ID is required" }, { status: 400 });
    }

    const result = await prisma.retainer.deleteMany({
      where: { id: retainerId, workspaceId: workspaceId }
    });

    if (result.count === 0) {
      return NextResponse.json({ error: "Retainer engine not found or unauthorized to delete" }, { status: 404 });
    }

    try {
      invalidateDashboardCacheForWorkspace(workspaceId);
    } catch (error) {
      noteDashboardCacheIncident('invalidationFailures', { workspaceId, entity: 'retainer', action: 'delete', error: String(error) });
    }

    return NextResponse.json({ success: true, message: "Retainer engine destroyed successfully" });

  } catch (error: unknown) {
    console.error("Retainer Deletion Error:", error);
    return NextResponse.json({ error: "An error occurred while deleting the retainer" }, { status: 500 });
  }
}