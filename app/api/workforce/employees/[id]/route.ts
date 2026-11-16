/**
 * GET    — employee detail
 * PATCH  — update employee
 * DELETE — end employment (same as offboarding with today as the last day)
 */
import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { utcDay } from '@/lib/workforce/calendar';
import { offboardEmployee, validateEmployeeLinks } from '@/lib/workforce/employee-service';
import { LeaveError } from '@/lib/workforce/leave-service';
import { employeePatchSchema } from '@/lib/workforce/schemas';
import { readJson, requireWorkforce, workforceErrorResponse } from '../../_guard';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Ctx) {
  try {
    const g = await requireWorkforce('workforce.people.view');
    if ('response' in g) return g.response;
    const { id } = await params;
    const employee = await prisma.employee.findFirst({
      where: { id, workspaceId: g.access.workspaceId },
      include: {
        department: true,
        designation: true,
        manager: { select: { id: true, firstName: true, lastName: true, designation: { select: { title: true } } } },
        directReports: { select: { id: true, firstName: true, lastName: true, status: true, designation: { select: { title: true } } } },
        attendanceRecords: { orderBy: { date: 'desc' }, take: 30 },
        leaveRequests: { orderBy: { createdAt: 'desc' }, take: 10, include: { leaveType: true } },
        leaveBalances: { where: { year: new Date().getUTCFullYear() }, include: { leaveType: true } },
      },
    });
    if (!employee) throw new LeaveError('NOT_FOUND', 'Employee not found.', 404);
    return NextResponse.json(employee);
  } catch (error) {
    return workforceErrorResponse(error, 'employee.get');
  }
}

export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const g = await requireWorkforce('workforce.people.manage');
    if ('response' in g) return g.response;
    const { workspaceId, userId, email } = g.access;
    const { id } = await params;
    const d = employeePatchSchema.parse(await readJson(req));
    const existing = await prisma.employee.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!existing) throw new LeaveError('NOT_FOUND', 'Employee not found.', 404);
    await validateEmployeeLinks(workspaceId, d, id);
    const { joinDate, exitDate, ...rest } = d;
    const data = {
      ...rest,
      ...(joinDate !== undefined ? { joinDate: joinDate ? utcDay(joinDate) : null } : {}),
      ...(exitDate !== undefined ? { exitDate: exitDate ? utcDay(exitDate) : null } : {}),
    };
    const employee = await prisma.employee.update({ where: { id }, data, include: { department: true, designation: true } });
    void logActivity({ workspaceId, action: 'workforce.employee_updated', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'employee', id }, metadata: { fields: Object.keys(d) } });
    return NextResponse.json(employee);
  } catch (error) {
    return workforceErrorResponse(error, 'employee.patch');
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const g = await requireWorkforce('workforce.people.manage');
    if ('response' in g) return g.response;
    const { id } = await params;
    const result = await offboardEmployee({ workspaceId: g.access.workspaceId, employeeId: id, exitDate: new Date().toISOString().slice(0, 10) });
    void logActivity({ workspaceId: g.access.workspaceId, action: 'workforce.employee_offboarded', status: 'SUCCESS', actor: { userId: g.access.userId, email: g.access.email }, entity: { type: 'employee', id }, metadata: { cancelledLeave: result.cancelledLeave } });
    return NextResponse.json({ success: true, cancelledLeave: result.cancelledLeave });
  } catch (error) {
    return workforceErrorResponse(error, 'employee.delete');
  }
}
