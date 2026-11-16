import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isModuleEnabled } from '@/lib/modules';
import { resolveSessionMembership } from '@/lib/workspace-scope';
import { getRunDetail } from '@/lib/payroll/service/detail';
import { renderPayslip } from '@/lib/payroll/service/payslips';

/** Downloads one of the signed-in employee's own payslips as a PDF. */
export async function GET(_req: Request, ctx: { params: Promise<{ lineId: string }> }) {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const workspaceId = userId ? (await resolveSessionMembership(session))?.workspaceId : null;
  if (!userId || !workspaceId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!(await isModuleEnabled(workspaceId, 'PAYROLL'))) return NextResponse.json({ code: 'NOT_FOUND', error: 'Payslip not found.' }, { status: 404 });
  const { lineId } = await ctx.params;
  const own = await prisma.payrollLineItem.findFirst({
    where: { id: lineId, run: { workspaceId, status: { in: ['APPROVED', 'POSTED'] } }, employeeSnapshot: { employeeId: { in: (await prisma.employee.findMany({ where: { workspaceId, userId }, select: { id: true } })).map((e) => e.id) } } },
    select: { runId: true },
  });
  if (!own) return NextResponse.json({ code: 'NOT_FOUND', error: 'Payslip not found.' }, { status: 404 });
  const run = await getRunDetail(workspaceId, userId, own.runId);
  const line = run?.lines.find((l) => l.id === lineId);
  if (!run || !line) return NextResponse.json({ code: 'NOT_FOUND', error: 'Payslip not found.' }, { status: 404 });
  const { pdf, filename } = await renderPayslip(workspaceId, run, line);
  return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'no-store' } });
}
