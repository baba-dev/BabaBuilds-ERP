import 'server-only';
import { prisma } from '@/lib/prisma';
import { buildWorkforceReport, type WorkforceReport } from '@/lib/workforce/report-math';

/** Builds the workforce analytics report for one workspace over [from, to] (inclusive days). */
export async function getWorkforceReport(workspaceId: string, from: Date, to: Date): Promise<WorkforceReport> {
  const toExclusive = new Date(to.getTime() + 24 * 60 * 60 * 1000);

  const [employees, attendance, leave] = await Promise.all([
    prisma.employee.findMany({
      where: { workspaceId },
      select: {
        id: true,
        joinDate: true,
        exitDate: true,
        createdAt: true,
        status: true,
        department: { select: { name: true } },
      },
    }),
    prisma.attendanceRecord.findMany({
      where: { workspaceId, date: { gte: from, lt: toExclusive } },
      select: { employeeId: true, date: true, status: true },
    }),
    prisma.leaveRequest.findMany({
      where: { workspaceId, startDate: { gte: from, lt: toExclusive } },
      select: {
        startDate: true,
        days: true,
        status: true,
        leaveType: { select: { id: true, name: true, code: true } },
      },
    }),
  ]);

  return buildWorkforceReport({
    from,
    to,
    employees: employees.map((e) => ({
      id: e.id,
      joinDate: e.joinDate,
      exitDate: e.exitDate,
      createdAt: e.createdAt,
      status: e.status,
      departmentName: e.department?.name ?? null,
    })),
    attendance,
    leave: leave.map((l) => ({
      startDate: l.startDate,
      days: l.days,
      status: l.status,
      leaveTypeId: l.leaveType.id,
      leaveTypeName: l.leaveType.name,
      leaveTypeCode: l.leaveType.code,
    })),
  });
}
