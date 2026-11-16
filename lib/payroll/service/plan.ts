import 'server-only';

import { prisma } from '@/lib/prisma';
import { computePayslip, sumPayslips } from '@/lib/payroll/engine/engine';
import type { PayrollAdjustmentInput, PayslipInput, PayslipResult } from '@/lib/payroll/engine/types';
import { getPayrollAdapterStatus, loadWorkforceSignals } from '@/lib/payroll/integrations/workforce-adapter';
import { toPaymentSchedule } from '@/lib/payroll/settings';
import { computeVariance, runChecks, type CheckEmployee, type PayrollIssue, type VarianceFlag } from './checks';
import { effectiveOn, parseComponents } from './compensation';
import { fyOf, monthBounds, type MonthBounds } from './period';

type EmployeeRow = Awaited<ReturnType<typeof loadEmployees>>[number];
type CompRow = EmployeeRow['compensations'][number];

export type PlannedLine = {
  employeeId: string;
  employee: EmployeeRow;
  compensation: CompRow;
  input: PayslipInput;
  result: PayslipResult;
  ytdAssumed: boolean;
};

export type RunPlan = {
  bounds: MonthBounds;
  fyLabel: string;
  workforceLinked: boolean;
  lines: PlannedLine[];
  issues: PayrollIssue[];
  variance: VarianceFlag[];
  totals: ReturnType<typeof sumPayslips>;
  headcount: { included: number; excluded: number };
};

async function loadEmployees(workspaceId: string, bounds: MonthBounds) {
  return prisma.employee.findMany({
    where: {
      workspaceId,
      AND: [
        { OR: [{ joinDate: null }, { joinDate: { lte: bounds.end } }] },
        {
          OR: [
            { status: { in: ['ACTIVE', 'ON_LEAVE'] }, OR: [{ exitDate: null }, { exitDate: { gte: bounds.start } }] },
            { status: 'INACTIVE', exitDate: { gte: bounds.start } },
          ],
        },
      ],
    },
    include: {
      department: { select: { name: true } },
      designation: { select: { title: true } },
      compensations: { orderBy: { effectiveFrom: 'desc' } },
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 5000,
  });
}

const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`.trim();

/** Works out the whole run without saving anything. Used for the pre-flight preview and by the generator. */
export async function buildRunPlan(args: { workspaceId: string; year: number; month: number; now?: Date }): Promise<RunPlan> {
  const { workspaceId } = args;
  const bounds = monthBounds(args.year, args.month);
  const fy = fyOf(bounds.start);
  const now = args.now ?? new Date();

  const [employees, settings] = await Promise.all([
    loadEmployees(workspaceId, bounds),
    prisma.payrollSettings.findUnique({ where: { workspaceId }, select: { paymentScheduleJson: true } }),
  ]);
  const lopBasis = toPaymentSchedule(settings?.paymentScheduleJson).lopBasis === 'FIXED_30' ? 'FIXED_30' : 'CALENDAR_DAYS';

  const withComp = employees.filter((e) => effectiveOn(e.compensations, bounds.end));
  const ids = withComp.map((e) => e.id);

  const period = await prisma.payrollPeriod.findUnique({ where: { workspaceId_startDate_endDate: { workspaceId, startDate: bounds.start, endDate: bounds.end } }, select: { id: true } });

  const [signals, adjustments, loans, history] = await Promise.all([
    loadWorkforceSignals({ workspaceId, employees: withComp.map((e) => ({ id: e.id, joinDate: e.joinDate, exitDate: e.exitDate })), periodStart: bounds.start, periodEnd: bounds.end }),
    period ? prisma.payrollAdjustment.findMany({ where: { workspaceId, periodId: period.id, employeeId: { in: ids } } }) : Promise.resolve([]),
    prisma.employeeLoan.findMany({ where: { workspaceId, employeeId: { in: ids }, status: 'ACTIVE', startPeriod: { lte: bounds.end }, outstanding: { gt: 0 } } }),
    prisma.payrollLineItem.findMany({
      where: { run: { workspaceId, status: { in: ['APPROVED', 'POSTED'] }, period: { startDate: { gte: fy.start, lt: bounds.start } } }, employeeSnapshot: { employeeId: { in: ids } } },
      select: { statutoryJson: true, employeeSnapshot: { select: { employeeId: true } } },
    }),
  ]);

  const ytd = new Map<string, { taxable: number; tds: number; pt: number; pf: number; count: number }>();
  for (const h of history) {
    const s = (h.statutoryJson ?? {}) as Record<string, number>;
    const id = h.employeeSnapshot.employeeId;
    const cur = ytd.get(id) ?? { taxable: 0, tds: 0, pt: 0, pf: 0, count: 0 };
    cur.taxable += Number(s.taxableGross ?? 0);
    cur.tds += Number(s.tds ?? 0);
    cur.pt += Number(s.pt ?? 0);
    cur.pf += Number(s.pfEmployee ?? 0);
    cur.count += 1;
    ytd.set(id, cur);
  }

  const lines: PlannedLine[] = [];
  const checks: CheckEmployee[] = [];
  const excluded: EmployeeRow[] = [];

  for (const e of employees) {
    const comp = effectiveOn(e.compensations, bounds.end);
    const base: CheckEmployee = {
      id: e.id, name: fullName(e), hasCompensation: Boolean(comp), paymentMode: comp?.paymentMode ?? 'BANK_TRANSFER',
      hasBank: Boolean(comp?.accountEnc && comp?.ifsc), bankKey: comp?.accountEnc && comp.ifsc ? `${comp.ifsc}:${comp.accountLast4}` : null,
      hasPan: Boolean(comp?.panEnc), hasUan: Boolean(comp?.uan), pfEnabled: comp?.pfEnabled ?? false, esiEnabled: comp?.esiEnabled ?? false,
      hasEsiNumber: Boolean(comp?.esiNumber), ptState: comp?.ptState ?? null,
      joinsThisPeriod: Boolean(e.joinDate && e.joinDate >= bounds.start && e.joinDate <= bounds.end),
      leavesThisPeriod: Boolean(e.exitDate && e.exitDate >= bounds.start && e.exitDate <= bounds.end),
      onLeaveStatus: e.status === 'ON_LEAVE', pendingLeaveRequests: signals.pendingLeave.get(e.id) ?? 0,
      missingAttendanceDays: signals.lop.get(e.id)?.missingDays ?? 0, ytdAssumed: false, lopDays: 0,
    };
    if (!comp) {
      excluded.push(e);
      checks.push(base);
      continue;
    }

    const components = parseComponents(comp.componentsJson);
    const manual: PayrollAdjustmentInput[] = adjustments
      .filter((a) => a.employeeId === e.id)
      .map((a) => ({ kind: a.kind as PayrollAdjustmentInput['kind'], code: a.code, label: a.label, amount: Number(a.amount), taxable: a.taxable }));
    const derivedLop = signals.lop.get(e.id)?.lopDays ?? 0;
    const manualLop = manual.filter((a) => a.kind === 'LOP_DAYS').reduce((s, a) => s + a.amount, 0);
    const adjustmentsForEngine = [...manual.filter((a) => a.kind !== 'LOP_DAYS'), ...(derivedLop + manualLop > 0 ? [{ kind: 'LOP_DAYS' as const, code: 'LOP', label: 'Loss of pay', amount: derivedLop + manualLop, taxable: true }] : [])];

    const past = ytd.get(e.id);
    const recurringTaxable = components.filter((c) => c.taxable).reduce((s, c) => s + c.monthly, 0);
    let ytdAssumed = false;
    let ytdTaxable = past?.taxable ?? 0;
    if (!past && fy.fyMonth > 1) {
      const joinedThisFy = e.joinDate && e.joinDate >= fy.start ? fyOf(e.joinDate).fyMonth : 1;
      const monthsBefore = Math.max(0, fy.fyMonth - joinedThisFy);
      if (monthsBefore > 0) {
        ytdTaxable = monthsBefore * recurringTaxable;
        ytdAssumed = true;
      }
    }

    const input: PayslipInput = {
      periodStart: bounds.startIso, periodEnd: bounds.endIso, fy: fy.label, fyMonth: fy.fyMonth,
      joinDate: e.joinDate?.toISOString() ?? null, exitDate: e.exitDate?.toISOString() ?? null,
      components, adjustments: adjustmentsForEngine,
      loanInstalments: loans.filter((l) => l.employeeId === e.id).map((l) => ({ label: l.label, amount: Math.min(Number(l.emi), Number(l.outstanding)) })),
      statutory: { pfEnabled: comp.pfEnabled, pfOnActualBasic: comp.pfOnActualBasic, esiEnabled: comp.esiEnabled, ptState: comp.ptState, hasPan: Boolean(comp.panEnc) },
      tax: { regime: comp.taxRegime === 'old' ? 'old' : 'new', oldRegimeDeductions: Number(comp.oldRegimeDeductions), ytdTaxableEarnings: ytdTaxable, ytdTds: past?.tds ?? 0, ytdProfessionalTax: past?.pt ?? 0, ytdEmployeePf: past?.pf ?? 0 },
      lopBasis,
    };
    const result = computePayslip(input);
    lines.push({ employeeId: e.id, employee: e, compensation: comp, input, result, ytdAssumed });
    checks.push({ ...base, ytdAssumed, lopDays: result.period.lopDays, netPay: result.totals.netPay, gross: result.totals.gross, warnings: result.warnings });
  }

  const workforceLinked = (await getPayrollAdapterStatus(workspaceId)).workforceModuleEnabled;
  const issues = runChecks({ employees: checks, workforceLinked, periodInPast: bounds.end < now });

  const prevPeriod = await prisma.payrollPeriod.findFirst({
    where: { workspaceId, startDate: { lt: bounds.start } },
    orderBy: { startDate: 'desc' },
    select: { runs: { orderBy: { version: 'desc' }, take: 1, select: { lineItems: { select: { netPay: true, earnings: true, employeeSnapshot: { select: { employeeId: true, firstName: true, lastName: true } } } } } } },
  });
  const previous = (prevPeriod?.runs[0]?.lineItems ?? []).map((l) => ({ employeeId: l.employeeSnapshot.employeeId, name: `${l.employeeSnapshot.firstName} ${l.employeeSnapshot.lastName}`.trim(), netPay: Number(l.netPay), gross: Number(l.earnings) }));
  const variance = computeVariance(previous, lines.map((l) => ({ employeeId: l.employeeId, name: fullName(l.employee), netPay: l.result.totals.netPay, gross: l.result.totals.gross })));

  return {
    bounds, fyLabel: fy.label, workforceLinked, lines, issues, variance,
    totals: sumPayslips(lines.map((l) => l.result)),
    headcount: { included: lines.length, excluded: excluded.length },
  };
}
