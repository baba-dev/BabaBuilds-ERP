import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

const toDecimal = (value: Prisma.Decimal | number | string) => new Prisma.Decimal(value);

export type AccountingViolation = {
  invariantCode: string;
  severity: 'ERROR' | 'WARNING';
  details: Prisma.InputJsonValue;
};

export async function runAccountingIntegrityChecks(workspaceId: string): Promise<{
  summary: Prisma.InputJsonValue;
  violations: AccountingViolation[];
}> {
  const violations: AccountingViolation[] = [];

  const transactions = await prisma.accountingTransaction.findMany({
    where: { workspaceId },
    include: { entries: true },
  });

  for (const tx of transactions) {
    if (tx.entries.length === 0) {
      violations.push({
        invariantCode: 'NO_ORPHAN_JOURNAL_LINES',
        severity: 'ERROR',
        details: { transactionId: tx.id, reason: 'TRANSACTION_WITHOUT_LINES' },
      });
      continue;
    }

    if (tx.entries.some((entry) => !entry.isPosted)) {
      violations.push({
        invariantCode: 'IMMUTABLE_POSTED_ENTRIES',
        severity: 'ERROR',
        details: { transactionId: tx.id, reason: 'UNPOSTED_LINE_FOUND' },
      });
    }

    const debits = tx.entries
      .filter((entry) => entry.side === 'DEBIT')
      .reduce((sum, entry) => sum.plus(toDecimal(entry.amount)), toDecimal(0));

    const credits = tx.entries
      .filter((entry) => entry.side === 'CREDIT')
      .reduce((sum, entry) => sum.plus(toDecimal(entry.amount)), toDecimal(0));

    if (!debits.equals(credits)) {
      violations.push({
        invariantCode: 'DOUBLE_ENTRY_BALANCED',
        severity: 'ERROR',
        details: {
          transactionId: tx.id,
          debits: debits.toString(),
          credits: credits.toString(),
          delta: debits.minus(credits).toString(),
        },
      });
    }

    const mixedCurrency = tx.entries.some((entry) => entry.currency !== tx.postingCurrency);
    if (mixedCurrency) {
      violations.push({
        invariantCode: 'CURRENCY_CONSISTENCY',
        severity: 'ERROR',
        details: { transactionId: tx.id, postingCurrency: tx.postingCurrency },
      });
    }

    const timestampPolicyBreached = tx.entries.some((entry) => entry.postedAt.getTime() !== tx.postedAt.getTime());
    if (timestampPolicyBreached) {
      violations.push({
        invariantCode: 'POSTING_TIMESTAMP_POLICY',
        severity: 'WARNING',
        details: { transactionId: tx.id, policy: 'ENTRY_POSTED_AT_MUST_MATCH_TRANSACTION_POSTED_AT' },
      });
    }
  }

  const negativeCashEntry = await prisma.accountingEntry.findFirst({
    where: {
      workspaceId,
      accountCode: '1000_CASH',
      side: 'CREDIT',
      amount: { gt: 0 },
      transaction: { eventType: 'PAYMENT_CAPTURED' },
    },
    include: { transaction: true },
  });

  if (negativeCashEntry) {
    violations.push({
      invariantCode: 'NO_NEGATIVE_CASH_ON_CAPTURE',
      severity: 'ERROR',
      details: {
        entryId: negativeCashEntry.id,
        transactionId: negativeCashEntry.transactionId,
        reason: 'PAYMENT_CAPTURED_MUST_INCREASE_CASH',
      },
    });
  }

  const invoiceCount = await prisma.invoice.count({ where: { workspaceId } });
  const ledgerInvoiceCount = await prisma.accountingTransaction.count({
    where: { workspaceId, eventType: 'INVOICE_CREATED' },
  });

  if (ledgerInvoiceCount < invoiceCount) {
    violations.push({
      invariantCode: 'OPS_LEDGER_RECON_INVOICE_COUNT',
      severity: 'ERROR',
      details: { invoiceCount, ledgerInvoiceCount, delta: invoiceCount - ledgerInvoiceCount },
    });
  }

  const paidBillingCount = await prisma.billingTransaction.count({
    where: { workspaceId, status: 'PAID' },
  });
  const paymentCaptureCount = await prisma.accountingTransaction.count({
    where: { workspaceId, eventType: 'PAYMENT_CAPTURED' },
  });

  if (paymentCaptureCount < paidBillingCount) {
    violations.push({
      invariantCode: 'OPS_LEDGER_RECON_PAYMENT_COUNT',
      severity: 'ERROR',
      details: { paidBillingCount, paymentCaptureCount, delta: paidBillingCount - paymentCaptureCount },
    });
  }

  const reportView = await prisma.invoice.aggregate({
    where: { workspaceId },
    _sum: { totalAmount: true },
  });

  const ledgerRevenue = await prisma.accountingEntry.aggregate({
    where: {
      workspaceId,
      accountCode: '4000_REVENUE',
      side: 'CREDIT',
      transaction: { eventType: 'INVOICE_CREATED' },
    },
    _sum: { amount: true },
  });

  const reportRevenue = toDecimal(reportView._sum.totalAmount ?? 0);
  const ledgerRevenueValue = toDecimal(ledgerRevenue._sum.amount ?? 0);
  if (!reportRevenue.equals(ledgerRevenueValue)) {
    violations.push({
      invariantCode: 'OPS_LEDGER_REPORTING_REVENUE_MATCH',
      severity: 'WARNING',
      details: {
        reportRevenue: reportRevenue.toString(),
        ledgerRevenue: ledgerRevenueValue.toString(),
        delta: reportRevenue.minus(ledgerRevenueValue).toString(),
      },
    });
  }

  const summary = {
    transactionsChecked: transactions.length,
    violations: violations.length,
    invariantCodes: [...new Set(violations.map((violation) => violation.invariantCode))],
  };

  return { summary, violations };
}

export async function persistAccountingIntegrityRun(workspaceId: string): Promise<{
  runId: string;
  summary: Prisma.InputJsonValue;
  violations: AccountingViolation[];
}> {
  const run = await prisma.accountingIntegrityRun.create({
    data: {
      workspaceId,
      runType: 'NIGHTLY',
      status: 'RUNNING',
    },
  });

  try {
    const { summary, violations } = await runAccountingIntegrityChecks(workspaceId);

    if (violations.length > 0) {
      await prisma.accountingViolationReport.createMany({
        data: violations.map((violation) => ({
          workspaceId,
          runId: run.id,
          invariantCode: violation.invariantCode,
          severity: violation.severity,
          details: violation.details,
        })),
      });
    }

    await prisma.accountingIntegrityRun.update({
      where: { id: run.id },
      data: {
        status: violations.length > 0 ? 'VIOLATIONS_FOUND' : 'PASSED',
        completedAt: new Date(),
        summary,
      },
    });

    return { runId: run.id, summary, violations };
  } catch (error) {
    await prisma.accountingIntegrityRun.update({
      where: { id: run.id },
      data: {
        status: 'FAILED',
        completedAt: new Date(),
        summary: { error: String(error) },
      },
    });
    throw error;
  }
}
