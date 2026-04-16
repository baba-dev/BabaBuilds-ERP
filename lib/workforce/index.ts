/**
 * lib/workforce/index.ts
 *
 * Workforce module server utilities.
 * Initialization, summary aggregation, and shared helpers.
 */

import 'server-only';
import { prisma } from '@/lib/prisma';

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

const DEFAULT_HOLIDAYS = [
  { name: 'Republic Day', date: new Date('2026-01-26') },
  { name: 'Independence Day', date: new Date('2026-08-15') },
  { name: 'Gandhi Jayanti', date: new Date('2026-10-02') },
  { name: 'Christmas Day', date: new Date('2026-12-25') },
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

  for (const holiday of DEFAULT_HOLIDAYS) {
    await prisma.workforceHoliday
      .create({ data: { workspaceId, ...holiday, isRecurring: true } })
      .catch(() => {}); // ignore duplicate
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
};

/**
 * Returns real-time workforce KPIs for the dashboard widget.
 * Queries are parallelized and lightweight.
 */
export async function getWorkforceSummary(workspaceId: string): Promise<WorkforceSummary> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const [totalEmployees, activeEmployees, presentToday, onLeaveToday, pendingApprovals] =
    await Promise.all([
      prisma.employee.count({ where: { workspaceId } }),
      prisma.employee.count({ where: { workspaceId, status: 'ACTIVE' } }),
      prisma.attendanceRecord.count({
        where: {
          workspaceId,
          date: { gte: today, lt: tomorrow },
          status: { in: ['PRESENT', 'LATE', 'REMOTE'] },
        },
      }),
      prisma.leaveRequest.count({
        where: {
          workspaceId,
          status: 'APPROVED',
          startDate: { lte: today },
          endDate: { gte: today },
        },
      }),
      prisma.leaveRequest.count({
        where: { workspaceId, status: 'PENDING' },
      }),
    ]);

  return { totalEmployees, activeEmployees, presentToday, onLeaveToday, pendingApprovals };
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
): Promise<{ id: string; firstName: string; lastName: string } | null> {
  return prisma.employee.findFirst({
    where: { workspaceId, userId },
    select: { id: true, firstName: true, lastName: true },
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
