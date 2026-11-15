import 'server-only';

import { isModuleEnabled } from '@/lib/modules';
import { prisma } from '@/lib/prisma';
import { deriveLossOfPay, type LopResult } from './loss-of-pay';

export type PayrollAdapterSource = 'WORKFORCE' | 'STANDALONE';

export type PayrollAdapterStatus = {
  workforceModuleEnabled: boolean;
  source: PayrollAdapterSource;
  badgeLabel: string;
};

export async function getPayrollAdapterStatus(workspaceId: string): Promise<PayrollAdapterStatus> {
  const workforceModuleEnabled = await isModuleEnabled(workspaceId, 'WORKFORCE');
  return {
    workforceModuleEnabled,
    source: workforceModuleEnabled ? 'WORKFORCE' : 'STANDALONE',
    badgeLabel: workforceModuleEnabled ? 'Workforce sync active' : 'Standalone payroll mode',
  };
}

export type WorkforceSignals = {
  /** Loss of pay worked out from attendance and approved leave, by employee. */
  lop: Map<string, LopResult>;
  /** Leave requests still waiting for a decision that overlap the period, by employee. */
  pendingLeave: Map<string, number>;
};

/** Attendance and leave for a pay month. Empty when the Workforce module is off: loss of pay is then entered by hand. */
export async function loadWorkforceSignals(args: {
  workspaceId: string;
  employees: { id: string; joinDate: Date | null; exitDate: Date | null }[];
  periodStart: Date;
  periodEnd: Date;
}): Promise<WorkforceSignals> {
  const lop = new Map<string, LopResult>();
  const pendingLeave = new Map<string, number>();
  const { workspaceId, employees, periodStart, periodEnd } = args;
  if (employees.length === 0 || !(await isModuleEnabled(workspaceId, 'WORKFORCE'))) return { lop, pendingLeave };

  const ids = employees.map((e) => e.id);
  const [schedule, holidays, attendance, leaves, pending] = await Promise.all([
    prisma.workSchedule.findUnique({ where: { workspaceId }, select: { workingDays: true } }),
    prisma.workforceHoliday.findMany({ where: { workspaceId }, select: { date: true, isRecurring: true, year: true } }),
    prisma.attendanceRecord.findMany({ where: { workspaceId, employeeId: { in: ids }, date: { gte: periodStart, lte: periodEnd } }, select: { employeeId: true, date: true, status: true } }),
    prisma.leaveRequest.findMany({
      where: { workspaceId, employeeId: { in: ids }, status: 'APPROVED', startDate: { lte: periodEnd }, endDate: { gte: periodStart } },
      select: { employeeId: true, startDate: true, endDate: true, days: true, leaveType: { select: { isPaid: true } } },
    }),
    prisma.leaveRequest.groupBy({
      by: ['employeeId'],
      where: { workspaceId, employeeId: { in: ids }, status: 'PENDING', startDate: { lte: periodEnd }, endDate: { gte: periodStart } },
      _count: { _all: true },
    }),
  ]);

  let workingDays = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
  try {
    const parsed = JSON.parse(schedule?.workingDays ?? '[]');
    if (Array.isArray(parsed) && parsed.length) workingDays = parsed.map(String);
  } catch {
    /* keep the default week */
  }

  const holidaySet = new Set<string>();
  for (const h of holidays) {
    if (h.isRecurring) {
      for (const y of new Set([periodStart.getUTCFullYear(), periodEnd.getUTCFullYear()])) {
        holidaySet.add(new Date(Date.UTC(y, h.date.getUTCMonth(), h.date.getUTCDate())).toISOString().slice(0, 10));
      }
    } else holidaySet.add(h.date.toISOString().slice(0, 10));
  }

  for (const e of employees) {
    lop.set(
      e.id,
      deriveLossOfPay({
        periodStart,
        periodEnd,
        workingDays,
        holidays: holidaySet,
        joinDate: e.joinDate,
        exitDate: e.exitDate,
        attendance: attendance.filter((a) => a.employeeId === e.id).map((a) => ({ date: a.date, status: a.status })),
        leaves: leaves.filter((l) => l.employeeId === e.id).map((l) => ({ start: l.startDate, end: l.endDate, days: l.days, isPaid: l.leaveType.isPaid })),
      }),
    );
  }
  for (const p of pending) pendingLeave.set(p.employeeId, p._count._all);
  return { lop, pendingLeave };
}
