import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type ReconciliationTransaction = {
  date?: string;
  amount?: string | number;
  description?: string;
  aiCategory?: string;
  aiVendor?: string;
  matchId?: string;
};

type CommitInput = {
  workspaceId: string;
  approvedInvoices: ReconciliationTransaction[];
  approvedExpenses: ReconciliationTransaction[];
};

type CommitSuccess = {
  ok: true;
  status: 200;
  body: {
    success: true;
    message: string;
    expensesCreated: number;
    invoicesReconciled: number;
  };
};

type CommitError = {
  ok: false;
  status: 400 | 500;
  body: {
    error: string;
  };
};

export type CommitResult = CommitSuccess | CommitError;

export async function commitReconciliationTransactions({
  workspaceId,
  approvedInvoices,
  approvedExpenses,
}: CommitInput): Promise<CommitResult> {
  if (!Array.isArray(approvedInvoices) || !Array.isArray(approvedExpenses)) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Invalid payload: approvedInvoices and approvedExpenses must be arrays.' },
    };
  }

  if (approvedInvoices.length === 0 && approvedExpenses.length === 0) {
    return {
      ok: false,
      status: 400,
      body: { error: 'Nothing to commit. Approve at least one transaction first.' },
    };
  }

  try {
    const newExpenses = approvedExpenses.map((exp) => ({
      workspaceId,
      date: exp.date ? new Date(exp.date) : new Date(),
      amount: Math.abs(parseFloat(String(exp.amount ?? 0))),
      category: exp.aiCategory || 'Uncategorized',
      vendor: exp.aiVendor || 'Unknown Vendor',
      description: exp.description || 'Imported via Bank Reconciliation',
    }));

    const result = await prisma.$transaction(async (tx) => {
      let expensesCreated = 0;
      let invoicesReconciled = 0;

      if (newExpenses.length > 0) {
        const created = await tx.expense.createMany({ data: newExpenses });
        expensesCreated = created.count;
      }

      if (approvedInvoices.length > 0) {
        const invoiceNumbers = approvedInvoices
          .map((inv) => inv.matchId)
          .filter((value): value is string => Boolean(value));

        if (invoiceNumbers.length > 0) {
          const dbInvoices = await tx.invoice.findMany({
            where: {
              workspaceId,
              invoiceNumber: { in: invoiceNumbers },
            },
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
              grandTotal: true,
              amountReceived: true,
            },
          });

          for (const dbInv of dbInvoices) {
            const bankLine = approvedInvoices.find((inv) => inv.matchId === dbInv.invoiceNumber);

            // Use Prisma.Decimal for all money arithmetic — accumulate, not overwrite.
            const bankAmount = new Prisma.Decimal(
              Math.abs(parseFloat(String(bankLine?.amount ?? 0)))
            ).toDecimalPlaces(2);
            const existingReceived = new Prisma.Decimal(dbInv.amountReceived ?? 0);
            const newCumulative = existingReceived.plus(bankAmount).toDecimalPlaces(2);

            // Mirror the grandTotal ?? totalAmount priority used everywhere else in the app.
            const billedAmount = new Prisma.Decimal(dbInv.grandTotal ?? dbInv.totalAmount ?? 0);

            // 1-paisa tolerance handles floating-point rounding in legacy Float amountReceived storage.
            const ONE_PAISA = new Prisma.Decimal('0.005');
            const newStatus = newCumulative.gte(billedAmount.minus(ONE_PAISA))
              ? 'PAID'
              : 'PARTIALLY_PAID';

            await tx.invoice.update({
              where: { id: dbInv.id },
              data: {
                status: newStatus,
                amountReceived: newCumulative.toNumber(),
                dateReceived: bankLine?.date ? new Date(bankLine.date) : new Date(),
              },
            });

            invoicesReconciled++;
          }
        }
      }

      return { expensesCreated, invoicesReconciled };
    });

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        message: `Successfully logged ${result.expensesCreated} expense(s) and reconciled ${result.invoicesReconciled} invoice(s).`,
        expensesCreated: result.expensesCreated,
        invoicesReconciled: result.invoicesReconciled,
      },
    };
  } catch (error) {
    console.error('Reconciliation Commit Error:', error);
    return {
      ok: false,
      status: 500,
      body: { error: 'Failed to write to ledger. The operation was rolled back. Please try again.' },
    };
  }
}
