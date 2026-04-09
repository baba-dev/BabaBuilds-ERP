import { NextResponse } from "next/server";
import { handleAdminApiError, verifySuperAdmin } from "../authz";
import { prisma } from "@/lib/prisma";
import { sendActivityAlert } from '@/lib/security/alert-hooks';
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/activity-log";

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
  let actorId: string | null = null;
  let actorEmail: string | null = null;
  let targetUserId: string | null = null;
  let targetWorkspaceId: string | null = null;
  let action: string | null = null;

  try {
    await verifySuperAdmin();
    const session = await getServerSession(authOptions);
    actorId = (session?.user as any)?.id ?? null;
    actorEmail = session?.user?.email ?? null;
    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId : null;
    action = typeof body?.action === "string" ? body.action : null;
    targetUserId = userId;
    if (!userId) {
      logActivity({
        action: "admin_user_patch",
        outcome: "error",
        entityType: "workspace",
        actorId,
        actorEmail,
        metadata: {
          action,
          reason: "invalid_user_id",
        },
      });
      return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    }

    const userWorkspace = await prisma.workspaceUser.findFirst({
      where: { userId },
      include: { workspace: true }
    });
    targetWorkspaceId = userWorkspace?.workspaceId ?? null;

    if (!userWorkspace) {
      logActivity({
        action: "admin_user_patch",
        outcome: "error",
        entityType: "workspace",
        workspaceId: null,
        actorId,
        actorEmail,
        metadata: {
          targetUserId,
          action,
          reason: "workspace_not_found",
        },
      });
      return NextResponse.json({ error: "No workspace found" }, { status: 404 });
    }

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
      logActivity({
        action: "admin_user_patch",
        outcome: "error",
        entityType: "workspace",
        entityId: userWorkspace.workspaceId,
        workspaceId: userWorkspace.workspaceId,
        actorId,
        actorEmail,
        metadata: {
          targetUserId,
          action,
          reason: "invalid_action",
        },
      });
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    await prisma.workspace.update({
      where: { id: userWorkspace.workspaceId },
      data: updateData
    });

    logActivity({
      action: "admin_user_patch",
      outcome: "success",
      entityType: "workspace",
      entityId: userWorkspace.workspaceId,
      workspaceId: userWorkspace.workspaceId,
      actorId,
      actorEmail,
      metadata: {
        targetUserId,
        action,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logActivity({
      action: "admin_user_patch",
      outcome: "error",
      entityType: "workspace",
      entityId: targetWorkspaceId,
      workspaceId: targetWorkspaceId,
      actorId,
      actorEmail,
      metadata: {
        targetUserId,
        action,
        reason: "unhandled_exception",
      },
    });
    return handleAdminApiError(error, "Action failed");
  }
}

// DELETE: Obliterate a user and their data
export async function DELETE(req: Request) {
  let actorId: string | null = null;
  let actorEmail: string | null = null;
  let targetUserId: string | null = null;

  try {
    await verifySuperAdmin();
    const session = await getServerSession(authOptions);
    actorId = (session?.user as any)?.id ?? null;
    actorEmail = session?.user?.email ?? null;
    const body = await req.json();
    const userId = typeof body?.userId === "string" ? body.userId : null;
    targetUserId = userId;
    if (!userId) {
      logActivity({
        action: "admin_user_delete",
        outcome: "error",
        entityType: "user",
        actorId,
        actorEmail,
        metadata: {
          reason: "invalid_user_id",
        },
      });
      return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
    }

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

    logActivity({
      action: "admin_user_delete",
      outcome: "success",
      entityType: "user",
      entityId: userId,
      actorId,
      actorEmail,
      metadata: {
        targetUserId: userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logActivity({
      action: "admin_user_delete",
      outcome: "error",
      entityType: "user",
      entityId: targetUserId,
      actorId,
      actorEmail,
      metadata: {
        targetUserId,
        reason: "unhandled_exception",
      },
    });
    return handleAdminApiError(error, "Failed to delete user");
  }
}
