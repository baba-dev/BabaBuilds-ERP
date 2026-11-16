import 'server-only';

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { countLeaveDays, daysByYear, holidayDates, isValidDate, parseWorkingDays, prorateEntitlement, rangesOverlap, utcDay, type HalfDay } from './calendar';

export class LeaveError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'INVALID' | 'NO_WORKING_DAYS' | 'OVERLAP' | 'INSUFFICIENT_BALANCE' | 'NOT_PENDING' | 'SELF_APPROVAL' | 'NOT_ALLOWED' | 'EMPLOYEE_INACTIVE' | 'TOO_OLD',
    message: string,
    readonly status = 409,
    readonly meta: Record<string, string | number | Record<string, string[]>> = {},
  ) { super(message); }
}

type Tx = Prisma.TransactionClient;

export async function loadCalendar(workspaceId: string, from: Date, to: Date, db: Tx | typeof prisma = prisma) {
  const [schedule, holidays] = await Promise.all([
    db.workSchedule.findUnique({ where: { workspaceId }, select: { workingDays: true, workStartTime: true, workEndTime: true, timeZone: true } }),
    db.workforceHoliday.findMany({ where: { workspaceId }, select: { date: true, isRecurring: true, year: true } }),
  ]);
  return {
    workingDays: parseWorkingDays(schedule?.workingDays),
    holidays: holidayDates(holidays, from, to),
    timeZone: schedule?.timeZone ?? 'Asia/Kolkata',
    workStart: schedule?.workStartTime ?? '09:00',
    workEnd: schedule?.workEndTime ?? '18:00',
  };
}

/** Makes sure the person has a balance row for each active leave type in the year (joiners get a part-year entitlement). */
export async function ensureBalances(workspaceId: string, employeeId: string, year: number, db: Tx | typeof prisma = prisma) {
  const [types, existing, emp] = await Promise.all([
    db.leaveType.findMany({ where: { workspaceId, isActive: true }, select: { id: true, defaultDays: true } }),
    db.leaveBalance.findMany({ where: { workspaceId, employeeId, year }, select: { leaveTypeId: true } }),
    db.employee.findFirst({ where: { id: employeeId, workspaceId }, select: { joinDate: true } }),
  ]);
  const have = new Set(existing.map((b) => b.leaveTypeId));
  for (const t of types) {
    if (have.has(t.id)) continue;
    const entitled = prorateEntitlement(t.defaultDays, emp?.joinDate, year);
    await db.leaveBalance.create({ data: { workspaceId, employeeId, leaveTypeId: t.id, year, entitled, used: 0, pending: 0, remaining: entitled } }).catch(() => undefined); // a concurrent request may have created it
  }
}

/** Moves days between a person's pending and used for one leave type and year, with compare-and-set so two requests cannot overspend. */
async function applyBalance(tx: Tx, args: { workspaceId: string; employeeId: string; leaveTypeId: string; year: number; pending?: number; used?: number; requireRemaining?: number }) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await ensureBalances(args.workspaceId, args.employeeId, args.year, tx);
    const row = await tx.leaveBalance.findFirst({ where: { workspaceId: args.workspaceId, employeeId: args.employeeId, leaveTypeId: args.leaveTypeId, year: args.year } });
    if (!row) return; // the leave type is no longer active; nothing to track
    const remaining = row.entitled - row.used - row.pending;
    if (args.requireRemaining !== undefined && remaining + 1e-9 < args.requireRemaining) {
      throw new LeaveError('INSUFFICIENT_BALANCE', `Only ${Math.max(0, remaining)} day${remaining === 1 ? '' : 's'} left for ${args.year}.`, 409, { remaining: Math.max(0, remaining), requested: args.requireRemaining, year: args.year });
    }
    const pending = Math.max(0, row.pending + (args.pending ?? 0));
    const used = Math.max(0, row.used + (args.used ?? 0));
    const moved = await tx.leaveBalance.updateMany({ where: { id: row.id, pending: row.pending, used: row.used }, data: { pending, used, remaining: row.entitled - used - pending } });
    if (moved.count === 1) return;
  }
  throw new LeaveError('INSUFFICIENT_BALANCE', 'Leave balance changed while saving. Please try again.', 409);
}

async function chargeYears(tx: Tx, req: { workspaceId: string; employeeId: string; leaveTypeId: string; startDate: Date; endDate: Date; halfDay: HalfDay }, mode: { pending?: 1 | -1; used?: 1 | -1; check?: boolean }, isPaid: boolean) {
  const cal = await loadCalendar(req.workspaceId, req.startDate, req.endDate, tx);
  const { dates } = countLeaveDays({ start: req.startDate, end: req.endDate, workingDays: cal.workingDays, holidays: cal.holidays, halfDay: req.halfDay });
  for (const [year, d] of Object.entries(daysByYear(dates))) {
    await applyBalance(tx, { workspaceId: req.workspaceId, employeeId: req.employeeId, leaveTypeId: req.leaveTypeId, year: Number(year), pending: mode.pending ? mode.pending * d : undefined, used: mode.used ? mode.used * d : undefined, requireRemaining: mode.check && isPaid ? d : undefined });
  }
}

export type SubmitInput = { workspaceId: string; employeeId: string; leaveTypeId: string; startDate: Date; endDate: Date; halfDay?: HalfDay; reason?: string | null; allowBackdated?: boolean; now?: Date };

/** Submits a leave request: counts the working days, refuses overlaps and (for paid leave) a balance that is too small, and reserves the days. */
export async function submitLeave(input: SubmitInput) {
  const { workspaceId, employeeId, leaveTypeId } = input;
  const startDate = utcDay(input.startDate);
  const endDate = utcDay(input.endDate);
  const halfDay = input.halfDay ?? 'NONE';
  if (!isValidDate(startDate) || !isValidDate(endDate)) throw new LeaveError('INVALID', 'Enter valid dates.', 422);
  if (endDate < startDate) throw new LeaveError('INVALID', 'The end date must be on or after the start date.', 422);
  if ((endDate.getTime() - startDate.getTime()) / 86_400_000 > 366) throw new LeaveError('INVALID', 'A single request cannot be longer than a year.', 422);
  const now = utcDay(input.now ?? new Date());
  if (!input.allowBackdated && startDate.getTime() < now.getTime() - 30 * 86_400_000) throw new LeaveError('TOO_OLD', 'Leave can be applied for up to 30 days back. Ask an administrator to record older leave.', 422);

  const [emp, type] = await Promise.all([
    prisma.employee.findFirst({ where: { id: employeeId, workspaceId }, select: { id: true, status: true } }),
    prisma.leaveType.findFirst({ where: { id: leaveTypeId, workspaceId, isActive: true }, select: { id: true, isPaid: true } }),
  ]);
  if (!emp) throw new LeaveError('NOT_FOUND', 'Employee not found.', 404);
  if (emp.status === 'INACTIVE') throw new LeaveError('EMPLOYEE_INACTIVE', 'This employee is no longer active.', 409);
  if (!type) throw new LeaveError('INVALID', 'That leave type is not available.', 422);

  const cal = await loadCalendar(workspaceId, startDate, endDate);
  const { days } = countLeaveDays({ start: startDate, end: endDate, workingDays: cal.workingDays, holidays: cal.holidays, halfDay });
  if (days === 0) throw new LeaveError('NO_WORKING_DAYS', 'Those dates are all weekly offs or holidays, so no leave is needed.', 422);

  return prisma.$transaction(async (tx) => {
    const clash = await tx.leaveRequest.findMany({ where: { workspaceId, employeeId, status: { in: ['PENDING', 'APPROVED'] }, startDate: { lte: endDate }, endDate: { gte: startDate } }, select: { startDate: true, endDate: true, status: true } });
    const hit = clash.find((c) => rangesOverlap({ start: startDate, end: endDate }, { start: c.startDate, end: c.endDate }));
    if (hit) throw new LeaveError('OVERLAP', `You already have ${hit.status === 'APPROVED' ? 'approved' : 'pending'} leave on those dates.`, 409);

    await chargeYears(tx, { workspaceId, employeeId, leaveTypeId, startDate, endDate, halfDay }, { pending: 1, check: true }, type.isPaid);
    const request = await tx.leaveRequest.create({
      data: { workspaceId, employeeId, leaveTypeId, startDate, endDate, days, reason: input.reason || null, status: 'PENDING' },
      include: { employee: { select: { id: true, firstName: true, lastName: true, userId: true } }, leaveType: { select: { name: true, code: true } } },
    });
    return request;
  }, { timeout: 20_000 });
}

/** Approves or rejects a pending request. The approver cannot decide their own request. */
export async function decideLeave(args: { workspaceId: string; requestId: string; approverUserId: string; action: 'APPROVE' | 'REJECT'; rejectionReason?: string | null }) {
  const { workspaceId } = args;
  return prisma.$transaction(async (tx) => {
    const r = await tx.leaveRequest.findFirst({ where: { id: args.requestId, workspaceId }, include: { employee: { select: { userId: true, firstName: true, lastName: true } }, leaveType: { select: { name: true, isPaid: true } } } });
    if (!r) throw new LeaveError('NOT_FOUND', 'Leave request not found.', 404);
    if (r.status !== 'PENDING') throw new LeaveError('NOT_PENDING', 'Only a pending request can be approved or rejected.', 409);
    if (r.employee.userId && r.employee.userId === args.approverUserId) throw new LeaveError('SELF_APPROVAL', 'You cannot decide your own leave request. Ask another approver.', 403);

    const claimed = await tx.leaveRequest.updateMany({ where: { id: r.id, status: 'PENDING' }, data: { status: args.action === 'APPROVE' ? 'APPROVED' : 'REJECTED', approvedByUserId: args.approverUserId, approvedAt: new Date(), rejectionReason: args.action === 'REJECT' ? args.rejectionReason || null : null } });
    if (claimed.count === 0) throw new LeaveError('NOT_PENDING', 'This request was just decided by someone else.', 409);

    const base = { workspaceId, employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, startDate: r.startDate, endDate: r.endDate, halfDay: (r.days < 1 ? 'FIRST' : 'NONE') as HalfDay };
    await chargeYears(tx, base, args.action === 'APPROVE' ? { pending: -1, used: 1 } : { pending: -1 }, r.leaveType.isPaid);
    return { request: r, status: args.action === 'APPROVE' ? ('APPROVED' as const) : ('REJECTED' as const) };
  }, { timeout: 20_000 });
}

/** Cancels a request: a pending one at any time, an approved one only while it has not started (unless a manager does it). */
export async function cancelLeave(args: { workspaceId: string; requestId: string; byUserId: string; isManager: boolean; now?: Date }) {
  const { workspaceId } = args;
  return prisma.$transaction(async (tx) => {
    const r = await tx.leaveRequest.findFirst({ where: { id: args.requestId, workspaceId }, include: { employee: { select: { userId: true } }, leaveType: { select: { isPaid: true } } } });
    if (!r) throw new LeaveError('NOT_FOUND', 'Leave request not found.', 404);
    const own = r.employee.userId === args.byUserId;
    if (!own && !args.isManager) throw new LeaveError('NOT_ALLOWED', 'You can only cancel your own leave.', 403);
    if (r.status !== 'PENDING' && r.status !== 'APPROVED') throw new LeaveError('NOT_PENDING', 'This request is already closed.', 409);
    const today = utcDay(args.now ?? new Date());
    if (r.status === 'APPROVED' && !args.isManager && r.startDate.getTime() < today.getTime()) throw new LeaveError('NOT_ALLOWED', 'Leave that has already started can only be cancelled by an administrator.', 403);

    const claimed = await tx.leaveRequest.updateMany({ where: { id: r.id, status: r.status }, data: { status: 'CANCELLED' } });
    if (claimed.count === 0) throw new LeaveError('NOT_PENDING', 'This request just changed. Please reload.', 409);
    const base = { workspaceId, employeeId: r.employeeId, leaveTypeId: r.leaveTypeId, startDate: r.startDate, endDate: r.endDate, halfDay: (r.days < 1 ? 'FIRST' : 'NONE') as HalfDay };
    await chargeYears(tx, base, r.status === 'PENDING' ? { pending: -1 } : { used: -1 }, r.leaveType.isPaid);
    return { wasApproved: r.status === 'APPROVED' };
  }, { timeout: 20_000 });
}
