import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse } from '@/app/api/payroll/_http';
import { getRunDetail } from '@/lib/payroll/service/detail';
import { bankAdvice, esiSheet, pfEcr, registerWorkbook } from '@/lib/payroll/service/exports';

const TYPES = ['bank', 'ecr', 'esi', 'register'] as const;

/** Downloads: bank upload sheet, EPFO ECR file, ESI sheet, or the payroll register. Bank, ECR and ESI contain personal data, so they need the post permission. */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const type = new URL(req.url).searchParams.get('type') as (typeof TYPES)[number] | null;
    if (!type || !TYPES.includes(type)) return NextResponse.json({ code: 'INVALID_INPUT', error: 'Choose bank, ecr, esi or register.' }, { status: 422 });
    const gate = await requirePayrollModuleAndAction(type === 'register' ? 'view' : 'post');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = enforceRouteRateLimit({ request: req, route: '/api/payroll/runs/export', scope: type, max: 30, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const run = await getRunDetail(workspaceId, userId, (await ctx.params).id);
    if (!run) return NextResponse.json({ code: 'NOT_FOUND', error: 'Payroll run not found.' }, { status: 404 });
    if (type !== 'register' && run.status !== 'APPROVED' && run.status !== 'POSTED') return NextResponse.json({ code: 'NOT_APPROVED', error: 'Approve the run before downloading this file.' }, { status: 409 });
    const stamp = run.period.startDate.slice(0, 7);
    void logActivity({ workspaceId, action: `payroll.export_${type}`, status: 'SUCCESS', actor: { userId, email }, entity: { type: 'payroll_run', id: run.id }, metadata: { lines: run.lines.length } });
    const headers = (name: string, mime: string, extra: Record<string, string> = {}) => ({ 'Content-Type': mime, 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', ...extra });

    if (type === 'bank') {
      const out = await bankAdvice(workspaceId, run);
      return new Response(out.csv, { headers: headers(`bank-advice-${stamp}.csv`, 'text/csv; charset=utf-8', { 'X-Payroll-Count': String(out.count), 'X-Payroll-Skipped': String(out.skipped.length) }) });
    }
    if (type === 'ecr') {
      const out = await pfEcr(workspaceId, run);
      return new Response(out.text, { headers: headers(`pf-ecr-${stamp}.txt`, 'text/plain; charset=utf-8', { 'X-Payroll-Count': String(out.count), 'X-Payroll-Skipped': String(out.skipped.length) }) });
    }
    if (type === 'esi') {
      const out = await esiSheet(workspaceId, run);
      return new Response(out.csv, { headers: headers(`esi-contribution-${stamp}.csv`, 'text/csv; charset=utf-8', { 'X-Payroll-Count': String(out.count), 'X-Payroll-Skipped': String(out.skipped.length) }) });
    }
    const [profile, ws] = await Promise.all([prisma.businessProfile.findUnique({ where: { workspaceId }, select: { companyName: true } }), prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } })]);
    const buf = await registerWorkbook(run, profile?.companyName ?? ws?.name ?? 'Company');
    return new Response(new Uint8Array(buf), { headers: headers(`payroll-register-${stamp}.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') });
  } catch (e) {
    return payrollErrorResponse(e, 'runs.export');
  }
}
