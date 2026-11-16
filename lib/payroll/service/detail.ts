import 'server-only';

import { prisma } from '@/lib/prisma';
import { getPayrollRunActionCapabilities } from '@/app/api/payroll/_context';
import { checkPermissionsSilent } from '@/lib/rbac';
import type { PayLine } from '@/lib/payroll/engine/types';
import type { PayrollIssue, VarianceFlag } from './checks';
import { PAYROLL_KIND_LABEL } from './period';

export type RunLineDto = {
  id: string;
  employee: { id: string; name: string; code: string | null; department: string | null; designation: string | null; email: string | null };
  gross: number;
  deductions: number;
  employerCost: number;
  netPay: number;
  lopDays: number;
  payoutStatus: string;
  paidAt: string | null;
  payment: { mode: string; bankName: string | null; ifsc: string | null; accountLast4: string | null; holder: string | null };
  earnings: PayLine[];
  deductionLines: PayLine[];
  employerLines: PayLine[];
  statutory: Record<string, number>;
  warnings: string[];
  ytdAssumed: boolean;
  payslipSentAt: string | null;
};

export type RunDetailDto = Awaited<ReturnType<typeof getRunDetail>>;

const n = (v: unknown) => Number(v ?? 0);

export async function getRunDetail(workspaceId: string, userId: string, runId: string) {
  const run = await prisma.payrollRun.findFirst({
    where: { id: runId, workspaceId },
    include: {
      period: true,
      posting: true,
      remittances: { orderBy: { dueDate: 'asc' } },
      lineItems: { include: { employeeSnapshot: true }, orderBy: { employeeSnapshot: { firstName: 'asc' } } },
    },
  });
  if (!run) return null;

  const userIds = [run.generatedByUserId, run.approvedByUserId, run.disbursedByUserId].filter((x): x is string => Boolean(x));
  const [users, previousPeriod, staleAdjustments, staleComp, caps, grants] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }),
    prisma.payrollPeriod.findFirst({
      where: { workspaceId, startDate: { lt: run.period.startDate } },
      orderBy: { startDate: 'desc' },
      select: { startDate: true, runs: { orderBy: { version: 'desc' }, take: 1, select: { totalEarnings: true, totalNetPay: true, totalEmployerCosts: true, status: true } } },
    }),
    prisma.payrollAdjustment.count({ where: { periodId: run.periodId, createdAt: { gt: run.generatedAt } } }),
    prisma.employeeCompensation.count({ where: { workspaceId, OR: [{ createdAt: { gt: run.generatedAt } }, { updatedAt: { gt: run.generatedAt } }] } }),
    getPayrollRunActionCapabilities(userId, workspaceId, run.status, run.status === 'POSTED'),
    checkPermissionsSilent(userId, workspaceId, ['payroll.prepare', 'payroll.post']),
  ]);
  const who = (id: string | null) => {
    const u = users.find((x) => x.id === id);
    return id ? { id, name: u?.name || u?.email || 'Team member' } : null;
  };

  const lines: RunLineDto[] = run.lineItems.map((l) => {
    const s = l.employeeSnapshot;
    const meta = (s.compensationMeta ?? {}) as { bank?: { holder?: string; bankName?: string; ifsc?: string; last4?: string }; paymentMode?: string };
    const bd = (l.breakdownJson ?? {}) as { earnings?: PayLine[]; deductions?: PayLine[]; employer?: PayLine[] };
    const log = (l.calculationLog ?? {}) as { period?: { lopDays?: number }; warnings?: string[]; ytdAssumed?: boolean };
    return {
      id: l.id,
      employee: { id: s.employeeId, name: `${s.firstName} ${s.lastName}`.trim(), code: s.employeeCode, department: s.departmentName, designation: s.designation, email: s.email },
      gross: n(l.earnings), deductions: n(l.deductions), employerCost: n(l.employerCosts), netPay: n(l.netPay),
      lopDays: n(log.period?.lopDays), payoutStatus: l.payoutStatus, paidAt: l.paidAt?.toISOString() ?? null,
      payment: { mode: meta.paymentMode ?? 'BANK_TRANSFER', bankName: meta.bank?.bankName ?? null, ifsc: meta.bank?.ifsc ?? null, accountLast4: meta.bank?.last4 ?? null, holder: meta.bank?.holder ?? null },
      earnings: bd.earnings ?? [], deductionLines: bd.deductions ?? [], employerLines: bd.employer ?? [],
      statutory: (l.statutoryJson ?? {}) as Record<string, number>,
      warnings: log.warnings ?? [], ytdAssumed: Boolean(log.ytdAssumed), payslipSentAt: l.payslipSentAt?.toISOString() ?? null,
    };
  });

  const pre = (run.preflightJson ?? {}) as { issues?: PayrollIssue[]; variance?: VarianceFlag[]; headcount?: { included: number; excluded: number } };
  const pendingLines = lines.filter((l) => l.payoutStatus !== 'PAID');
  const prev = previousPeriod?.runs[0];

  return {
    id: run.id,
    version: run.version,
    status: run.status,
    notes: run.notes,
    period: { id: run.period.id, startDate: run.period.startDate.toISOString(), endDate: run.period.endDate.toISOString(), status: run.period.status },
    totals: { gross: n(run.totalEarnings), deductions: n(run.totalDeductions), employerCost: n(run.totalEmployerCosts), netPay: n(run.totalNetPay) },
    previous: prev ? { gross: n(prev.totalEarnings), netPay: n(prev.totalNetPay), employerCost: n(prev.totalEmployerCosts), month: previousPeriod!.startDate.toISOString() } : null,
    headcount: pre.headcount ?? { included: lines.length, excluded: 0 },
    issues: pre.issues ?? [],
    variance: pre.variance ?? [],
    stale: staleAdjustments > 0 || staleComp > 0,
    timeline: { generatedAt: run.generatedAt.toISOString(), submittedAt: run.submittedAt?.toISOString() ?? null, approvedAt: run.approvedAt?.toISOString() ?? null, postedAt: run.posting?.postedAt?.toISOString() ?? null, disbursedAt: run.disbursedAt?.toISOString() ?? null },
    people: { preparedBy: who(run.generatedByUserId), approvedBy: who(run.approvedByUserId), disbursedBy: who(run.disbursedByUserId) },
    capabilities: { ...caps, canRegenerate: grants['payroll.prepare'] && run.status === 'DRAFT', canDisburse: grants['payroll.post'] && run.status === 'POSTED' && pendingLines.length > 0, canExport: grants['payroll.post'] },
    posting: run.posting ? { status: run.posting.postingStatus, postedAt: run.posting.postedAt?.toISOString() ?? null, journalReference: run.posting.journalReference, accountingTransactionId: run.posting.accountingTransactionId, error: run.posting.errorMessage } : null,
    remittances: run.remittances.map((r) => ({ id: r.id, kind: r.kind, label: PAYROLL_KIND_LABEL[r.kind as keyof typeof PAYROLL_KIND_LABEL] ?? r.kind, amount: n(r.amount), dueDate: r.dueDate.toISOString(), status: r.status, paidAt: r.paidAt?.toISOString() ?? null, reference: r.reference })),
    payout: { pendingCount: pendingLines.length, paidCount: lines.length - pendingLines.length, pendingAmount: Math.round(pendingLines.reduce((s, l) => s + l.netPay, 0) * 100) / 100 },
    lines,
  };
}
