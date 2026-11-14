import { Prisma, type AccountingLineSide } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { logActivity } from '@/lib/security/activity-log';
import { remittanceDueDate } from '@/lib/payroll/service/period';

/**
 * Payroll ledger postings.
 *
 * Posting a run books the cost and every amount owed: PF, ESI, professional tax and TDS go to their own
 * liability accounts, recoveries of employee loans go against the loans receivable account, and net pay goes
 * to wages payable. Paying people (disbursement) and paying the government (remittance) are separate entries
 * that clear those liabilities against the bank, so the ledger always shows what is still owed.
 */

export const PAYROLL_POSTING_OPERATION = 'PAYROLL_RUN_POST';

export const PAYROLL_ACCOUNT_CODES = {
  payrollExpense: '6000_PAYROLL_EXPENSE',
  employerContributions: '6010_PAYROLL_EMPLOYER_CONTRIBUTIONS',
  pfPayable: '2110_PF_PAYABLE',
  esiPayable: '2111_ESI_PAYABLE',
  ptPayable: '2112_PROFESSIONAL_TAX_PAYABLE',
  tdsPayable: '2113_TDS_SALARY_PAYABLE',
  otherDeductionsPayable: '2130_PAYROLL_OTHER_DEDUCTIONS_PAYABLE',
  wagesPayable: '2125_PAYROLL_WAGES_PAYABLE',
  employeeLoans: '1210_EMPLOYEE_LOANS_RECEIVABLE',
  cashClearing: '1005_CASH_BANK_CLEARING',
} as const;

const A = PAYROLL_ACCOUNT_CODES;
const ZERO = new Prisma.Decimal(0);
const D = (n: Prisma.Decimal.Value) => new Prisma.Decimal(n);

export type PayrollJournalLine = { lineNumber: number; accountCode: string; side: AccountingLineSide; amount: Prisma.Decimal; description: string };

export type RunLedgerTotals = {
  gross: Prisma.Decimal;
  employerCost: Prisma.Decimal;
  pf: Prisma.Decimal;
  esi: Prisma.Decimal;
  pt: Prisma.Decimal;
  tds: Prisma.Decimal;
  loanRecovery: Prisma.Decimal;
  otherDeductions: Prisma.Decimal;
  netPay: Prisma.Decimal;
};

type LineForTotals = {
  earnings: Prisma.Decimal.Value;
  employerCosts: Prisma.Decimal.Value;
  netPay: Prisma.Decimal.Value;
  breakdownJson: unknown;
  statutoryJson: unknown;
};

/** Adds up what a run owes, from its stored line items. */
export function ledgerTotalsFromLines(lines: LineForTotals[]): RunLedgerTotals {
  const t = { gross: ZERO, employerCost: ZERO, pf: ZERO, esi: ZERO, pt: ZERO, tds: ZERO, loanRecovery: ZERO, netPay: ZERO, employeeStatutory: ZERO };
  for (const l of lines) {
    const s = (l.statutoryJson ?? {}) as Record<string, number>;
    const n = (k: string) => D(Number(s[k] ?? 0));
    t.gross = t.gross.plus(D(l.earnings));
    t.employerCost = t.employerCost.plus(D(l.employerCosts));
    t.netPay = t.netPay.plus(D(l.netPay));
    t.pf = t.pf.plus(n('pfEmployee')).plus(n('pfEpf')).plus(n('pfEps')).plus(n('pfAdmin')).plus(n('pfEdli'));
    t.esi = t.esi.plus(n('esiEmployee')).plus(n('esiEmployer'));
    t.pt = t.pt.plus(n('pt'));
    t.tds = t.tds.plus(n('tds'));
    t.employeeStatutory = t.employeeStatutory.plus(n('pfEmployee')).plus(n('esiEmployee')).plus(n('pt')).plus(n('tds'));
    const deductions = ((l.breakdownJson ?? {}) as { deductions?: { code: string; amount: number }[] }).deductions ?? [];
    for (const d of deductions) if (d.code === 'LOAN_EMI') t.loanRecovery = t.loanRecovery.plus(D(d.amount));
  }
  // Whatever else was taken from pay and not paid out is owed on to a third party; this also keeps the entry balanced.
  const otherDeductions = Prisma.Decimal.max(ZERO, t.gross.minus(t.netPay).minus(t.employeeStatutory).minus(t.loanRecovery));
  return { gross: t.gross, employerCost: t.employerCost, pf: t.pf, esi: t.esi, pt: t.pt, tds: t.tds, loanRecovery: t.loanRecovery, otherDeductions, netPay: t.netPay };
}

export function buildAccrualJournal(t: RunLedgerTotals): { lines: PayrollJournalLine[]; debit: Prisma.Decimal; credit: Prisma.Decimal } {
  const spec: [string, AccountingLineSide, Prisma.Decimal, string][] = [
    [A.payrollExpense, 'DEBIT', t.gross, 'Salaries and allowances for the month'],
    [A.employerContributions, 'DEBIT', t.employerCost, 'Employer PF, pension, EDLI and ESI'],
    [A.pfPayable, 'CREDIT', t.pf, 'Provident fund payable (employee and employer share)'],
    [A.esiPayable, 'CREDIT', t.esi, 'ESI payable (employee and employer share)'],
    [A.ptPayable, 'CREDIT', t.pt, 'Professional tax payable'],
    [A.tdsPayable, 'CREDIT', t.tds, 'Tax deducted from salaries, payable to government'],
    [A.employeeLoans, 'CREDIT', t.loanRecovery, 'Employee loan instalments recovered'],
    [A.otherDeductionsPayable, 'CREDIT', t.otherDeductions, 'Other deductions from pay'],
    [A.wagesPayable, 'CREDIT', t.netPay, 'Net salaries payable to employees'],
  ];
  const lines = spec
    .filter(([, , amount]) => amount.gt(0))
    .map(([accountCode, side, amount, description], i) => ({ lineNumber: i + 1, accountCode, side, amount, description }));
  const sum = (side: AccountingLineSide) => lines.filter((l) => l.side === side).reduce((s, l) => s.plus(l.amount), ZERO);
  const debit = sum('DEBIT');
  const credit = sum('CREDIT');
  if (!debit.equals(credit)) throw new Error(`PAYROLL_POSTING_UNBALANCED: debit ${debit.toFixed(2)} != credit ${credit.toFixed(2)}`);
  return { lines, debit, credit };
}

const REMITTANCE_ACCOUNT = { PF: A.pfPayable, ESI: A.esiPayable, PT: A.ptPayable, TDS: A.tdsPayable } as const;

export function remittanceAmounts(t: RunLedgerTotals): { kind: 'PF' | 'ESI' | 'PT' | 'TDS'; amount: Prisma.Decimal }[] {
  return ([
    { kind: 'PF', amount: t.pf },
    { kind: 'ESI', amount: t.esi },
    { kind: 'PT', amount: t.pt },
    { kind: 'TDS', amount: t.tds },
  ] as const).filter((r) => r.amount.gt(0)).map((r) => ({ ...r }));
}

type Tx = Prisma.TransactionClient;

async function writeJournal(tx: Tx, args: { workspaceId: string; sourceTable: string; sourceId: string; sourceRef: string; description: string; occurredAt: Date; lines: PayrollJournalLine[] }) {
  const posted = new Date();
  const transaction = await tx.accountingTransaction.create({
    data: {
      workspaceId: args.workspaceId, eventType: 'MANUAL_ADJUSTMENT', eventOccurredAt: args.occurredAt, postedAt: posted, postingCurrency: 'INR',
      description: args.description, sourceTable: args.sourceTable, sourceId: args.sourceId, sourceRef: args.sourceRef,
    },
  });
  await tx.accountingEntry.createMany({
    data: args.lines.map((l) => ({ transactionId: transaction.id, workspaceId: args.workspaceId, lineNumber: l.lineNumber, accountCode: l.accountCode, side: l.side, amount: l.amount, currency: 'INR', postedAt: posted, isPosted: true })),
  });
  return transaction;
}

export class PayrollPostingError extends Error {
  constructor(readonly code: 'NOT_APPROVED' | 'NOT_POSTED' | 'NOTHING_TO_PAY' | 'NOT_FOUND' | 'ALREADY_PAID', message: string) {
    super(message);
  }
}

/** Books an approved run to the ledger, creates what is owed to government, recovers loan instalments and closes the month. */
export async function postPayrollRun(args: { workspaceId: string; runId: string; userId: string; userEmail?: string | null }) {
  const { workspaceId, runId } = args;
  const result = await prisma.$transaction(
    async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id: runId, workspaceId }, include: { period: true, lineItems: { include: { employeeSnapshot: { select: { employeeId: true } } } } } });
      if (!run) throw new PayrollPostingError('NOT_FOUND', 'Payroll run not found.');
      if (run.status === 'POSTED') {
        const existing = await tx.payrollPosting.findUnique({ where: { runId } });
        return { replayed: true as const, transactionId: existing?.accountingTransactionId ?? null, journalReference: existing?.journalReference ?? null };
      }
      const claimed = await tx.payrollRun.updateMany({ where: { id: runId, workspaceId, status: 'APPROVED' }, data: { status: 'POSTED' } });
      if (claimed.count === 0) throw new PayrollPostingError('NOT_APPROVED', 'Only an approved run can be posted.');

      const totals = ledgerTotalsFromLines(run.lineItems);
      const { lines, debit, credit } = buildAccrualJournal(totals);
      const journalReference = `PR-${runId.slice(-8).toUpperCase()}`;
      const transaction = await writeJournal(tx, {
        workspaceId, sourceTable: 'PAYROLL_RUN', sourceId: runId, sourceRef: journalReference,
        description: `Payroll ${run.period.startDate.toISOString().slice(0, 7)} posted`, occurredAt: run.period.endDate, lines,
      });

      await tx.payrollPosting.upsert({
        where: { runId },
        create: { workspaceId, runId, postingStatus: 'POSTED', idempotencyKey: `${PAYROLL_POSTING_OPERATION}:${runId}`, journalReference, accountingTransactionId: transaction.id, accountingTransactionRef: transaction.id, postedAt: new Date() },
        update: { postingStatus: 'POSTED', journalReference, accountingTransactionId: transaction.id, accountingTransactionRef: transaction.id, postedAt: new Date(), errorMessage: null },
      });

      for (const r of remittanceAmounts(totals)) {
        await tx.payrollRemittance.upsert({
          where: { workspaceId_periodId_kind: { workspaceId, periodId: run.periodId, kind: r.kind } },
          create: { workspaceId, periodId: run.periodId, runId, kind: r.kind, amount: r.amount, dueDate: remittanceDueDate(r.kind, run.period.endDate) },
          update: { runId, amount: r.amount, dueDate: remittanceDueDate(r.kind, run.period.endDate) },
        });
      }

      // Recover loan instalments, oldest loan first.
      const emiByEmployee = new Map<string, number>();
      for (const l of run.lineItems) {
        const taken = (((l.breakdownJson ?? {}) as { deductions?: { code: string; amount: number }[] }).deductions ?? []).filter((d) => d.code === 'LOAN_EMI').reduce((s, d) => s + d.amount, 0);
        if (taken > 0) emiByEmployee.set(l.employeeSnapshot.employeeId, taken);
      }
      for (const [employeeId, taken] of emiByEmployee) {
        let left = taken;
        const loans = await tx.employeeLoan.findMany({ where: { workspaceId, employeeId, status: 'ACTIVE' }, orderBy: { startPeriod: 'asc' } });
        for (const loan of loans) {
          if (left <= 0) break;
          const take = Math.min(left, Number(loan.outstanding));
          const outstanding = D(loan.outstanding).minus(take);
          await tx.employeeLoan.update({ where: { id: loan.id }, data: { outstanding, status: outstanding.lte(0) ? 'CLOSED' : 'ACTIVE' } });
          left -= take;
        }
      }

      await tx.payrollPeriod.update({ where: { id: run.periodId }, data: { status: 'CLOSED', lockedAt: new Date(), lockedByUserId: args.userId } });
      return { replayed: false as const, transactionId: transaction.id, journalReference, debit: debit.toFixed(2), credit: credit.toFixed(2), totals };
    },
    { timeout: 60_000 },
  );

  if (!result.replayed) {
    void logActivity({
      workspaceId, action: 'payroll.run_posted', status: 'SUCCESS', actor: { userId: args.userId, email: args.userEmail ?? null },
      entity: { type: 'payroll_run', id: runId },
      metadata: { accountingTransactionId: result.transactionId, debit: result.debit, credit: result.credit },
    });
  }
  return result;
}

/** Records salaries as paid: clears wages payable against the bank and marks each employee's line paid. */
export async function disbursePayrollRun(args: { workspaceId: string; runId: string; userId: string; userEmail?: string | null; lineIds?: string[]; reference?: string | null; paidOn?: Date }) {
  const { workspaceId, runId } = args;
  const paidOn = args.paidOn ?? new Date();
  const out = await prisma.$transaction(
    async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id: runId, workspaceId }, include: { period: { select: { endDate: true } } } });
      if (!run) throw new PayrollPostingError('NOT_FOUND', 'Payroll run not found.');
      if (run.status !== 'POSTED') throw new PayrollPostingError('NOT_POSTED', 'Post the run to the ledger before recording payment.');
      const lines = await tx.payrollLineItem.findMany({ where: { runId, payoutStatus: { in: ['PENDING', 'FAILED', 'HELD'] }, ...(args.lineIds?.length ? { id: { in: args.lineIds } } : {}) } });
      if (lines.length === 0) throw new PayrollPostingError('NOTHING_TO_PAY', 'Every selected salary is already paid.');
      const amount = lines.reduce((s, l) => s.plus(l.netPay), ZERO);
      const batch = `${runId}:${Date.now().toString(36)}`;
      let transactionId: string | null = null;
      if (amount.gt(0)) {
        const t = await writeJournal(tx, {
          workspaceId, sourceTable: 'PAYROLL_PAYOUT', sourceId: batch, sourceRef: args.reference ?? `PAY-${runId.slice(-8).toUpperCase()}`,
          description: `Salaries paid (${lines.length})`, occurredAt: paidOn,
          lines: [
            { lineNumber: 1, accountCode: A.wagesPayable, side: 'DEBIT', amount, description: 'Net salaries paid' },
            { lineNumber: 2, accountCode: A.cashClearing, side: 'CREDIT', amount, description: 'Paid from bank or cash' },
          ],
        });
        transactionId = t.id;
      }
      await tx.payrollLineItem.updateMany({ where: { id: { in: lines.map((l) => l.id) } }, data: { payoutStatus: 'PAID', paidAt: paidOn, payoutRef: args.reference ?? null } });
      const remaining = await tx.payrollLineItem.count({ where: { runId, payoutStatus: { not: 'PAID' } } });
      await tx.payrollRun.update({ where: { id: runId }, data: remaining === 0 ? { disbursedAt: paidOn, disbursedByUserId: args.userId, disbursementTxId: transactionId ?? run.disbursementTxId } : { disbursementTxId: transactionId ?? run.disbursementTxId } });
      return { paid: lines.length, amount: amount.toFixed(2), complete: remaining === 0, transactionId };
    },
    { timeout: 60_000 },
  );
  void logActivity({ workspaceId, action: 'payroll.salaries_paid', status: 'SUCCESS', actor: { userId: args.userId, email: args.userEmail ?? null }, entity: { type: 'payroll_run', id: runId }, metadata: { paid: out.paid, amount: out.amount, complete: out.complete } });
  return out;
}

/** Records a payment to PF, ESI, professional tax or TDS, clearing the matching liability. */
export async function payRemittance(args: { workspaceId: string; remittanceId: string; userId: string; userEmail?: string | null; reference?: string | null; paidOn?: Date }) {
  const { workspaceId } = args;
  const paidOn = args.paidOn ?? new Date();
  const out = await prisma.$transaction(async (tx) => {
    const r = await tx.payrollRemittance.findFirst({ where: { id: args.remittanceId, workspaceId } });
    if (!r) throw new PayrollPostingError('NOT_FOUND', 'Remittance not found.');
    if (r.status === 'PAID') throw new PayrollPostingError('ALREADY_PAID', 'This payment is already recorded.');
    const claimed = await tx.payrollRemittance.updateMany({ where: { id: r.id, status: 'DUE' }, data: { status: 'PAID', paidAt: paidOn, paidByUserId: args.userId, reference: args.reference ?? null } });
    if (claimed.count === 0) throw new PayrollPostingError('ALREADY_PAID', 'This payment is already recorded.');
    const account = REMITTANCE_ACCOUNT[r.kind as keyof typeof REMITTANCE_ACCOUNT];
    const t = await writeJournal(tx, {
      workspaceId, sourceTable: 'PAYROLL_REMITTANCE', sourceId: r.id, sourceRef: args.reference ?? `REM-${r.kind}`,
      description: `${r.kind} remitted`, occurredAt: paidOn,
      lines: [
        { lineNumber: 1, accountCode: account, side: 'DEBIT', amount: r.amount, description: `${r.kind} paid to government` },
        { lineNumber: 2, accountCode: A.cashClearing, side: 'CREDIT', amount: r.amount, description: 'Paid from bank' },
      ],
    });
    await tx.payrollRemittance.update({ where: { id: r.id }, data: { accountingTxId: t.id } });
    return { kind: r.kind, amount: r.amount.toFixed(2) };
  });
  void logActivity({ workspaceId, action: 'payroll.remittance_paid', status: 'SUCCESS', actor: { userId: args.userId, email: args.userEmail ?? null }, entity: { type: 'payroll_remittance', id: args.remittanceId }, metadata: out });
  return out;
}
