import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse, readJson } from '@/app/api/payroll/_http';
import { monthBounds } from '@/lib/payroll/service/period';
import { adjustmentSchema, periodSchema } from '@/lib/payroll/service/schemas';
import { PayrollRunError } from '@/lib/payroll/service/generate';

export async function GET(req: Request) {
  try {
    const gate = await requirePayrollModuleAndAction('view');
    if ('response' in gate) return gate.response;
    const url = new URL(req.url);
    const p = periodSchema.parse({ year: Number(url.searchParams.get('year')), month: Number(url.searchParams.get('month')) });
    const b = monthBounds(p.year, p.month);
    const period = await prisma.payrollPeriod.findUnique({ where: { workspaceId_startDate_endDate: { workspaceId: gate.access.workspaceId, startDate: b.start, endDate: b.end } }, select: { id: true, status: true } });
    if (!period) return NextResponse.json({ adjustments: [], periodStatus: null });
    const rows = await prisma.payrollAdjustment.findMany({
      where: { workspaceId: gate.access.workspaceId, periodId: period.id },
      include: { employee: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    return NextResponse.json({
      periodStatus: period.status,
      adjustments: rows.map((a) => ({ id: a.id, employeeId: a.employeeId, employee: `${a.employee.firstName} ${a.employee.lastName}`.trim(), kind: a.kind, label: a.label, amount: Number(a.amount), taxable: a.taxable, note: a.note, createdAt: a.createdAt.toISOString() })),
    });
  } catch (e) {
    return payrollErrorResponse(e, 'adjustments.list');
  }
}

/** One-off bonus, arrears, reimbursement, deduction or loss-of-pay days for a pay month. */
export async function POST(req: Request) {
  try {
    const gate = await requirePayrollModuleAndAction('prepare');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const d = adjustmentSchema.parse(await readJson(req));
    const employee = await prisma.employee.findFirst({ where: { id: d.employeeId, workspaceId }, select: { id: true } });
    if (!employee) return NextResponse.json({ code: 'NOT_FOUND', error: 'Employee not found.' }, { status: 404 });
    const b = monthBounds(d.year, d.month);
    const period = await prisma.payrollPeriod.upsert({ where: { workspaceId_startDate_endDate: { workspaceId, startDate: b.start, endDate: b.end } }, update: {}, create: { workspaceId, startDate: b.start, endDate: b.end } });
    if (period.status === 'CLOSED') throw new PayrollRunError('PERIOD_CLOSED', 'This pay month is closed.');
    if (d.kind === 'LOP_DAYS' && d.amount > 31) return NextResponse.json({ code: 'INVALID_INPUT', error: 'A month has at most 31 days.' }, { status: 422 });
    const row = await prisma.payrollAdjustment.create({
      data: { workspaceId, periodId: period.id, employeeId: d.employeeId, kind: d.kind, code: d.kind, label: d.label, amount: d.amount, taxable: d.kind === 'REIMBURSEMENT' ? false : d.taxable, note: d.note, createdByUserId: userId },
      select: { id: true },
    });
    void logActivity({ workspaceId, action: 'payroll.adjustment_added', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'payroll_adjustment', id: row.id }, metadata: { kind: d.kind, amount: d.amount, employeeId: d.employeeId } });
    const run = await prisma.payrollRun.findFirst({ where: { periodId: period.id }, orderBy: { version: 'desc' }, select: { status: true } });
    return NextResponse.json({ id: row.id, needsRegenerate: Boolean(run) }, { status: 201 });
  } catch (e) {
    return payrollErrorResponse(e, 'adjustments.create');
  }
}
