import { Prisma, type AccountingLineSide } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const PAYROLL_POSTING_OPERATION = 'PAYROLL_RUN_POST';

const ACCOUNT_CODES = {
  payrollExpense: '6000_PAYROLL_EXPENSE',
  taxLiability: '2105_PAYROLL_TAX_PAYABLE',
  benefitsLiability: '2115_PAYROLL_BENEFITS_PAYABLE',
  wagesPayable: '2125_PAYROLL_WAGES_PAYABLE',
  wagesPayableClearing: '2126_PAYROLL_WAGES_PAYABLE_CLEARING',
  cashClearing: '1005_CASH_BANK_CLEARING',
} as const;

export type PayrollRunPostingInput = {
  runId: string;
  workspaceId: string;
  approvedAt: Date;
  postingCurrency: string;
  payrollExpense: Prisma.Decimal;
  taxLiability: Prisma.Decimal;
  benefitsLiability: Prisma.Decimal;
  wagesPayable: Prisma.Decimal;
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

export async function createPayrollPosting(input: PayrollRunPostingInput) {
  const { lines, totals } = buildPayrollJournalPayload(input);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.accountingTransaction.findFirst({
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

    if (existing) {
      return {
        created: false,
        accountingTransactionId: existing.id,
        accountingEntryIds: existing.entries.map((entry) => entry.id),
        cashForecastSourceType: 'PAYROLL' as const,
        cashOutflowAmount: existing.entries
          .filter((entry) => entry.accountCode === ACCOUNT_CODES.cashClearing && entry.side === 'CREDIT')
          .reduce((sum, entry) => sum.plus(entry.amount), new Prisma.Decimal(0)),
      };
    }

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
          accountingEntryIds: entries.map((entry) => entry.id),
          sourceType: 'PAYROLL',
          sourceTable: 'PAYROLL_RUN',
          sourceId: input.runId,
          debitTotal: totals.debit.toFixed(2),
          creditTotal: totals.credit.toFixed(2),
          cashOutflowAmount: totals.cashClearing.toFixed(2),
        },
      },
    });

    return {
      created: true,
      accountingTransactionId: transaction.id,
      accountingEntryIds: entries.map((entry) => entry.id),
      cashForecastSourceType: 'PAYROLL' as const,
      cashOutflowAmount: totals.cashClearing,
    };
  });
}
