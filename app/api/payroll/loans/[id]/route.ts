import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse } from '@/app/api/payroll/_http';

/** Stops recovering a loan (written off or settled outside payroll). */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePayrollModuleAndAction('prepare');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const id = (await ctx.params).id;
    const done = await prisma.employeeLoan.updateMany({ where: { id, workspaceId, status: 'ACTIVE' }, data: { status: 'CLOSED' } });
    if (done.count === 0) return NextResponse.json({ code: 'NOT_FOUND', error: 'No active loan found.' }, { status: 404 });
    void logActivity({ workspaceId, action: 'payroll.loan_closed', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'employee_loan', id }, metadata: {} });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return payrollErrorResponse(e, 'loans.close');
  }
}
