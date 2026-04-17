import { Prisma, type AccountingLineSide } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const PAYROLL_POSTING_OPERATION = 'PAYROLL_RUN_POST';

export const PAYROLL_ACCOUNT_CODES = {
  payrollExpense: '6000_PAYROLL_EXPENSE',
  taxLiability: '2105_PAYROLL_TAX_PAYABLE',
  benefitsLiability: '2115_PAYROLL_BENEFITS_PAYABLE',
  wagesPayable: '2125_PAYROLL_WAGES_PAYABLE',
  wagesPayableClearing: '2126_PAYROLL_WAGES_PAYABLE_CLEARING',
  cashClearing: '1005_CASH_BANK_CLEARING',
} as const;

const ACCOUNT_CODES = PAYROLL_ACCOUNT_CODES;

export type PayrollRunPostingInput = {
  runId: string;
  workspaceId: string;
  approvedAt: Date;
  postingCurrency: string;
  payrollExpense: Prisma.Decimal;
  taxLiability: Prisma.Decimal;
  benefitsLiability: Prisma.Decimal;
  wagesPayable: Prisma.Decimal;
  idempotencyKey: string;
  sourceRef?: string | null;
  actorUserId?: string | null;
  actorEmail?: string | null;
  requestId?: string | null;
};

export type PayrollJournalLine = {
  lineNumber: number;
  accountCode: string;
  side: AccountingLineSide;
  amount: Prisma.Decimal;
  description: string;
};

const toAmount = (value: Prisma.Decimal | number | string): Prisma.Decimal =>
  value instanceof Prisma.Decimal ? value : new Prisma.Decimal(value);

const ZERO = new Prisma.Decimal(0);

/**
 * Maps persisted payroll run totals to the four journal buckets used by buildPayrollJournalPayload.
 * payrollExpense = totalEarnings + totalEmployerCosts (P&L recognition).
 * wagesPayable = totalNetPay. Remaining credits split 50/50 between tax and benefits liability
 * so debits equal credits when headers are internally consistent.
 */
export function mapPayrollRunTotalsToJournalAmounts(input: {
  totalEarnings: Prisma.Decimal;
  totalDeductions: Prisma.Decimal;
  totalEmployerCosts: Prisma.Decimal;
  totalNetPay: Prisma.Decimal;
}): {
  payrollExpense: Prisma.Decimal;
  taxLiability: Prisma.Decimal;
  benefitsLiability: Prisma.Decimal;
  wagesPayable: Prisma.Decimal;
} {
  const earnings = Prisma.Decimal.max(toAmount(input.totalEarnings), ZERO);
  const er = Prisma.Decimal.max(toAmount(input.totalEmployerCosts), ZERO);
  const net = Prisma.Decimal.max(toAmount(input.totalNetPay), ZERO);
  const payrollExpense = earnings.plus(er);
  const remainder = Prisma.Decimal.max(payrollExpense.minus(net), ZERO);
  const half = remainder.div(new Prisma.Decimal(2));
  const taxLiability = half;
  const benefitsLiability = remainder.minus(half);
  const wagesPayable = net;
  return { payrollExpense, taxLiability, benefitsLiability, wagesPayable };
}

export function buildPayrollJournalPayload(input: {
  payrollExpense: Prisma.Decimal | number | string;
  taxLiability: Prisma.Decimal | number | string;
  benefitsLiability: Prisma.Decimal | number | string;
  wagesPayable: Prisma.Decimal | number | string;
}): {
  lines: PayrollJournalLine[];
  totals: {
    debit: Prisma.Decimal;
    credit: Prisma.Decimal;
    cashClearing: Prisma.Decimal;
  };
} {
  const payrollExpense = toAmount(input.payrollExpense);
  const taxLiability = toAmount(input.taxLiability);
  const benefitsLiability = toAmount(input.benefitsLiability);
  const wagesPayable = toAmount(input.wagesPayable);
  const cashClearing = wagesPayable;

  const lines: PayrollJournalLine[] = [
    {
      lineNumber: 1,
      accountCode: ACCOUNT_CODES.payrollExpense,
      side: 'DEBIT',
      amount: payrollExpense,
      description: 'Recognize payroll expense for approved run',
    },
    {
      lineNumber: 2,
      accountCode: ACCOUNT_CODES.taxLiability,
      side: 'CREDIT',
      amount: taxLiability,
      description: 'Accrue payroll tax liability',
    },
    {
      lineNumber: 3,
      accountCode: ACCOUNT_CODES.benefitsLiability,
      side: 'CREDIT',
      amount: benefitsLiability,
      description: 'Accrue payroll benefits liability',
    },
    {
      lineNumber: 4,
      accountCode: ACCOUNT_CODES.wagesPayable,
      side: 'CREDIT',
      amount: wagesPayable,
      description: 'Accrue net wages payable',
    },
    {
      lineNumber: 5,
      accountCode: ACCOUNT_CODES.wagesPayableClearing,
      side: 'DEBIT',
      amount: wagesPayable,
      description: 'Clear wages payable into payroll disbursement leg',
    },
    {
      lineNumber: 6,
      accountCode: ACCOUNT_CODES.cashClearing,
      side: 'CREDIT',
      amount: cashClearing,
      description: 'Record payroll cash/bank clearing outflow',
    },
  ];

  const debit = lines.reduce(
    (sum, line) => (line.side === 'DEBIT' ? sum.plus(line.amount) : sum),
    new Prisma.Decimal(0),
  );
  const credit = lines.reduce(
    (sum, line) => (line.side === 'CREDIT' ? sum.plus(line.amount) : sum),
    new Prisma.Decimal(0),
  );

  if (!debit.equals(credit)) {
    throw new Error(`PAYROLL_POSTING_UNBALANCED: debit ${debit.toFixed(2)} != credit ${credit.toFixed(2)}`);
  }

  return {
    lines,
    totals: {
      debit,
      credit,
      cashClearing,
    },
  };
}

export type CreatePayrollPostingResult = {
  created: boolean;
  accountingTransactionId: string;
  accountingEntryIds: string[];
  cashForecastSourceType: 'PAYROLL';
  cashOutflowAmount: Prisma.Decimal;
  journalReference: string | null;
};

export function buildPayrollPostResponseBody(input: CreatePayrollPostingResult & { payrollRunId: string }) {
  return {
    success: true as const,
    payrollRunId: input.payrollRunId,
    accountingTransactionId: input.accountingTransactionId,
    accountingEntryIds: input.accountingEntryIds,
    cashForecast: {
      sourceType: input.cashForecastSourceType,
      outflowAmount: input.cashOutflowAmount.toFixed(2),
    },
    references: {
      sourceTable: 'PAYROLL_RUN' as const,
      sourceId: input.payrollRunId,
    },
    created: input.created,
    journalReference: input.journalReference,
  };
}

/**
 * Creates accounting entries and updates PayrollPosting + PayrollRun in one transaction.
 * Idempotent by PayrollPosting.runId (POSTED + same accountingTransactionId returns without duplicating).
 */
export async function createPayrollPosting(input: PayrollRunPostingInput): Promise<CreatePayrollPostingResult> {
  const { lines, totals } = buildPayrollJournalPayload({
    payrollExpense: input.payrollExpense,
    taxLiability: input.taxLiability,
    benefitsLiability: input.benefitsLiability,
    wagesPayable: input.wagesPayable,
  });

  return prisma.$transaction(async (tx) => {
    const existingPosting = await tx.payrollPosting.findUnique({
      where: { runId: input.runId },
    });

    if (
      existingPosting?.postingStatus === 'POSTED' &&
      existingPosting.accountingTransactionId
    ) {
      const existingTx = await tx.accountingTransaction.findUnique({
        where: { id: existingPosting.accountingTransactionId },
        include: {
          entries: {
            orderBy: { lineNumber: 'asc' },
            select: { id: true, lineNumber: true, accountCode: true, side: true, amount: true },
          },
        },
      });
      if (existingTx) {
        const cashOutflowAmount = existingTx.entries
          .filter((entry) => entry.accountCode === ACCOUNT_CODES.cashClearing && entry.side === 'CREDIT')
          .reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
        return {
          created: false,
          accountingTransactionId: existingTx.id,
          accountingEntryIds: existingTx.entries.map((e) => e.id),
          cashForecastSourceType: 'PAYROLL' as const,
          cashOutflowAmount,
          journalReference: existingPosting.journalReference ?? null,
        };
      }
    }

    const existingAcct = await tx.accountingTransaction.findFirst({
      where: {
        workspaceId: input.workspaceId,
        sourceTable: 'PAYROLL_RUN',
        sourceId: input.runId,
        eventType: 'MANUAL_ADJUSTMENT',
      },
      include: {
        entries: {
          orderBy: { lineNumber: 'asc' },
          select: { id: true, lineNumber: true, accountCode: true, side: true, amount: true },
        },
      },
    });

    // Legacy: accounting row exists but PayrollPosting was never completed
    if (
      existingAcct &&
      (!existingPosting || existingPosting.postingStatus !== 'POSTED' || !existingPosting.accountingTransactionId)
    ) {
      const journalRef =
        existingPosting?.journalReference ?? `PR-${input.runId.slice(-8).toUpperCase()}`;
      const postedAt = new Date();
      await tx.payrollPosting.upsert({
        where: { runId: input.runId },
        create: {
          workspaceId: input.workspaceId,
          runId: input.runId,
          postingStatus: 'POSTED',
          idempotencyKey: input.idempotencyKey,
          journalReference: journalRef,
          accountingTransactionId: existingAcct.id,
          accountingTransactionRef: existingAcct.id,
          postedAt,
          errorMessage: null,
        },
        update: {
          postingStatus: 'POSTED',
          idempotencyKey: input.idempotencyKey,
          journalReference: journalRef,
          accountingTransactionId: existingAcct.id,
          accountingTransactionRef: existingAcct.id,
          postedAt,
          errorMessage: null,
        },
      });
      await tx.payrollRun.update({
        where: { id: input.runId, workspaceId: input.workspaceId },
        data: { status: 'POSTED' },
      });
      const cashOutflowAmount = existingAcct.entries
        .filter((entry) => entry.accountCode === ACCOUNT_CODES.cashClearing && entry.side === 'CREDIT')
        .reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0));
      return {
        created: false,
        accountingTransactionId: existingAcct.id,
        accountingEntryIds: existingAcct.entries.map((e) => e.id),
        cashForecastSourceType: 'PAYROLL' as const,
        cashOutflowAmount,
        journalReference: journalRef,
      };
    }

    if (existingPosting?.postingStatus === 'PENDING' && existingPosting.idempotencyKey !== input.idempotencyKey) {
      throw new Error('PAYROLL_POSTING_CONFLICT: run already has a pending posting with a different idempotency key');
    }

    const journalRef = `PR-${input.runId.slice(-8).toUpperCase()}`;

    await tx.payrollPosting.upsert({
      where: { runId: input.runId },
      create: {
        workspaceId: input.workspaceId,
        runId: input.runId,
        postingStatus: 'PENDING',
        idempotencyKey: input.idempotencyKey,
        journalReference: journalRef,
      },
      update: {
        postingStatus: 'PENDING',
        idempotencyKey: input.idempotencyKey,
        journalReference: journalRef,
        errorMessage: null,
        ...(existingPosting?.postingStatus === 'FAILED'
          ? {
              accountingTransactionId: null,
              accountingTransactionRef: null,
              postedAt: null,
            }
          : {}),
      },
    });

    try {
      let transactionId: string;
      let entryIds: string[];

      if (existingAcct) {
        transactionId = existingAcct.id;
        entryIds = existingAcct.entries.map((e) => e.id);
      } else {
        const transaction = await tx.accountingTransaction.create({
          data: {
            workspaceId: input.workspaceId,
            eventType: 'MANUAL_ADJUSTMENT',
            eventOccurredAt: input.approvedAt,
            postedAt: new Date(),
            postingCurrency: input.postingCurrency,
            description: `Payroll run ${input.runId} posted`,
            sourceTable: 'PAYROLL_RUN',
            sourceId: input.runId,
            sourceRef: input.sourceRef ?? null,
            requestId: input.requestId ?? null,
          },
        });
        transactionId = transaction.id;

        const entries = await Promise.all(
          lines.map((line) =>
            tx.accountingEntry.create({
              data: {
                transactionId: transaction.id,
                workspaceId: input.workspaceId,
                lineNumber: line.lineNumber,
                accountCode: line.accountCode,
                side: line.side,
                amount: line.amount,
                currency: input.postingCurrency,
                postedAt: transaction.postedAt,
                isPosted: true,
              },
            }),
          ),
        );
        entryIds = entries.map((e) => e.id);

        await tx.appActivityLog.create({
          data: {
            workspaceId: input.workspaceId,
            actorUserId: input.actorUserId ?? null,
            actorEmail: input.actorEmail ?? null,
            action: 'PAYROLL_RUN_POSTED',
            entityType: 'PayrollRun',
            entityId: input.runId,
            status: 'SUCCESS',
            metadata: {
              accountingTransactionId: transaction.id,
              accountingEntryIds: entryIds,
              sourceType: 'PAYROLL',
              sourceTable: 'PAYROLL_RUN',
              sourceId: input.runId,
              debitTotal: totals.debit.toFixed(2),
              creditTotal: totals.credit.toFixed(2),
              cashOutflowAmount: totals.cashClearing.toFixed(2),
            },
          },
        });
      }

      const postedAt = new Date();

      await tx.payrollPosting.update({
        where: { runId: input.runId },
        data: {
          postingStatus: 'POSTED',
          accountingTransactionId: transactionId,
          accountingTransactionRef: transactionId,
          postedAt,
          errorMessage: null,
          idempotencyKey: input.idempotencyKey,
          journalReference: journalRef,
        },
      });

      await tx.payrollRun.update({
        where: { id: input.runId, workspaceId: input.workspaceId },
        data: { status: 'POSTED' },
      });

      return {
        created: !existingAcct,
        accountingTransactionId: transactionId,
        accountingEntryIds: entryIds,
        cashForecastSourceType: 'PAYROLL' as const,
        cashOutflowAmount: totals.cashClearing,
        journalReference: journalRef,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown posting error';
      await tx.payrollPosting.update({
        where: { runId: input.runId },
        data: {
          postingStatus: 'FAILED',
          errorMessage: message.slice(0, 4000),
        },
      });
      throw err;
    }
  });
}
