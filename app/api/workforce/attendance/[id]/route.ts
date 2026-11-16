import { NextRequest, NextResponse } from 'next/server';

import { logActivity } from '@/lib/security/activity-log';
import { prisma } from '@/lib/prisma';
import { LeaveError } from '@/lib/workforce/leave-service';
import { requireWorkforce, workforceErrorResponse } from '../../_guard';

/** Managers can remove a mistaken record; the day then shows as "not marked". */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const g = await requireWorkforce('workforce.attendance.manage');
    if ('response' in g) return g.response;
    const { id } = await params;
    const rec = await prisma.attendanceRecord.findFirst({ where: { id, workspaceId: g.access.workspaceId }, select: { id: true, employeeId: true, date: true, status: true } });
    if (!rec) throw new LeaveError('NOT_FOUND', 'Attendance record not found.', 404);
    await prisma.attendanceRecord.delete({ where: { id } });
    void logActivity({ workspaceId: g.access.workspaceId, action: 'workforce.attendance_deleted', status: 'SUCCESS', actor: { userId: g.access.userId, email: g.access.email }, entity: { type: 'attendance', id }, metadata: { employeeId: rec.employeeId, date: rec.date.toISOString().slice(0, 10), status: rec.status } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return workforceErrorResponse(error, 'attendance.delete');
  }
}
