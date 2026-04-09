import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { prisma } from "@/lib/prisma";
import { sendActivityAlert } from '@/lib/security/alert-hooks';

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
    return handleAdminApiError(error, "Server Error");
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
    
    if (action === 'UPGRADE_PRO' || action === 'UPGRADE') {
      updateData = { subscriptionStatus: 'PRO', planTier: 'PRO' };
    } else if (action === 'UPGRADE_TEAM') {
      updateData = { subscriptionStatus: 'TEAM', planTier: 'TEAM' };
    } else if (action === 'SUSPEND') {
      updateData = { subscriptionStatus: 'SUSPENDED' };
    } else if (action === 'REACTIVATE') {
      // Restore their original tier (PRO, TEAM, or FREE)
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
    return handleAdminApiError(error, "Action failed");
  }
}

// DELETE: Obliterate a user and their data
export async function DELETE(req: Request) {
  try {
    await verifySuperAdmin();
    const { userId } = await req.json();

    const deletedUser = await prisma.user.delete({
      where: { id: userId },
      select: { id: true, email: true }
    });

    await sendActivityAlert({
      type: 'USER_DELETED',
      severity: 'critical',
      message: 'A user account was deleted by super-admin.',
      details: { userId: deletedUser.id, email: deletedUser.email }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    return handleAdminApiError(error, "Failed to delete user");
  }
}
