import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse, readJson } from '@/app/api/payroll/_http';
import { getPerson } from '@/lib/payroll/service/people';
import { PayrollNotFoundError, saveCompensation } from '@/lib/payroll/service/compensation';
import { compensationSchema, employeeUpdateSchema } from '@/lib/payroll/service/schemas';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  try {
    const gate = await requirePayrollModuleAndAction('view');
    if ('response' in gate) return gate.response;
    const person = await getPerson(gate.access.workspaceId, (await ctx.params).id);
    if (!person) throw new PayrollNotFoundError('Employee not found.');
    return NextResponse.json(person, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return payrollErrorResponse(e, 'people.get');
  }
}

/** Edits the employee record (name, dates, department, status). */
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const gate = await requirePayrollModuleAndAction('prepare');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const id = (await ctx.params).id;
    const d = employeeUpdateSchema.parse(await readJson(req));
    const found = await prisma.employee.findFirst({ where: { id, workspaceId }, select: { id: true } });
    if (!found) throw new PayrollNotFoundError('Employee not found.');
    await prisma.employee.update({
      where: { id },
      data: {
        ...(d.firstName !== undefined && { firstName: d.firstName }), ...(d.lastName !== undefined && { lastName: d.lastName }),
        ...(d.email !== undefined && { email: d.email }), ...(d.phone !== undefined && { phone: d.phone }),
        ...(d.employeeCode !== undefined && { employeeCode: d.employeeCode }), ...(d.joinDate !== undefined && { joinDate: d.joinDate }),
        ...(d.exitDate !== undefined && { exitDate: d.exitDate }), ...(d.departmentId !== undefined && { departmentId: d.departmentId || null }),
        ...(d.designationId !== undefined && { designationId: d.designationId || null }), ...(d.location !== undefined && { location: d.location }),
        ...(d.status !== undefined && { status: d.status }),
      },
    });
    void logActivity({ workspaceId, action: 'payroll.employee_updated', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'employee', id }, metadata: { fields: Object.keys(d) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return payrollErrorResponse(e, 'people.update');
  }
}

/** Saves a new pay structure revision. PAN and bank details are encrypted; leave them blank to keep the old ones. */
export async function PUT(req: Request, ctx: Ctx) {
  try {
    const gate = await requirePayrollModuleAndAction('prepare');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const id = (await ctx.params).id;
    const input = compensationSchema.parse(await readJson(req));
    await saveCompensation({ workspaceId, employeeId: id, userId, input });
    void logActivity({ workspaceId, action: 'payroll.compensation_saved', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'employee', id }, metadata: { annualCtc: input.annualCtc, effectiveFrom: input.effectiveFrom.toISOString().slice(0, 10), regime: input.taxRegime } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return payrollErrorResponse(e, 'people.compensation');
  }
}
