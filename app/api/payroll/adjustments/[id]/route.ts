import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse } from '@/app/api/payroll/_http';

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePayrollModuleAndAction('prepare');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const id = (await ctx.params).id;
    const row = await prisma.payrollAdjustment.findFirst({ where: { id, workspaceId }, include: { period: { select: { status: true } } } });
    if (!row) return NextResponse.json({ code: 'NOT_FOUND', error: 'Adjustment not found.' }, { status: 404 });
    if (row.period.status === 'CLOSED') return NextResponse.json({ code: 'PERIOD_CLOSED', error: 'This pay month is closed.' }, { status: 409 });
    await prisma.payrollAdjustment.delete({ where: { id } });
    void logActivity({ workspaceId, action: 'payroll.adjustment_removed', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'payroll_adjustment', id }, metadata: { kind: row.kind, amount: Number(row.amount) } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return payrollErrorResponse(e, 'adjustments.delete');
  }
}
