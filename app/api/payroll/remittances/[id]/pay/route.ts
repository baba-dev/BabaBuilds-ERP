import { NextResponse } from 'next/server';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse, readJson } from '@/app/api/payroll/_http';
import { payRemittance } from '@/lib/payroll/posting';
import { payBody } from '@/lib/payroll/service/schemas';

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePayrollModuleAndAction('post');
    if ('response' in gate) return gate.response;
    const d = payBody.parse((await readJson(req)) ?? {});
    const out = await payRemittance({ workspaceId: gate.access.workspaceId, remittanceId: (await ctx.params).id, userId: gate.access.userId, userEmail: gate.access.email, reference: d.reference, paidOn: d.paidOn });
    return NextResponse.json(out);
  } catch (e) {
    return payrollErrorResponse(e, 'remittances.pay');
  }
}
