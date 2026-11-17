/**
 * GET  — attendance records (managers: anyone; everyone else: their own)
 * POST — CHECK_IN / CHECK_OUT (self, today only) or SET (manager correction for any past day)
 */
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { logActivity } from '@/lib/security/activity-log';
import { prisma } from '@/lib/prisma';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { attendanceSchema } from '@/lib/workforce/schemas';
import { managerSet, selfCheckIn, selfCheckOut } from '@/lib/workforce/attendance-service';
import { LeaveError } from '@/lib/workforce/leave-service';
import { utcDay } from '@/lib/workforce/calendar';
import { getEmployeeByUserId } from '@/lib/workforce/index';
import { can, readJson, requireWorkforce, workforceErrorResponse } from '../_guard';

const querySchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  employeeId: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(200),
});

export async function GET(req: NextRequest) {
  try {
    const g = await requireWorkforce('workforce.attendance.view');
    if ('response' in g) return g.response;
    const { access } = g;
    const q = querySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const manager = await can(access, 'workforce.attendance.manage');
    let employeeId = q.employeeId;
    if (!manager) employeeId = (await getEmployeeByUserId(access.workspaceId, access.userId))?.id ?? '__none__';
    const records = await prisma.attendanceRecord.findMany({
      where: {
        workspaceId: access.workspaceId,
        ...(employeeId ? { employeeId } : {}),
        ...(q.from || q.to ? { date: { ...(q.from ? { gte: utcDay(q.from) } : {}), ...(q.to ? { lte: utcDay(q.to) } : {}) } } : {}),
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } },
      orderBy: [{ date: 'desc' }, { employee: { firstName: 'asc' } }],
      take: q.limit,
    });
    return NextResponse.json({ records, canManage: manager });
  } catch (error) {
    return workforceErrorResponse(error, 'attendance.list');
  }
}

export async function POST(req: NextRequest) {
  try {
    const g = await requireWorkforce('workforce.attendance.view');
    if ('response' in g) return g.response;
    const { access } = g;
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/workforce/attendance', scope: `${access.workspaceId}:${access.userId}`, max: 120, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;

    const body = attendanceSchema.parse(await readJson(req));

    if (body.action === 'SET') {
      if (!(await can(access, 'workforce.attendance.manage'))) throw new LeaveError('NOT_ALLOWED', 'Only managers can record attendance for someone else.', 403);
      const record = await managerSet({ workspaceId: access.workspaceId, managerUserId: access.userId, ...body });
      void logActivity({ workspaceId: access.workspaceId, action: 'workforce.attendance_set', status: 'SUCCESS', actor: { userId: access.userId, email: access.email }, entity: { type: 'attendance', id: record.id }, metadata: { employeeId: body.employeeId, date: body.date, status: body.status } });
      return NextResponse.json(record, { status: 201 });
    }

    const me = await getEmployeeByUserId(access.workspaceId, access.userId);
    if (!me) throw new LeaveError('NOT_FOUND', 'Your account is not linked to an employee profile yet. Ask an admin to link it.', 403);
    if (me.status === 'INACTIVE') throw new LeaveError('NOT_ALLOWED', 'Inactive employees cannot check in.', 403);
    const record = body.action === 'CHECK_IN'
      ? await selfCheckIn({ workspaceId: access.workspaceId, employeeId: me.id, remote: body.remote })
      : await selfCheckOut({ workspaceId: access.workspaceId, employeeId: me.id });
    return NextResponse.json(record, { status: 201 });
  } catch (error) {
    return workforceErrorResponse(error, 'attendance.write');
  }
}
