import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function DELETE(
  request: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // 1. Authenticate and extract Workspace ID
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;

    // 2. Resolve dynamic route parameters (Next.js 15 safe)
    const resolvedParams = await params;
    const retainerId = resolvedParams.id;

    if (!retainerId) {
      return NextResponse.json({ error: "Retainer ID is required" }, { status: 400 });
    }

    // 3. Secure Deletion (Scoped strictly to the current workspace)
    const result = await prisma.retainer.deleteMany({
      where: { 
        id: retainerId, 
        workspaceId: workspaceId 
      }
    });

    // 4. Verify something was actually deleted
    if (result.count === 0) {
      return NextResponse.json({ error: "Retainer engine not found or unauthorized to delete" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Retainer engine destroyed successfully" });

  } catch (error: any) {
    console.error("Retainer Deletion Error:", error);
    return NextResponse.json({ error: "An error occurred while deleting the retainer" }, { status: 500 });
  }
}