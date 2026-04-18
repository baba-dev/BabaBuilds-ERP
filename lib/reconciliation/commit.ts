import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';

type InvoiceSplitLine = {
  invoiceNumber: string;
  amount: number;
};

type ReconciliationTransaction = {
  id?: string;
  date?: string;
  amount?: string | number;
  description?: string;
  aiCategory?: string;
  aiVendor?: string;
  matchId?: string;
  bankTransactionId?: string;
  confidence?: number;
  /** When set, apply one bank credit across multiple invoices */
  invoiceSplits?: InvoiceSplitLine[];
  /** Link debit to an existing expense (duplicate detection) without creating a new row */
  linkToExpenseId?: string;
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
    bankTransactionsUpdated: number;
    splitsCreated: number;
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
      let bankTransactionsUpdated = 0;
      let splitsCreated = 0;

      if (newExpenses.length > 0) {
        for (let i = 0; i < newExpenses.length; i++) {
          const row = approvedExpenses[i];
          if (row.linkToExpenseId) {
            const upd = await tx.bankTransaction.updateMany({
              where: {
                id: row.bankTransactionId ?? row.id,
                workspaceId,
              },
              data: {
                matchedExpenseId: row.linkToExpenseId,
                isReconciled: true,
                reconciliationConfidence:
                  typeof row.confidence === 'number' ? row.confidence : null,
                category: row.aiCategory ?? undefined,
              },
            });
            if (upd.count > 0) bankTransactionsUpdated++;
            continue;
          }

          const created = await tx.expense.create({ data: newExpenses[i] });
          expensesCreated++;

          const bankTxId = row.bankTransactionId ?? row.id;
          if (bankTxId) {
            const upd = await tx.bankTransaction.updateMany({
              where: {
                id: bankTxId,
                workspaceId,
              },
              data: {
                matchedExpenseId: created.id,
                isReconciled: true,
                reconciliationConfidence:
                  typeof row.confidence === 'number' ? row.confidence : null,
                category: row.aiCategory ?? undefined,
              },
            });
            if (upd.count > 0) bankTransactionsUpdated++;
          }
        }
      }

      if (approvedInvoices.length > 0) {
        for (const bankLine of approvedInvoices) {
          const bankTxId = bankLine.bankTransactionId ?? bankLine.id;
          const splits = Array.isArray(bankLine.invoiceSplits)
            ? bankLine.invoiceSplits.filter(
                (s) => s && typeof s.invoiceNumber === 'string' && Number(s.amount) > 0,
              )
            : [];

          if (splits.length > 0) {
            let primaryInvoiceId: string | null = null;
            for (const line of splits) {
              const inv = await tx.invoice.findFirst({
                where: { workspaceId, invoiceNumber: line.invoiceNumber },
                select: {
                  id: true,
                  totalAmount: true,
                  grandTotal: true,
                  amountReceived: true,
                },
              });
              if (!inv) continue;

              const bankAmount = new Prisma.Decimal(
                Math.abs(parseFloat(String(line.amount))),
              ).toDecimalPlaces(2);
              const existingReceived = new Prisma.Decimal(inv.amountReceived ?? 0);
              const newCumulative = existingReceived.plus(bankAmount).toDecimalPlaces(2);
              const billedAmount = new Prisma.Decimal(inv.grandTotal ?? inv.totalAmount ?? 0);
              const ONE_PAISA = new Prisma.Decimal('0.005');
              const newStatus = newCumulative.gte(billedAmount.minus(ONE_PAISA))
                ? 'PAID'
                : 'PARTIALLY_PAID';

              await tx.invoice.update({
                where: { id: inv.id },
                data: {
                  status: newStatus,
                  amountReceived: newCumulative.toNumber(),
                  dateReceived: bankLine?.date ? new Date(bankLine.date) : new Date(),
                },
              });
              invoicesReconciled++;

              if (bankTxId) {
                await tx.bankTransactionInvoiceSplit.create({
                  data: {
                    bankTransactionId: bankTxId,
                    invoiceId: inv.id,
                    amount: bankAmount,
                  },
                });
                splitsCreated++;
              }
              if (!primaryInvoiceId) primaryInvoiceId = inv.id;
            }

            if (bankTxId && primaryInvoiceId) {
              const upd = await tx.bankTransaction.updateMany({
                where: { id: bankTxId, workspaceId },
                data: {
                  matchedInvoiceId: primaryInvoiceId,
                  isReconciled: true,
                  reconciliationConfidence:
                    typeof bankLine.confidence === 'number'
                      ? bankLine.confidence
                      : 100,
                },
              });
              if (upd.count > 0) bankTransactionsUpdated++;
            }
            continue;
          }

          const invNum = bankLine.matchId;
          if (!invNum) continue;

          const dbInv = await tx.invoice.findFirst({
            where: { workspaceId, invoiceNumber: invNum },
            select: {
              id: true,
              invoiceNumber: true,
              totalAmount: true,
              grandTotal: true,
              amountReceived: true,
            },
          });
          if (!dbInv) continue;

          const bankAmount = new Prisma.Decimal(
            Math.abs(parseFloat(String(bankLine?.amount ?? 0))),
          ).toDecimalPlaces(2);
          const existingReceived = new Prisma.Decimal(dbInv.amountReceived ?? 0);
          const newCumulative = existingReceived.plus(bankAmount).toDecimalPlaces(2);
          const billedAmount = new Prisma.Decimal(dbInv.grandTotal ?? dbInv.totalAmount ?? 0);
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

          if (bankTxId) {
            const upd = await tx.bankTransaction.updateMany({
              where: {
                id: bankTxId,
                workspaceId,
              },
              data: {
                matchedInvoiceId: dbInv.id,
                isReconciled: true,
                reconciliationConfidence:
                  typeof bankLine.confidence === 'number'
                    ? bankLine.confidence
                    : 100,
              },
            });
            if (upd.count > 0) bankTransactionsUpdated++;
          }
        }
      }

      return { expensesCreated, invoicesReconciled, bankTransactionsUpdated, splitsCreated };
    });

    return {
      ok: true,
      status: 200,
      body: {
        success: true,
        message: `Successfully logged ${result.expensesCreated} expense(s), reconciled ${result.invoicesReconciled} invoice(s), updated ${result.bankTransactionsUpdated} bank line(s), ${result.splitsCreated} split line(s).`,
        expensesCreated: result.expensesCreated,
        invoicesReconciled: result.invoicesReconciled,
        bankTransactionsUpdated: result.bankTransactionsUpdated,
        splitsCreated: result.splitsCreated,
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
