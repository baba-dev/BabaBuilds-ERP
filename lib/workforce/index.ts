/**
 * lib/workforce/index.ts
 *
 * Workforce module server utilities.
 * Initialization, summary aggregation, and shared helpers.
 */

import 'server-only';
import { prisma } from '@/lib/prisma';
import { dayKey, isWorkingDay, todayInZone } from './calendar';
import { loadCalendar } from './leave-service';

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULT DATA INITIALIZATION
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_DEPARTMENTS = [
  { name: 'Engineering', description: 'Software development and technical operations' },
  { name: 'Sales', description: 'Revenue generation and client relationships' },
  { name: 'Operations', description: 'Business operations and project delivery' },
  { name: 'Human Resources', description: 'People management and organizational development' },
  { name: 'Finance', description: 'Financial planning and accounting' },
];

const DEFAULT_DESIGNATIONS = [
  { title: 'Intern', level: 1 },
  { title: 'Junior Associate', level: 2 },
  { title: 'Associate', level: 3 },
  { title: 'Senior Associate', level: 4 },
  { title: 'Team Lead', level: 5 },
  { title: 'Manager', level: 6 },
  { title: 'Senior Manager', level: 7 },
  { title: 'Director', level: 8 },
];

const DEFAULT_LEAVE_TYPES = [
  { name: 'Annual Leave', code: 'AL', description: 'Planned yearly vacation leave', color: 'emerald', defaultDays: 18, isPaid: true },
  { name: 'Sick Leave', code: 'SL', description: 'Medical leave for illness or recovery', color: 'rose', defaultDays: 12, isPaid: true },
  { name: 'Casual Leave', code: 'CL', description: 'Short-notice personal leave', color: 'amber', defaultDays: 6, isPaid: true },
  { name: 'Unpaid Leave', code: 'UL', description: 'Leave without pay', color: 'zinc', defaultDays: 0, isPaid: false },
];

const DEFAULT_HOLIDAYS: Array<{ name: string; month: number; day: number }> = [
  { name: 'Republic Day', month: 1, day: 26 },
  { name: 'Independence Day', month: 8, day: 15 },
  { name: 'Gandhi Jayanti', month: 10, day: 2 },
  { name: 'Christmas Day', month: 12, day: 25 },
];

/**
 * Called on first-time Workforce module enable.
 * Creates sensible defaults for a fresh workspace — departments, designations,
 * leave types, work schedule, and national holidays.
 * All creates are idempotent (individual upserts — SQLite doesn't support skipDuplicates).
 */
export async function initializeWorkforceDefaults(workspaceId: string): Promise<void> {
  // Run sequentially to avoid write contention on SQLite
  for (const dept of DEFAULT_DEPARTMENTS) {
    await prisma.department
      .upsert({
        where: { workspaceId_name: { workspaceId, name: dept.name } },
        update: {},
        create: { workspaceId, ...dept },
      })
      .catch(() => {});
  }

  for (const desig of DEFAULT_DESIGNATIONS) {
    await prisma.designation
      .upsert({
        where: { workspaceId_title: { workspaceId, title: desig.title } },
        update: {},
        create: { workspaceId, ...desig },
      })
      .catch(() => {});
  }

  for (const lt of DEFAULT_LEAVE_TYPES) {
    await prisma.leaveType
      .upsert({
        where: { workspaceId_code: { workspaceId, code: lt.code } },
        update: {},
        create: { workspaceId, ...lt },
      })
      .catch(() => {});
  }

  await prisma.workSchedule
    .upsert({
      where: { workspaceId },
      update: {},
      create: { workspaceId },
    })
    .catch(() => {});

  // Seed recurring holidays for the current year (idempotent).
  // Note: WorkforceHoliday doesn't have a uniqueness constraint, so we guard manually.
  const year = new Date().getFullYear();
  for (const holiday of DEFAULT_HOLIDAYS) {
    const date = new Date(Date.UTC(year, holiday.month - 1, holiday.day, 0, 0, 0, 0));
    const exists = await prisma.workforceHoliday.findFirst({
      where: {
        workspaceId,
        name: holiday.name,
        isRecurring: true,
        year: null,
        date,
      },
      select: { id: true },
    });
    if (exists) continue;
    await prisma.workforceHoliday
      .create({ data: { workspaceId, name: holiday.name, date, isRecurring: true } })
      .catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY AGGREGATION (for dashboard widget)
// ─────────────────────────────────────────────────────────────────────────────

export type WorkforceSummary = {
  totalEmployees: number;
  activeEmployees: number;
  presentToday: number;
  onLeaveToday: number;
  pendingApprovals: number;
  lateToday: number;
  absentToday: number;
  /** Active people on a working day with no record and no leave yet. */
  notMarkedToday: number;
  isWorkingDay: boolean;
  today: string;
  upcomingHolidays: { name: string; date: string }[];
  birthdaysAndJoiners: { newThisMonth: number; leftThisMonth: number };
};

/**
 * Real-time workforce KPIs. "Today" is the workplace's calendar day (its time zone),
 * stored as a UTC-midnight date like every other workforce date.
 */
export async function getWorkforceSummary(workspaceId: string): Promise<WorkforceSummary> {
  const now = new Date();
  const cal = await loadCalendar(workspaceId, now, new Date(now.getTime() + 45 * 86_400_000));
  const today = todayInZone(now, cal.timeZone);
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const working = isWorkingDay(today, cal.workingDays, cal.holidays);

  const [totalEmployees, activeEmployees, attendance, onLeave, pendingApprovals, newThisMonth, leftThisMonth, holidays] = await Promise.all([
    prisma.employee.count({ where: { workspaceId } }),
    prisma.employee.count({ where: { workspaceId, status: { not: 'INACTIVE' } } }),
    prisma.attendanceRecord.groupBy({ by: ['status'], where: { workspaceId, date: today, employee: { status: { not: 'INACTIVE' } } }, _count: { _all: true } }),
    prisma.leaveRequest.findMany({ where: { workspaceId, status: 'APPROVED', startDate: { lte: today }, endDate: { gte: today } }, select: { employeeId: true } }),
    prisma.leaveRequest.count({ where: { workspaceId, status: 'PENDING' } }),
    prisma.employee.count({ where: { workspaceId, joinDate: { gte: monthStart } } }),
    prisma.employee.count({ where: { workspaceId, exitDate: { gte: monthStart, lte: today } } }),
    prisma.workforceHoliday.findMany({ where: { workspaceId }, select: { name: true, date: true, isRecurring: true } }),
  ]);
  const count = (...st: string[]) => attendance.filter((g) => st.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  const onLeaveToday = new Set(onLeave.map((l) => l.employeeId)).size;
  const marked = attendance.reduce((n, g) => n + g._count._all, 0);
  const upcomingHolidays = [...cal.holidays].filter((d) => d >= dayKey(today)).sort().slice(0, 3).map((date) => ({ date, name: holidays.find((h) => dayKey(h.date) === date || (h.isRecurring && dayKey(h.date).slice(5) === date.slice(5)))?.name ?? '' }));
  return {
    totalEmployees, activeEmployees,
    presentToday: count('PRESENT', 'LATE', 'REMOTE'), lateToday: count('LATE'), absentToday: count('ABSENT'),
    onLeaveToday, pendingApprovals,
    notMarkedToday: working ? Math.max(0, activeEmployees - marked - onLeaveToday) : 0,
    isWorkingDay: working, today: dayKey(today), upcomingHolidays,
    birthdaysAndJoiners: { newThisMonth, leftThisMonth },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// EMPLOYEE HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns the Employee record for a given workspace user (self-service lookup).
 * Returns null if no linked employee profile exists.
 */
export async function getEmployeeByUserId(
  workspaceId: string,
  userId: string,
): Promise<{ id: string; firstName: string; lastName: string; status: string } | null> {
  return prisma.employee.findFirst({
    where: { workspaceId, userId },
    select: { id: true, firstName: true, lastName: true, status: true },
  });
}

/**
 * Generates the next employee code in sequence (EMP-001, EMP-002 ...).
 */
export async function generateEmployeeCode(workspaceId: string): Promise<string> {
  // Use a sortable, zero-padded numeric suffix so lexical ordering matches numeric ordering.
  // (EMP-000001, EMP-000002, ...)
  const last = await prisma.employee.findFirst({
    where: {
      workspaceId,
      employeeCode: { startsWith: 'EMP-' },
    },
    select: { employeeCode: true },
    orderBy: { employeeCode: 'desc' },
  });

  const suffix = last?.employeeCode?.slice(4) ?? '';
  const n = Number.parseInt(suffix, 10);
  const next = Number.isFinite(n) ? n + 1 : 1;
  return `EMP-${String(next).padStart(6, '0')}`;
}
