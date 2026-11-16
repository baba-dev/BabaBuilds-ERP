import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { buildRunPlan, type PlannedLine, type RunPlan } from './plan';

export class PayrollRunError extends Error {
  constructor(readonly code: 'PERIOD_CLOSED' | 'RUN_POSTED' | 'RUN_LOCKED' | 'NO_EMPLOYEES' | 'BLOCKED', message: string) {
    super(message);
  }
}

const D = (n: number) => new Prisma.Decimal(n);

function snapshotMeta(l: PlannedLine) {
  const c = l.compensation;
  return {
    components: l.input.components,
    taxRegime: c.taxRegime,
    pfEnabled: c.pfEnabled,
    pfOnActualBasic: c.pfOnActualBasic,
    esiEnabled: c.esiEnabled,
    ptState: c.ptState,
    effectiveFrom: c.effectiveFrom.toISOString(),
    panLast4: c.panLast4,
    uan: c.uan,
    esiNumber: c.esiNumber,
    paymentMode: c.paymentMode,
    bank: { holder: c.accountHolder, bankName: c.bankName, ifsc: c.ifsc, accountEnc: c.accountEnc, last4: c.accountLast4 },
  };
}

function lineStatutory(l: PlannedLine) {
  const r = l.result;
  return {
    taxableGross: r.totals.taxableGross,
    tds: r.statutory.tds.monthly,
    pt: r.statutory.pt,
    pfEmployee: r.statutory.pf.employee,
    pfEpf: r.statutory.pf.epf,
    pfEps: r.statutory.pf.eps,
    pfAdmin: r.statutory.pf.admin,
    pfEdli: r.statutory.pf.edli,
    pfWage: r.statutory.pf.wage,
    esiEmployee: r.statutory.esi.employee,
    esiEmployer: r.statutory.esi.employer,
    esiWage: r.statutory.esi.wage,
    annualTax: r.statutory.tds.annualTax,
    monthsLeft: r.statutory.tds.monthsLeft,
  };
}

/** Saves a run for a pay month. Re-running replaces a draft in place; a run under review or later must be sent back first. */
export async function generateRun(args: { workspaceId: string; userId: string; userEmail?: string | null; year: number; month: number; notes?: string | null; plan?: RunPlan }) {
  const { workspaceId, userId } = args;
  const plan = args.plan ?? (await buildRunPlan({ workspaceId, year: args.year, month: args.month }));
  if (plan.lines.length === 0) throw new PayrollRunError('NO_EMPLOYEES', 'No employee has a pay structure for this month. Add compensation first.');
  const blocking = plan.issues.filter((i) => i.severity === 'error' && i.code !== 'NO_COMPENSATION');
  if (blocking.length > 0) throw new PayrollRunError('BLOCKED', `Fix ${blocking.length} blocking issue${blocking.length === 1 ? '' : 's'} before generating.`);

  const { bounds } = plan;
  const run = await prisma.$transaction(
    async (tx) => {
      const period = await tx.payrollPeriod.upsert({
        where: { workspaceId_startDate_endDate: { workspaceId, startDate: bounds.start, endDate: bounds.end } },
        update: {},
        create: { workspaceId, startDate: bounds.start, endDate: bounds.end },
      });
      if (period.status === 'CLOSED') throw new PayrollRunError('PERIOD_CLOSED', 'This pay month is closed.');

      const latest = await tx.payrollRun.findFirst({ where: { periodId: period.id }, orderBy: { version: 'desc' } });
      if (latest?.status === 'POSTED') throw new PayrollRunError('RUN_POSTED', 'This month is already posted to the ledger.');
      if (latest && latest.status !== 'DRAFT') throw new PayrollRunError('RUN_LOCKED', 'Send the run back to draft before regenerating it.');

      const t = plan.totals;
      const data = {
        totalEarnings: D(t.gross),
        totalDeductions: D(t.deductions),
        totalEmployerCosts: D(t.employerCost),
        totalNetPay: D(t.netPay),
        generatedByUserId: userId,
        generatedAt: new Date(),
        notes: args.notes ?? latest?.notes ?? null,
        preflightJson: { issues: plan.issues, variance: plan.variance, headcount: plan.headcount, fy: plan.fyLabel } as unknown as Prisma.InputJsonValue,
        summaryJson: { ...t, headcount: plan.headcount.included } as unknown as Prisma.InputJsonValue,
      };

      let runId: string;
      if (latest) {
        await tx.payrollEmployeeSnapshot.deleteMany({ where: { runId: latest.id } });
        await tx.payrollRun.update({ where: { id: latest.id }, data });
        runId = latest.id;
      } else {
        runId = (await tx.payrollRun.create({ data: { ...data, workspaceId, periodId: period.id, version: 1, status: 'DRAFT' } })).id;
      }

      for (const l of plan.lines) {
        const r = l.result;
        const e = l.employee;
        await tx.payrollEmployeeSnapshot.create({
          data: {
            runId, employeeId: e.id, employeeCode: e.employeeCode, firstName: e.firstName, lastName: e.lastName, email: e.email,
            departmentName: e.department?.name ?? null, designation: e.designation?.title ?? null, location: e.location, joinDate: e.joinDate,
            baseSalary: D(l.input.components.reduce((s, c) => s + c.monthly, 0)), paymentFrequency: 'MONTHLY',
            compensationMeta: snapshotMeta(l) as unknown as Prisma.InputJsonValue,
            lineItems: {
              create: {
                runId,
                earnings: D(r.totals.gross), deductions: D(r.totals.totalDeductions), employerCosts: D(r.totals.employerCost), netPay: D(r.totals.netPay),
                currency: 'INR',
                breakdownJson: { earnings: r.earnings, deductions: r.deductions, employer: r.employer } as unknown as Prisma.InputJsonValue,
                calculationLog: { ruleVersion: r.ruleVersion, period: r.period, warnings: r.warnings, tds: r.statutory.tds, ytdAssumed: l.ytdAssumed } as unknown as Prisma.InputJsonValue,
                statutoryJson: lineStatutory(l) as unknown as Prisma.InputJsonValue,
                allocations: { create: { departmentCode: e.department?.name ?? 'GENERAL', allocationPercent: D(100), allocatedAmount: D(r.totals.gross + r.totals.employerCost) } },
              },
            },
          },
        });
      }
      await tx.payrollPeriod.update({ where: { id: period.id }, data: { status: 'PROCESSING' } });
      return { id: runId, periodId: period.id };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  void logActivity({
    workspaceId, action: 'payroll.run_generated', status: 'SUCCESS', actor: { userId, email: args.userEmail ?? null },
    entity: { type: 'payroll_run', id: run.id },
    metadata: { period: `${bounds.startIso}..${bounds.endIso}`, employees: plan.headcount.included, net: plan.totals.netPay, issues: plan.issues.length },
  });
  return { runId: run.id, periodId: run.periodId, plan };
}
