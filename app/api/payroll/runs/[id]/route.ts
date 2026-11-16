import { NextResponse } from 'next/server';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse } from '@/app/api/payroll/_http';
import { getRunDetail } from '@/lib/payroll/service/detail';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePayrollModuleAndAction('view');
    if ('response' in gate) return gate.response;
    const detail = await getRunDetail(gate.access.workspaceId, gate.access.userId, (await ctx.params).id);
    if (!detail) return NextResponse.json({ code: 'NOT_FOUND', error: 'Payroll run not found.' }, { status: 404 });
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return payrollErrorResponse(e, 'runs.get');
  }
}
