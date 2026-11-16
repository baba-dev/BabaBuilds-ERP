/**
 * app/api/workforce/settings/leave-types/route.ts
 * GET  — list leave types
 * POST — create a leave type
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { logActivity } from "@/lib/security/activity-log";
import { leaveTypeCreateSchema } from "@/lib/workforce/settings-schemas";
import { readJson, requireWorkforce, workforceErrorResponse } from "../../_guard";
import { prisma } from "@/lib/prisma";
import { RbacDeniedError, rbacDeniedResponse, requirePermission } from "@/lib/rbac";
import { ModuleDisabledError, requireModule } from "@/lib/modules";
import { resolveSessionMembership } from '@/lib/workspace-scope';

// The workspace the user is in (session), not an arbitrary membership.
async function getWid(session: Parameters<typeof resolveSessionMembership>[0]) {
  return (await resolveSessionMembership(session))?.workspaceId ?? null;
}

export async function GET(__req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const wid = await getWid(session);
    if (!wid) return NextResponse.json({ error: "No workspace" }, { status: 400 });

    try {
      await requireModule(wid, "WORKFORCE");
      await requirePermission(session.user.id, wid, "workforce.view");
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: "Module disabled" }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    if ((await prisma.leaveType.count({ where: { workspaceId: wid } })) === 0) {
      const { initializeWorkforceDefaults } = await import("@/lib/workforce/index");
      await initializeWorkforceDefaults(wid);
    }
    const leaveTypes = await prisma.leaveType.findMany({
      where: { workspaceId: wid },
      include: { _count: { select: { leaveBalances: true, leaveRequests: true } } },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    });
    return NextResponse.json({ leaveTypes });
  } catch (err) {
    console.error("[leave-types/GET]", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await requireWorkforce('workforce.settings.manage');
    if ('response' in g) return g.response;
    const d = leaveTypeCreateSchema.parse(await readJson(req));
    const leaveType = await prisma.leaveType.create({ data: { workspaceId: g.access.workspaceId, ...d, description: d.description || null } });
    void logActivity({ workspaceId: g.access.workspaceId, action: 'workforce.leave_type_added', status: 'SUCCESS', actor: { userId: g.access.userId, email: g.access.email }, entity: { type: 'leave_type', id: leaveType.id }, metadata: { code: d.code } });
    return NextResponse.json(leaveType, { status: 201 });
  } catch (error) {
    return workforceErrorResponse(error, 'leave-types.create');
  }
}
