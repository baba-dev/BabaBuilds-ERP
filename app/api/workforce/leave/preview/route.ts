import { NextResponse } from 'next/server';
import { getEmployeeByUserId } from '@/lib/workforce';
import { countLeaveDays, utcDay } from '@/lib/workforce/calendar';
import { ensureBalances, loadCalendar } from '@/lib/workforce/leave-service';
import { leavePreviewSchema } from '@/lib/workforce/schemas';
import { prisma } from '@/lib/prisma';
import { can, requireWorkforce, workforceErrorResponse } from '../../_guard';

/** What a leave request would use, before it is sent: working days, days skipped, and the balance afterwards. */
export async function GET(req: Request) {
  try {
    const gate = await requireWorkforce('workforce.leave.view');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId } = gate.access;
    const q = leavePreviewSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
    const start = utcDay(q.start), end = utcDay(q.end);
    if (end < start || (end.getTime() - start.getTime()) / 86_400_000 > 366) return NextResponse.json({ valid: false, days: 0 });

    const cal = await loadCalendar(workspaceId, start, end);
    const { days, dates } = countLeaveDays({ start, end, workingDays: cal.workingDays, holidays: cal.holidays, halfDay: q.halfDay });
    const calendarDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

    let balance: { remaining: number; afterRequest: number; isPaid: boolean } | null = null;
    if (q.leaveTypeId) {
      const manage = await can(gate.access, 'workforce.leave.manage');
      const employeeId = manage && q.employeeId ? q.employeeId : (await getEmployeeByUserId(workspaceId, userId))?.id;
      const type = await prisma.leaveType.findFirst({ where: { id: q.leaveTypeId, workspaceId }, select: { isPaid: true } });
      if (employeeId && type) {
        const year = start.getUTCFullYear();
        await ensureBalances(workspaceId, employeeId, year);
        const b = await prisma.leaveBalance.findFirst({ where: { workspaceId, employeeId, leaveTypeId: q.leaveTypeId, year } });
        if (b) balance = { remaining: b.entitled - b.used - b.pending, afterRequest: b.entitled - b.used - b.pending - days, isPaid: type.isPaid };
      }
    }
    return NextResponse.json({ valid: true, days, calendarDays, skipped: calendarDays - dates.length, balance });
  } catch (e) {
    return workforceErrorResponse(e, 'leave.preview');
  }
}
