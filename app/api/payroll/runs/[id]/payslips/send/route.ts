import { NextResponse } from 'next/server';
import { z } from 'zod';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { logActivity } from '@/lib/security/activity-log';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse, readJson } from '@/app/api/payroll/_http';
import { sendPayslips } from '@/lib/payroll/service/payslips';

const body = z.object({ lineIds: z.array(z.string().max(40)).max(2000).optional(), resend: z.boolean().optional() });

/** Emails each employee their own payslip. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requirePayrollModuleAndAction('post');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = enforceRouteRateLimit({ request: req, route: '/api/payroll/payslips/send', scope: 'send', max: 10, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const d = body.parse((await readJson(req)) ?? {});
    const id = (await ctx.params).id;
    const out = await sendPayslips({ workspaceId, runId: id, userId, lineIds: d.lineIds, resend: d.resend });
    void logActivity({ workspaceId, action: 'payroll.payslips_sent', status: 'SUCCESS', actor: { userId, email }, entity: { type: 'payroll_run', id }, metadata: { sent: out.sent, skipped: out.skipped.length, failed: out.failed.length } });
    return NextResponse.json(out);
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === 'SMTP_NOT_CONFIGURED' || code === 'NOT_APPROVED') return NextResponse.json({ code, error: (e as Error).message }, { status: 409 });
    if (code === 'NOT_FOUND') return NextResponse.json({ code, error: (e as Error).message }, { status: 404 });
    return payrollErrorResponse(e, 'payslips.send');
  }
}
