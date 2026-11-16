import { NextResponse } from 'next/server';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse } from '@/app/api/payroll/_http';
import { getRunDetail } from '@/lib/payroll/service/detail';
import { renderPayslip } from '@/lib/payroll/service/payslips';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; lineId: string }> }) {
  try {
    const gate = await requirePayrollModuleAndAction('view');
    if ('response' in gate) return gate.response;
    const { id, lineId } = await ctx.params;
    const run = await getRunDetail(gate.access.workspaceId, gate.access.userId, id);
    const line = run?.lines.find((l) => l.id === lineId);
    if (!run || !line) return NextResponse.json({ code: 'NOT_FOUND', error: 'Payslip not found.' }, { status: 404 });
    const { pdf, filename } = await renderPayslip(gate.access.workspaceId, run, line);
    return new Response(new Uint8Array(pdf), { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${filename}"`, 'Cache-Control': 'no-store' } });
  } catch (e) {
    return payrollErrorResponse(e, 'payslips.get');
  }
}
