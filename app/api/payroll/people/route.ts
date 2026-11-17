import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse, readJson } from '@/app/api/payroll/_http';
import { listPeople } from '@/lib/payroll/service/people';
import { saveCompensation } from '@/lib/payroll/service/compensation';
import { employeeCreateSchema } from '@/lib/payroll/service/schemas';

export async function GET() {
  try {
    const gate = await requirePayrollModuleAndAction('view');
    if ('response' in gate) return gate.response;
    return NextResponse.json(await listPeople(gate.access.workspaceId), { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return payrollErrorResponse(e, 'people.list');
  }
}

/** Adds an employee, optionally with their first pay structure. */
export async function POST(req: Request) {
  try {
    const gate = await requirePayrollModuleAndAction('prepare');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/payroll/people', scope: 'create', max: 60, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const d = employeeCreateSchema.parse(await readJson(req));

    let employee;
    try {
      employee = await prisma.employee.create({
        data: { workspaceId, firstName: d.firstName, lastName: d.lastName, email: d.email, phone: d.phone, employeeCode: d.employeeCode, joinDate: d.joinDate ?? null, exitDate: d.exitDate ?? null, departmentId: d.departmentId || null, designationId: d.designationId || null, location: d.location },
        select: { id: true },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return NextResponse.json({ code: 'DUPLICATE_CODE', error: 'Another employee already uses that employee code.' }, { status: 409 });
      }
      throw err;
    }
    if (d.compensation) await saveCompensation({ workspaceId, employeeId: employee.id, userId, input: d.compensation });
    void logActivity({ workspaceId, action: 'payroll.employee_created', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'employee', id: employee.id }, metadata: { withCompensation: Boolean(d.compensation) } });
    return NextResponse.json({ id: employee.id }, { status: 201 });
  } catch (e) {
    return payrollErrorResponse(e, 'people.create');
  }
}
