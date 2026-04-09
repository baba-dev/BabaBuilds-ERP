import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session || !(session as any).workspaceId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const workspaceId = (session as any).workspaceId;
    const resolvedParams = await params;
    const proposalId = resolvedParams.id;

    const proposal = await prisma.proposal.findFirst({
      where: { id: proposalId, workspaceId },
    });

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ data: proposal });
  } catch (error: any) {
    console.error("Proposal fetch error:", error);
    return NextResponse.json({ error: "An error occurred while fetching the proposal" }, { status: 500 });
  }
}

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
    const proposalId = resolvedParams.id;

    if (!proposalId) {
      return NextResponse.json({ error: "Proposal ID is required" }, { status: 400 });
    }

    // 3. Secure Deletion (Scoped strictly to the current workspace)
    // Note: 'deleteMany' is used because 'id' alone is the unique key, 
    // but we MUST enforce the workspaceId check to prevent cross-tenant deletion.
    const result = await prisma.proposal.deleteMany({
      where: { 
        id: proposalId, 
        workspaceId: workspaceId 
      }
    });

    // 4. Verify something was actually deleted
    if (result.count === 0) {
      return NextResponse.json({ error: "Proposal not found or unauthorized to delete" }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: "Proposal deleted successfully" });

  } catch (error: any) {
    console.error("Proposal Deletion Error:", error);
    return NextResponse.json({ error: "An error occurred while deleting the proposal" }, { status: 500 });
  }
}
