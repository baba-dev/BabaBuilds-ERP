import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/modules';
import { resolveSessionMembership } from '@/lib/workspace-scope';

/** An employee's own approved payslips. No payroll permission is needed because it only ever returns the signed-in person's own pay. */
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const workspaceId = userId ? (await resolveSessionMembership(session))?.workspaceId : null;
  if (!userId || !workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isModuleEnabled(workspaceId, 'PAYROLL'))) return NextResponse.json({ items: [], linked: false });
  const employees = await prisma.employee.findMany({ where: { workspaceId, userId }, select: { id: true } });
  if (employees.length === 0) return NextResponse.json({ items: [], linked: false });
  const lines = await prisma.payrollLineItem.findMany({
    where: { employeeSnapshot: { employeeId: { in: employees.map((e) => e.id) } }, run: { workspaceId, status: { in: ['APPROVED', 'POSTED'] } } },
    select: { id: true, runId: true, earnings: true, deductions: true, netPay: true, paidAt: true, run: { select: { period: { select: { startDate: true } } } } },
    orderBy: { run: { period: { startDate: 'desc' } } }, take: 36,
  });
  return NextResponse.json({ linked: true, items: lines.map((l) => ({ lineId: l.id, runId: l.runId, month: l.run.period.startDate.toISOString(), gross: Number(l.earnings), deductions: Number(l.deductions), netPay: Number(l.netPay), paidAt: l.paidAt?.toISOString() ?? null })) }, { headers: { 'Cache-Control': 'no-store' } });
}
