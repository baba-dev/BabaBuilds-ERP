import { NextResponse } from 'next/server';
import { enforceRouteRateLimit } from '@/lib/route-rate-limit';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse, readJson } from '@/app/api/payroll/_http';
import { generateRun } from '@/lib/payroll/service/generate';
import { generateSchema } from '@/lib/payroll/service/schemas';

/** Calculates payroll for a month and saves it as a draft run. Running it again replaces the draft. */
export async function POST(req: Request) {
  try {
    const gate = await requirePayrollModuleAndAction('prepare');
    if ('response' in gate) return gate.response;
    const { workspaceId, userId, email } = gate.access;
    const limit = await enforceRouteRateLimit({ request: req, route: '/api/payroll/runs', scope: 'generate', max: 20, windowMs: 10 * 60_000 });
    if (!limit.ok) return limit.response;
    const d = generateSchema.parse(await readJson(req));
    const out = await generateRun({ workspaceId, userId, userEmail: email, year: d.year, month: d.month, notes: d.notes });
    return NextResponse.json({ runId: out.runId, totals: out.plan.totals, issues: out.plan.issues.length }, { status: 201 });
  } catch (e) {
    return payrollErrorResponse(e, 'runs.generate');
  }
}
