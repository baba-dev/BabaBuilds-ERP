import { NextResponse } from 'next/server';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse, readJson } from '@/app/api/payroll/_http';
import { transitionRun } from '@/lib/payroll/service/lifecycle';
import { transitionSchema } from '@/lib/payroll/service/schemas';

/** Submit for review, approve, or send back. Approval needs the approve permission and, except for owners, a different person than the preparer. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const d = transitionSchema.parse(await readJson(req));
    const gate = await requirePayrollModuleAndAction(d.action === 'approve' ? 'approve' : 'prepare');
    if ('response' in gate) return gate.response;
    const out = await transitionRun({ workspaceId: gate.access.workspaceId, runId: (await ctx.params).id, userId: gate.access.userId, email: gate.access.email, action: d.action, note: d.note, request: req });
    return NextResponse.json(out);
  } catch (e) {
    return payrollErrorResponse(e, 'runs.transition');
  }
}
