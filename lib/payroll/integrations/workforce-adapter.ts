import 'server-only';

import { isModuleEnabled } from '@/lib/modules';
import { prisma } from '@/lib/prisma';

export type PayrollAdapterSource = 'WORKFORCE' | 'STANDALONE';

export type PayrollAdapterStatus = {
  workforceModuleEnabled: boolean;
  source: PayrollAdapterSource;
  badgeLabel: string;
};

export type PayrollEmployeeInput = {
  employeeId: string;
  employeeCode: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  status: string;
  joinDate: Date | null;
  exitDate: Date | null;
  departmentId: string | null;
  designationId: string | null;
};

export type PayrollAttendanceInput = {
  employeeId: string;
  date: Date;
  status: string;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  workedMinutes: number | null;
};

export type PayrollApprovedLeaveInput = {
  employeeId: string;
  leaveRequestId: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  startDate: Date;
  endDate: Date;
  days: number;
  isPaid: boolean;
};

export type PayrollDepartmentInput = {
  id: string;
  name: string;
};

export type PayrollDesignationInput = {
  id: string;
  title: string;
  level: number | null;
};

export type PayrollNormalizedInputBundle = {
  status: PayrollAdapterStatus;
  employees: PayrollEmployeeInput[];
  attendance: PayrollAttendanceInput[];
  approvedLeave: PayrollApprovedLeaveInput[];
  orgMapping: {
    departments: PayrollDepartmentInput[];
    designations: PayrollDesignationInput[];
  };
};

export type PayrollInputRange = {
  periodStart: Date;
  periodEnd: Date;
};

function normalizeWorkedMinutes(checkInAt: Date | null, checkOutAt: Date | null): number | null {
  if (!checkInAt || !checkOutAt) return null;
  const delta = checkOutAt.getTime() - checkInAt.getTime();
  if (delta <= 0) return null;
  return Math.floor(delta / 60000);
}

export async function getPayrollAdapterStatus(workspaceId: string): Promise<PayrollAdapterStatus> {
  const workforceModuleEnabled = await isModuleEnabled(workspaceId, 'WORKFORCE');
  return {
    workforceModuleEnabled,
    source: workforceModuleEnabled ? 'WORKFORCE' : 'STANDALONE',
    badgeLabel: workforceModuleEnabled ? 'Workforce sync active' : 'Standalone payroll mode',
  };
}

async function loadFromWorkforce(
  workspaceId: string,
  range: PayrollInputRange,
  status: PayrollAdapterStatus,
): Promise<PayrollNormalizedInputBundle> {
  const [employees, attendance, approvedLeave, departments, designations] = await Promise.all([
    prisma.employee.findMany({
      where: { workspaceId },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        email: true,
        status: true,
        joinDate: true,
        exitDate: true,
        departmentId: true,
        designationId: true,
      },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    }),
    prisma.attendanceRecord.findMany({
      where: {
        workspaceId,
        date: { gte: range.periodStart, lte: range.periodEnd },
      },
      select: {
        employeeId: true,
        date: true,
        status: true,
        checkInAt: true,
        checkOutAt: true,
      },
      orderBy: [{ date: 'asc' }, { employeeId: 'asc' }],
    }),
    prisma.leaveRequest.findMany({
      where: {
        workspaceId,
        status: 'APPROVED',
        startDate: { lte: range.periodEnd },
        endDate: { gte: range.periodStart },
      },
      select: {
        id: true,
        employeeId: true,
        startDate: true,
        endDate: true,
        days: true,
        leaveType: {
          select: {
            code: true,
            name: true,
            isPaid: true,
          },
        },
      },
      orderBy: [{ startDate: 'asc' }, { employeeId: 'asc' }],
    }),
    prisma.department.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.designation.findMany({
      where: { workspaceId },
      select: { id: true, title: true, level: true },
      orderBy: [{ level: 'asc' }, { title: 'asc' }],
    }),
  ]);

  return {
    status,
    employees: employees.map((employee) => ({
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      email: employee.email,
      status: employee.status,
      joinDate: employee.joinDate,
      exitDate: employee.exitDate,
      departmentId: employee.departmentId,
      designationId: employee.designationId,
    })),
    attendance: attendance.map((row) => ({
      employeeId: row.employeeId,
      date: row.date,
      status: row.status,
      checkInAt: row.checkInAt,
      checkOutAt: row.checkOutAt,
      workedMinutes: normalizeWorkedMinutes(row.checkInAt, row.checkOutAt),
    })),
    approvedLeave: approvedLeave.map((leave) => ({
      employeeId: leave.employeeId,
      leaveRequestId: leave.id,
      leaveTypeCode: leave.leaveType.code,
      leaveTypeName: leave.leaveType.name,
      startDate: leave.startDate,
      endDate: leave.endDate,
      days: leave.days,
      isPaid: leave.leaveType.isPaid,
    })),
    orgMapping: {
      departments,
      designations,
    },
  };
}

async function loadStandalonePayrollEmployees(
  workspaceId: string,
  status: PayrollAdapterStatus,
): Promise<PayrollNormalizedInputBundle> {
  const workspaceUsers = await prisma.workspaceUser.findMany({
    where: { workspaceId, isActive: true },
    select: {
      userId: true,
      joinedAt: true,
      user: {
        select: {
          name: true,
          email: true,
        },
      },
    },
    orderBy: { joinedAt: 'asc' },
  });

  const employees = workspaceUsers.map((member) => {
    const [firstName = 'Team', ...rest] = (member.user.name?.trim() || '').split(/\s+/).filter(Boolean);
    return {
      employeeId: member.userId,
      employeeCode: null,
      firstName,
      lastName: rest.join(' ') || 'Member',
      email: member.user.email,
      status: 'ACTIVE',
      joinDate: member.joinedAt,
      exitDate: null,
      departmentId: null,
      designationId: null,
    } satisfies PayrollEmployeeInput;
  });

  return {
    status,
    employees,
    attendance: [],
    approvedLeave: [],
    orgMapping: {
      departments: [],
      designations: [],
    },
  };
}

export async function getNormalizedPayrollInputs(
  workspaceId: string,
  range: PayrollInputRange,
): Promise<PayrollNormalizedInputBundle> {
  const status = await getPayrollAdapterStatus(workspaceId);

  if (status.workforceModuleEnabled) {
    return loadFromWorkforce(workspaceId, range, status);
  }

  return loadStandalonePayrollEmployees(workspaceId, status);
}
