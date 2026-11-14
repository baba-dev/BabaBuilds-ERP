import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse, readJson } from '@/app/api/payroll/_http';
import { monthBounds } from '@/lib/payroll/service/period';
import { loanSchema } from '@/lib/payroll/service/schemas';

export async function GET() {
  try {
    const gate = await requirePayrollModuleAndAction('view');
    if ('response' in gate) return gate.response;
    const rows = await prisma.employeeLoan.findMany({ where: { workspaceId: gate.access.workspaceId }, include: { employee: { select: { firstName: true, lastName: true } } }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 300 });
    return NextResponse.json({ loans: rows.map((l) => ({ id: l.id, employeeId: l.employeeId, employee: `${l.employee.firstName} ${l.employee.lastName}`.trim(), label: l.label, principal: Number(l.principal), emi: Number(l.emi), outstanding: Number(l.outstanding), status: l.status, startPeriod: l.startPeriod.toISOString() })) });
  } catch (e) {
    return payrollErrorResponse(e, 'loans.list');
  }
}

/** A salary advance or loan recovered in fixed monthly instalments through payroll. */
export async function POST(req: Request) {
  try {
    const gate = await requirePayrollModuleAndAction('prepare');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const d = loanSchema.parse(await readJson(req));
    if (d.emi > d.principal) return NextResponse.json({ code: 'INVALID_INPUT', error: 'The instalment cannot be more than the amount lent.' }, { status: 422 });
    const employee = await prisma.employee.findFirst({ where: { id: d.employeeId, workspaceId }, select: { id: true } });
    if (!employee) return NextResponse.json({ code: 'NOT_FOUND', error: 'Employee not found.' }, { status: 404 });
    const loan = await prisma.employeeLoan.create({
      data: { workspaceId, employeeId: d.employeeId, label: d.label, principal: d.principal, emi: d.emi, outstanding: d.principal, startPeriod: monthBounds(d.startYear, d.startMonth).start, note: d.note, createdByUserId: userId },
      select: { id: true },
    });
    void logActivity({ workspaceId, action: 'payroll.loan_created', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'employee_loan', id: loan.id }, metadata: { principal: d.principal, emi: d.emi } });
    return NextResponse.json({ id: loan.id }, { status: 201 });
  } catch (e) {
    return payrollErrorResponse(e, 'loans.create');
  }
}
