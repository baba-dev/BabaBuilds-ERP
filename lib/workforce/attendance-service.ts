import 'server-only';

import { prisma } from '@/lib/prisma';
import { checkInStatus, dayKey, isWorkingDay, todayInZone, utcDay } from './calendar';
import { LeaveError, loadCalendar } from './leave-service';
import { buildSheet } from './sheet';

type Status = 'PRESENT' | 'LATE' | 'ABSENT' | 'HALF_DAY' | 'HOLIDAY' | 'REMOTE';

/** Today's record for one person, with the workplace's hours and time zone. */
export async function todayState(workspaceId: string, employeeId: string, now = new Date()) {
  const cal = await loadCalendar(workspaceId, now, now);
  const today = todayInZone(now, cal.timeZone);
  const record = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId, date: today } } });
  return { date: dayKey(today), record, workingDay: isWorkingDay(today, cal.workingDays, cal.holidays), schedule: { workStart: cal.workStart, workEnd: cal.workEnd, timeZone: cal.timeZone } };
}

/** Self check-in: files it under today at the workplace, marks LATE after the grace period, and refuses a second check-in. */
export async function selfCheckIn(args: { workspaceId: string; employeeId: string; remote?: boolean; now?: Date }) {
  const now = args.now ?? new Date();
  const cal = await loadCalendar(args.workspaceId, now, now);
  const today = todayInZone(now, cal.timeZone);
  if (!isWorkingDay(today, cal.workingDays, cal.holidays)) throw new LeaveError('INVALID', 'Today is a weekly off or a holiday, so there is nothing to check in to.', 409);
  const existing = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: args.employeeId, date: today } } });
  if (existing?.checkInAt) throw new LeaveError('INVALID', 'You have already checked in today.', 409);
  if (existing && existing.isManagerEntered) throw new LeaveError('NOT_ALLOWED', 'Your attendance for today was already recorded by a manager.', 403);
  const status: Status = args.remote ? 'REMOTE' : checkInStatus(now, cal.timeZone, cal.workStart);
  return prisma.attendanceRecord.upsert({
    where: { employeeId_date: { employeeId: args.employeeId, date: today } },
    create: { workspaceId: args.workspaceId, employeeId: args.employeeId, date: today, status, checkInAt: now },
    update: { status, checkInAt: now },
  });
}

export async function selfCheckOut(args: { workspaceId: string; employeeId: string; now?: Date }) {
  const now = args.now ?? new Date();
  const cal = await loadCalendar(args.workspaceId, now, now);
  const today = todayInZone(now, cal.timeZone);
  const rec = await prisma.attendanceRecord.findUnique({ where: { employeeId_date: { employeeId: args.employeeId, date: today } } });
  if (!rec?.checkInAt) throw new LeaveError('INVALID', 'Check in first, then check out.', 409);
  if (rec.checkOutAt) throw new LeaveError('INVALID', 'You have already checked out today.', 409);
  return prisma.attendanceRecord.update({ where: { id: rec.id }, data: { checkOutAt: now } });
}

/** A manager records or corrects any past (or today's) day. Future days cannot be marked. */
export async function managerSet(args: { workspaceId: string; managerUserId: string; employeeId: string; date: string; status: Status; checkInAt?: string | null; checkOutAt?: string | null; notes?: string | null; now?: Date }) {
  const now = args.now ?? new Date();
  const cal = await loadCalendar(args.workspaceId, now, now);
  const day = utcDay(args.date);
  if (day.getTime() > todayInZone(now, cal.timeZone).getTime()) throw new LeaveError('INVALID', 'You cannot mark attendance for a future day.', 422);
  const emp = await prisma.employee.findFirst({ where: { id: args.employeeId, workspaceId: args.workspaceId }, select: { id: true } });
  if (!emp) throw new LeaveError('NOT_FOUND', 'Employee not found.', 404);
  if (args.checkInAt && args.checkOutAt && new Date(args.checkOutAt) < new Date(args.checkInAt)) throw new LeaveError('INVALID', 'Check-out cannot be before check-in.', 422);
  const data = { status: args.status, checkInAt: args.checkInAt ? new Date(args.checkInAt) : null, checkOutAt: args.checkOutAt ? new Date(args.checkOutAt) : null, notes: args.notes ?? null, isManagerEntered: true, managedByUserId: args.managerUserId };
  return prisma.attendanceRecord.upsert({ where: { employeeId_date: { employeeId: args.employeeId, date: day } }, create: { workspaceId: args.workspaceId, employeeId: args.employeeId, date: day, ...data }, update: data });
}

export async function monthSheet(args: { workspaceId: string; year: number; month: number; employeeIds?: string[]; departmentId?: string; now?: Date }) {
  const first = new Date(Date.UTC(args.year, args.month - 1, 1));
  const last = new Date(Date.UTC(args.year, args.month, 0));
  const cal = await loadCalendar(args.workspaceId, first, last);
  const employees = await prisma.employee.findMany({
    where: { workspaceId: args.workspaceId, ...(args.employeeIds ? { id: { in: args.employeeIds } } : {}), ...(args.departmentId ? { departmentId: args.departmentId } : {}), OR: [{ exitDate: null }, { exitDate: { gte: first } }], AND: [{ OR: [{ joinDate: null }, { joinDate: { lte: last } }] }] },
    select: { id: true, firstName: true, lastName: true, joinDate: true, exitDate: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 1000,
  });
  const ids = employees.map((e) => e.id);
  const [attendance, leaves] = await Promise.all([
    prisma.attendanceRecord.findMany({ where: { workspaceId: args.workspaceId, employeeId: { in: ids }, date: { gte: first, lte: last } }, select: { employeeId: true, date: true, status: true } }),
    prisma.leaveRequest.findMany({ where: { workspaceId: args.workspaceId, employeeId: { in: ids }, status: 'APPROVED', startDate: { lte: last }, endDate: { gte: first } }, select: { employeeId: true, startDate: true, endDate: true, days: true, leaveType: { select: { isPaid: true } } } }),
  ]);
  return buildSheet({
    year: args.year, month: args.month,
    employees: employees.map((e) => ({ id: e.id, name: `${e.firstName} ${e.lastName}`.trim(), joinDate: e.joinDate, exitDate: e.exitDate })),
    attendance, leaves: leaves.map((l) => ({ employeeId: l.employeeId, start: l.startDate, end: l.endDate, days: l.days, isPaid: l.leaveType.isPaid })),
    workingDays: cal.workingDays, holidays: cal.holidays, today: todayInZone(args.now ?? new Date(), cal.timeZone),
  });
}
