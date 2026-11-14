import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requirePayrollModuleAndAction } from '@/app/api/payroll/_context';
import { payrollErrorResponse } from '@/app/api/payroll/_http';
import { getPayrollAdapterStatus } from '@/lib/payroll/integrations/workforce-adapter';
import { listPeople } from '@/lib/payroll/service/people';
import { fyOf, PAYROLL_KIND_LABEL } from '@/lib/payroll/service/period';
import { checkPermissionsSilent } from '@/lib/rbac';
import type { PayrollIssue } from '@/lib/payroll/service/checks';

const n = (v: unknown) => Number(v ?? 0);
const r2 = (v: number) => Math.round(v * 100) / 100;

export async function GET() {
  try {
    const gate = await requirePayrollModuleAndAction('view');
    if ('response' in gate) return gate.response;
    const { workspaceId } = gate.access;
    const now = new Date();
    const fy = fyOf(now);

    const [adapter, perms, periods, remittances, people] = await Promise.all([
      getPayrollAdapterStatus(workspaceId),
      checkPermissionsSilent(gate.access.userId, workspaceId, ['payroll.prepare', 'payroll.approve', 'payroll.post', 'payroll.settings.manage']),
      prisma.payrollPeriod.findMany({
        where: { workspaceId }, orderBy: { startDate: 'desc' }, take: 18,
        include: { runs: { orderBy: { version: 'desc' }, take: 1, include: { _count: { select: { lineItems: true } } } } },
      }),
      prisma.payrollRemittance.findMany({ where: { workspaceId, status: 'DUE' }, orderBy: { dueDate: 'asc' }, take: 8 }),
      listPeople(workspaceId, now),
    ]);

    const periodItems = periods.map((p) => {
      const run = p.runs[0] ?? null;
      const issues = ((run?.preflightJson ?? {}) as { issues?: PayrollIssue[] }).issues ?? [];
      return {
        id: p.id, startDate: p.startDate.toISOString(), endDate: p.endDate.toISOString(), status: p.status,
        run: run ? { id: run.id, version: run.version, status: run.status, gross: n(run.totalEarnings), deductions: n(run.totalDeductions), employerCost: n(run.totalEmployerCosts), netPay: n(run.totalNetPay), headcount: run._count.lineItems, generatedAt: run.generatedAt.toISOString(), disbursed: Boolean(run.disbursedAt), errors: issues.filter((i) => i.severity === 'error').length, warnings: issues.filter((i) => i.severity === 'warning').length } : null,
      };
    });

    // Which month to run next: the month after the latest posted one, or this month when nothing has been posted.
    const lastPosted = periods.find((p) => p.runs[0]?.status === 'POSTED');
    const open = periods.filter((p) => p.runs[0] && p.runs[0].status !== 'POSTED').sort((a, b) => a.startDate.getTime() - b.startDate.getTime())[0];
    const base = lastPosted ? new Date(Date.UTC(lastPosted.startDate.getUTCFullYear(), lastPosted.startDate.getUTCMonth() + 1, 1)) : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const next = open ? { year: open.startDate.getUTCFullYear(), month: open.startDate.getUTCMonth() + 1, inProgress: true, runId: open.runs[0]!.id, status: open.runs[0]!.status } : { year: base.getUTCFullYear(), month: base.getUTCMonth() + 1, inProgress: false, runId: null, status: null };

    const fyRuns = periodItems.filter((p) => p.run && ['APPROVED', 'POSTED'].includes(p.run.status) && new Date(p.startDate) >= fy.start);
    const sum = (f: (r: NonNullable<(typeof periodItems)[number]['run']>) => number) => r2(fyRuns.reduce((s, p) => s + f(p.run!), 0));

    const latest = periodItems.find((p) => p.run && p.run.headcount > 0) ?? null;
    const dept = latest?.run
      ? await prisma.payrollCostAllocation.groupBy({ by: ['departmentCode'], where: { lineItem: { runId: latest.run.id } }, _sum: { allocatedAmount: true } })
      : [];

    const statutoryDue = remittances.map((r) => ({ id: r.id, kind: r.kind, label: PAYROLL_KIND_LABEL[r.kind as keyof typeof PAYROLL_KIND_LABEL] ?? r.kind, amount: n(r.amount), dueDate: r.dueDate.toISOString(), overdue: r.dueDate.getTime() < now.getTime() }));

    const readiness = { ready: 0, attention: 0, none: 0, inactive: 0 };
    for (const p of people.people) {
      if (p.status === 'INACTIVE' && !p.exitDate) { readiness.inactive += 1; continue; }
      if (p.readiness === 'READY') readiness.ready += 1;
      else if (p.readiness === 'ATTENTION') readiness.attention += 1;
      else readiness.none += 1;
    }

    return NextResponse.json({
      adapterStatus: adapter, fy: fy.label, next,
      perms: { prepare: perms['payroll.prepare'], approve: perms['payroll.approve'], post: perms['payroll.post'], settings: perms['payroll.settings.manage'] },
      kpis: { gross: sum((r) => r.gross), netPay: sum((r) => r.netPay), employerCost: sum((r) => r.employerCost), deductions: sum((r) => r.deductions), runCount: fyRuns.length, headcount: readiness.ready + readiness.attention, avgCostPerHead: latest?.run && latest.run.headcount > 0 ? r2((latest.run.gross + latest.run.employerCost) / latest.run.headcount) : 0 },
      trend: [...periodItems].filter((p) => p.run).reverse().slice(-12).map((p) => ({ month: p.startDate, gross: p.run!.gross, netPay: p.run!.netPay, employerCost: p.run!.employerCost, headcount: p.run!.headcount })),
      periods: periodItems.slice(0, 12), readiness, statutoryDue,
      statutorySummary: { dueAmount: r2(statutoryDue.reduce((s, r) => s + r.amount, 0)), overdue: statutoryDue.filter((r) => r.overdue).length },
      departments: dept.map((d) => ({ name: d.departmentCode ?? 'GENERAL', amount: r2(n(d._sum.allocatedAmount)) })).sort((a, b) => b.amount - a.amount).slice(0, 8),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return payrollErrorResponse(e, 'overview');
  }
}
