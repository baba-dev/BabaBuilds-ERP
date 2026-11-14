import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse } from '@/app/api/payroll/_http';
import { PAYROLL_KIND_LABEL } from '@/lib/payroll/service/period';

/** What is owed to government from payroll, and what has been paid. */
export async function GET() {
  try {
    const gate = await requirePayrollModuleAndAction('view');
    if ('response' in gate) return gate.response;
    const rows = await prisma.payrollRemittance.findMany({ where: { workspaceId: gate.access.workspaceId }, include: { period: { select: { startDate: true } } }, orderBy: { dueDate: 'desc' }, take: 120 });
    const now = Date.now();
    const items = rows.map((r) => ({
      id: r.id, kind: r.kind, label: PAYROLL_KIND_LABEL[r.kind as keyof typeof PAYROLL_KIND_LABEL] ?? r.kind, amount: Number(r.amount), dueDate: r.dueDate.toISOString(),
      status: r.status, overdue: r.status === 'DUE' && r.dueDate.getTime() < now, paidAt: r.paidAt?.toISOString() ?? null, reference: r.reference, period: r.period.startDate.toISOString(), runId: r.runId,
    }));
    const due = items.filter((i) => i.status === 'DUE');
    return NextResponse.json({ items, summary: { dueCount: due.length, dueAmount: Math.round(due.reduce((s, i) => s + i.amount, 0) * 100) / 100, overdueCount: due.filter((i) => i.overdue).length } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return payrollErrorResponse(e, 'remittances.list');
  }
}
