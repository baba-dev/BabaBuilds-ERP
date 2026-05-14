/**
 * app/api/workforce/leave/requests/route.ts
 * GET  — list leave requests (role-scoped)
 * POST — submit a leave request
 */
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { requirePermission, checkPermissionSilent, RbacDeniedError, rbacDeniedResponse } from '@/lib/rbac';
import { requireModule, ModuleDisabledError } from '@/lib/modules';
import { getEmployeeByUserId } from '@/lib/workforce/index';
import {
  DEFAULT_ROLE_PERMISSIONS,
  isValidBusinessRole,
  legacyRoleToBusinessRole,
} from '@/lib/permissions';
import { dispatchNotification } from '@/lib/notifications/dispatcher';

async function getWid(userId: string) {
  const wu = await prisma.workspaceUser.findFirst({ where: { userId, isActive: true }, select: { workspaceId: true } });
  return wu?.workspaceId ?? null;
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const wid = await getWid(session.user.id);
    if (!wid) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

    try {
      await requireModule(wid, 'WORKFORCE');
      await requirePermission(session.user.id, wid, 'workforce.leave.view');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const { searchParams } = new URL(req.url);
    const rawStatus = searchParams.get("status")?.trim() ?? "";
    const allowedStatuses = new Set(["PENDING", "APPROVED", "REJECTED", "CANCELLED"]);
    const statusFilter = allowedStatuses.has(rawStatus) ? rawStatus : undefined;
    const canApprove = await checkPermissionSilent(session.user.id, wid, 'workforce.leave.approve');

    // Role-scoped: STAFF sees own requests only
    let employeeIdFilter: string | undefined;
    if (!canApprove) {
      const emp = await getEmployeeByUserId(wid, session.user.id);
      employeeIdFilter = emp?.id ?? '__none__';
    }

    const requests = await prisma.leaveRequest.findMany({
      where: {
        workspaceId: wid,
        ...(employeeIdFilter ? { employeeId: employeeIdFilter } : {}),
        ...(statusFilter
          ? { status: statusFilter as "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED" }
          : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, department: { select: { name: true } } } },
        leaveType: { select: { id: true, name: true, code: true, color: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    return NextResponse.json({ requests });
  } catch (err) {
    console.error('[leave/requests/GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const wid = await getWid(session.user.id);
    if (!wid) return NextResponse.json({ error: 'No workspace' }, { status: 400 });

    try {
      await requireModule(wid, 'WORKFORCE');
      await requirePermission(session.user.id, wid, 'workforce.leave.view');
    } catch (e) {
      if (e instanceof ModuleDisabledError) return NextResponse.json({ error: 'Module disabled' }, { status: 403 });
      if (e instanceof RbacDeniedError) return rbacDeniedResponse(e);
      throw e;
    }

    const body = await req.json() as { employeeId?: string; leaveTypeId?: string; startDate?: string; endDate?: string; days?: number; reason?: string };
    const canManage = await checkPermissionSilent(session.user.id, wid, 'workforce.leave.manage');

    let targetEmployeeId = canManage ? body.employeeId : undefined;
    if (!targetEmployeeId) {
      const emp = await getEmployeeByUserId(wid, session.user.id);
      if (!emp) return NextResponse.json({ error: 'No employee profile linked to your account' }, { status: 403 });
      targetEmployeeId = emp.id;
    }

    if (!body.leaveTypeId || !body.startDate || !body.endDate) {
      return NextResponse.json({ error: 'leaveTypeId, startDate, endDate are required' }, { status: 400 });
    }

    const leaveType = await prisma.leaveType.findFirst({
      where: { id: body.leaveTypeId, workspaceId: wid, isActive: true },
      select: { id: true },
    });
    if (!leaveType) return NextResponse.json({ error: 'Invalid leaveTypeId' }, { status: 400 });

    const startDate = new Date(body.startDate);
    const endDate = new Date(body.endDate);
    if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
      return NextResponse.json({ error: 'Invalid startDate or endDate' }, { status: 400 });
    }
    if (endDate.getTime() < startDate.getTime()) {
      return NextResponse.json({ error: 'endDate must be on or after startDate' }, { status: 400 });
    }
    const computedDays = Math.ceil((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
    const daysRaw = body.days ?? computedDays;
    const days = Math.max(1, Math.min(366, Math.floor(daysRaw)));

    const leaveRequest = await prisma.leaveRequest.create({
      data: {
        workspaceId: wid,
        employeeId: targetEmployeeId,
        leaveTypeId: body.leaveTypeId,
        startDate,
        endDate,
        days,
        reason: body.reason,
        status: 'PENDING',
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
        leaveType: { select: { name: true, code: true } },
      },
    });

    // Create in-app notification for members with leave.approve permission
    // (best-effort, non-blocking)
    const members = await prisma.workspaceUser.findMany({
      where: { workspaceId: wid, isActive: true },
      select: { userId: true, role: true, businessRole: true },
    });
    const notifyUserIds = members
      .filter((m) => {
        const raw = m.businessRole ?? m.role;
        const role = isValidBusinessRole(raw) ? raw : legacyRoleToBusinessRole(m.role);
        return (DEFAULT_ROLE_PERMISSIONS[role] as readonly string[]).includes('workforce.leave.approve');
      })
      .map((m) => m.userId)
      .filter(Boolean);
    if (notifyUserIds.length > 0) {
      try {
        await dispatchNotification({
          event: 'LEAVE_REQUEST_SUBMITTED',
          workspaceId: wid,
          userIds: notifyUserIds,
          data: {
            employeeName: `${leaveRequest.employee.firstName} ${leaveRequest.employee.lastName}`,
            days,
            leaveType: leaveRequest.leaveType.name,
          },
        });
      } catch {
        // Best-effort notification dispatch should not fail leave submission.
      }
    }

    return NextResponse.json(leaveRequest, { status: 201 });
  } catch (err) {
    console.error('[leave/requests/POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
