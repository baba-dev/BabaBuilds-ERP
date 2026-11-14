import { NextResponse } from 'next/server';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse } from '@/app/api/payroll/_http';
import { postPayrollRun } from '@/lib/payroll/posting';

/** Books an approved run to the ledger. Amounts always come from the stored run, never from the request. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePayrollModuleAndAction('post');
    if ('response' in gate) return gate.response;
    const limit = enforceRouteRateLimit({ request: req, route: '/api/payroll/runs/post', scope: 'post', max: 20, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const out = await postPayrollRun({ workspaceId: gate.access.workspaceId, runId: (await ctx.params).id, userId: gate.access.userId, userEmail: gate.access.email });
    return NextResponse.json({ ok: true, replayed: out.replayed, accountingTransactionId: out.transactionId, journalReference: out.journalReference });
  } catch (e) {
    return payrollErrorResponse(e, 'runs.post');
  }
}
