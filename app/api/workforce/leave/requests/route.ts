import { NextResponse } from 'next/server';
import { z } from 'zod';
import { dispatchNotification } from '@/lib/notifications/dispatcher';
import { prisma } from '@/lib/prisma';
import { DEFAULT_ROLE_PERMISSIONS, isValidBusinessRole, legacyRoleToBusinessRole } from '@/lib/permissions';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { utcDay } from '@/lib/workforce/calendar';
import { getEmployeeByUserId } from '@/lib/workforce';
import { submitLeave } from '@/lib/workforce/leave-service';
import { leaveSubmitSchema } from '@/lib/workforce/schemas';
import { can, readJson, requireWorkforce, workforceErrorResponse } from '../../_guard';

const listQuery = z.object({
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']).optional(),
  employeeId: z.string().max(40).optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

/** Leave requests. Staff see their own; approvers see everyone's, and can filter by person and by when the leave falls. */
export async function GET(req: Request) {
  try {
    const gate = await requireWorkforce('workforce.leave.view');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId } = gate.access;
    const q = listQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
    const canApprove = await can(gate.access, 'workforce.leave.approve');
    let employeeId = canApprove ? q.employeeId : undefined;
    if (!canApprove) employeeId = (await getEmployeeByUserId(workspaceId, userId))?.id ?? '__none__';

    const requests = await prisma.leaveRequest.findMany({
      where: {
        workspaceId, ...(employeeId ? { employeeId } : {}), ...(q.status ? { status: q.status } : {}),
        ...(q.from ? { endDate: { gte: utcDay(q.from) } } : {}), ...(q.to ? { startDate: { lte: utcDay(q.to) } } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, department: { select: { name: true } } } },
        leaveType: { select: { id: true, name: true, code: true, color: true, isPaid: true } },
      },
      orderBy: [{ startDate: 'desc' }, { createdAt: 'desc' }],
      take: q.limit,
    });
    return NextResponse.json({ requests, canApprove });
  } catch (e) {
    return workforceErrorResponse(e, 'leave.list');
  }
}

export async function POST(req: Request) {
  try {
    const gate = await requireWorkforce('workforce.leave.view');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/workforce/leave/requests', scope: workspaceId, max: 40, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const d = leaveSubmitSchema.parse(await readJson(req));
    const canManage = await can(gate.access, 'workforce.leave.manage');

    let employeeId = canManage && d.employeeId ? d.employeeId : undefined;
    if (!employeeId) {
      const emp = await getEmployeeByUserId(workspaceId, userId);
      if (!emp) return NextResponse.json({ code: 'NO_EMPLOYEE', error: 'No employee profile is linked to your account.' }, { status: 403 });
      employeeId = emp.id;
    }

    const request = await submitLeave({ workspaceId, employeeId, leaveTypeId: d.leaveTypeId, startDate: utcDay(d.startDate), endDate: utcDay(d.endDate), halfDay: d.halfDay, reason: d.reason, allowBackdated: canManage });

    const members = await prisma.workspaceUser.findMany({ where: { workspaceId, isActive: true }, select: { userId: true, role: true, businessRole: true } });
    const approvers = members.filter((m) => {
      const raw = m.businessRole ?? m.role;
      const role = isValidBusinessRole(raw) ? raw : legacyRoleToBusinessRole(m.role);
      return (DEFAULT_ROLE_PERMISSIONS[role] as readonly string[]).includes('workforce.leave.approve') && m.userId !== request.employee.userId;
    }).map((m) => m.userId).filter(Boolean);
    if (approvers.length > 0) {
      void dispatchNotification({ event: 'LEAVE_REQUEST_SUBMITTED', workspaceId, userIds: approvers, data: { employeeName: `${request.employee.firstName} ${request.employee.lastName}`, days: request.days, leaveType: request.leaveType.name } }).catch(() => undefined);
    }
    void logActivity({ workspaceId, action: 'workforce.leave_requested', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'leave_request', id: request.id }, metadata: { days: request.days, from: d.startDate, to: d.endDate } });
    return NextResponse.json(request, { status: 201 });
  } catch (e) {
    return workforceErrorResponse(e, 'leave.create');
  }
}
