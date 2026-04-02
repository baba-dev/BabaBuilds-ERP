import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// HEAVY SECURITY CHECK
async function verifySuperAdmin() {
  const session = await getServerSession(authOptions);
  if (!session || session.user?.email?.toLowerCase() !== "admin@bababuilds.com") {
    throw new Error("Unauthorized");
  }
}

// GET: Fetch all users & platform stats
export async function GET() {
  try {
    await verifySuperAdmin();

    const users = await prisma.user.findMany({
      include: {
        workspaces: {
          include: {
            workspace: {
              include: {
                _count: { select: { invoices: true } }
              }
            }
          }
        }
      }
      // Removed the orderBy: { createdAt: 'desc' } that was crashing Prisma
    });

    const mappedUsers = users.map(user => {
      const primaryWorkspace = user.workspaces[0]?.workspace;
      return {
        id: user.id,
        name: user.name,
        email: user.email,
        workspaceName: primaryWorkspace?.name || null,
        subscriptionStatus: primaryWorkspace?.subscriptionStatus || 'FREE',
        invoiceCount: primaryWorkspace?._count?.invoices || 0,
        lifetimeValue: 0 
      };
    });

    return NextResponse.json(mappedUsers);
  } catch (error) {
    console.error("Admin API Error:", error);
    return NextResponse.json({ error: "Server Error" }, { status: 500 });
  }
}

// PATCH: Upgrade, Suspend, Reactivate
export async function PATCH(req: Request) {
  try {
    await verifySuperAdmin();
    const { userId, action } = await req.json();

    const userWorkspace = await prisma.workspaceUser.findFirst({
      where: { userId },
      include: { workspace: true }
    });

    if (!userWorkspace) return NextResponse.json({ error: "No workspace found" }, { status: 404 });

    let updateData: any = {};
    
    if (action === 'UPGRADE') {
      updateData = { subscriptionStatus: 'PRO', planTier: 'PRO' };
    } else if (action === 'SUSPEND') {
      updateData = { subscriptionStatus: 'SUSPENDED' };
    } else if (action === 'REACTIVATE') {
      // Restore their original tier (PRO or FREE)
      updateData = { subscriptionStatus: userWorkspace.workspace.planTier || 'FREE' };
    } else {
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await prisma.workspace.update({
      where: { id: userWorkspace.workspaceId },
      data: updateData
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Action failed" }, { status: 500 });
  }
}

// DELETE: Obliterate a user and their data
export async function DELETE(req: Request) {
  try {
    await verifySuperAdmin();
    const { userId } = await req.json();

    await prisma.user.delete({
      where: { id: userId }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete user" }, { status: 500 });
  }
}