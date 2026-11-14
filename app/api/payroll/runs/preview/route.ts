import { NextResponse } from 'next/server';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse, readJson } from '@/app/api/payroll/_http';
import { buildRunPlan } from '@/lib/payroll/service/plan';
import { periodSchema } from '@/lib/payroll/service/schemas';

/** Shows what a run would look like, with its pre-flight findings, without saving anything. */
export async function POST(req: Request) {
  try {
    const gate = await requirePayrollModuleAndAction('prepare');
    if ('response' in gate) return gate.response;
    const d = periodSchema.parse(await readJson(req));
    const plan = await buildRunPlan({ workspaceId: gate.access.workspaceId, year: d.year, month: d.month });
    return NextResponse.json({
      period: { start: plan.bounds.startIso, end: plan.bounds.endIso, fy: plan.fyLabel }, workforceLinked: plan.workforceLinked,
      headcount: plan.headcount, totals: plan.totals, issues: plan.issues, variance: plan.variance.slice(0, 20),
      people: plan.lines.map((l) => ({ id: l.employeeId, name: `${l.employee.firstName} ${l.employee.lastName}`.trim(), gross: l.result.totals.gross, net: l.result.totals.netPay, lopDays: l.result.period.lopDays })),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return payrollErrorResponse(e, 'runs.preview');
  }
}
