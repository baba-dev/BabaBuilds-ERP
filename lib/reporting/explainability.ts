import { Prisma } from '@prisma/client';
import { getInvoiceBilledAmount } from '@/lib/invoice/totals';
import { toDecimal } from '@/lib/money';

export interface InvoiceLike {
  id: string;
  totalAmount?: number | string;
  grandTotal?: number | string | null;
  invoiceDate: string;
}

export interface PaymentLike {
  id: string;
  invoiceId: string;
  amount: number | string;
  receivedAt: string;
}

export interface JournalEntryLike {
  id: string;
  accountCode: string;
  postingDate: string;
  amount: number | string;
}

export interface ExplainabilityArtifact {
  artifactType: 'report_figure_trace';
  artifactVersion: string;
  generatedAt: string;
  figureId: string;
  value: string;
  unit: 'currency';
  sourceEntries: Array<{
    table: string;
    entryId: string;
    amount: string;
    contribution: string;
    note: string;
  }>;
}

const serialize = (value: Prisma.Decimal): string => value.toDecimalPlaces(2).toFixed(2);

export function buildRevenueFigureTrace(figureId: string, invoices: InvoiceLike[]): ExplainabilityArtifact {
  const sourceEntries = invoices.map((invoice) => {
    const amount = getInvoiceBilledAmount(invoice);
    return {
      table: 'Invoice',
      entryId: invoice.id,
      amount: serialize(amount),
      contribution: serialize(amount),
      note: 'Recognized billed amount from grandTotal ?? totalAmount',
    };
  });

  const value = invoices.reduce((sum, invoice) => sum.plus(getInvoiceBilledAmount(invoice)), new Prisma.Decimal(0));

  return {
    artifactType: 'report_figure_trace',
    artifactVersion: '2026.04.11',
    generatedAt: new Date().toISOString(),
    figureId,
    value: serialize(value),
    unit: 'currency',
    sourceEntries,
  };
}

export function buildDeferredRevenueFigureTrace(
  figureId: string,
  invoices: InvoiceLike[],
  payments: PaymentLike[]
): ExplainabilityArtifact {
  const settledByInvoice = payments.reduce<Record<string, Prisma.Decimal>>((acc, payment) => {
    const key = payment.invoiceId;
    acc[key] = (acc[key] ?? new Prisma.Decimal(0)).plus(toDecimal(payment.amount));
    return acc;
  }, {});

  const sourceEntries: ExplainabilityArtifact['sourceEntries'] = [];
  let aggregate = new Prisma.Decimal(0);

  invoices.forEach((invoice) => {
    const billed = getInvoiceBilledAmount(invoice);
    const settled = settledByInvoice[invoice.id] ?? new Prisma.Decimal(0);
    const deferred = Prisma.Decimal.max(new Prisma.Decimal(0), billed.minus(settled));
    aggregate = aggregate.plus(deferred);

    sourceEntries.push(
      {
        table: 'Invoice',
        entryId: invoice.id,
        amount: serialize(billed),
        contribution: serialize(deferred),
        note: 'Deferred balance computed as max(0, billed - settled)',
      },
      ...payments
        .filter((payment) => payment.invoiceId === invoice.id)
        .map((payment) => ({
          table: 'Payment',
          entryId: payment.id,
          amount: serialize(toDecimal(payment.amount)),
          contribution: serialize(toDecimal(payment.amount).mul(-1)),
          note: 'Settlement payment reducing deferred balance',
        }))
    );
  });

  return {
    artifactType: 'report_figure_trace',
    artifactVersion: '2026.04.11',
    generatedAt: new Date().toISOString(),
    figureId,
    value: serialize(aggregate),
    unit: 'currency',
    sourceEntries,
  };
}

export function buildAccrualFigureTrace(
  figureId: string,
  journalEntries: JournalEntryLike[],
  cutoffDate: string
): ExplainabilityArtifact {
  const cutoff = new Date(cutoffDate);

  const included = journalEntries.filter((entry) => {
    const postingDate = new Date(entry.postingDate);
    return !Number.isNaN(postingDate.getTime()) && postingDate <= cutoff;
  });

  const value = included.reduce((sum, entry) => sum.plus(toDecimal(entry.amount)), new Prisma.Decimal(0));

  return {
    artifactType: 'report_figure_trace',
    artifactVersion: '2026.04.11',
    generatedAt: new Date().toISOString(),
    figureId,
    value: serialize(value),
    unit: 'currency',
    sourceEntries: included.map((entry) => {
      const amount = toDecimal(entry.amount);
      return {
        table: 'JournalEntry',
        entryId: entry.id,
        amount: serialize(amount),
        contribution: serialize(amount),
        note: `Accrual included for account ${entry.accountCode} up to cutoff ${cutoffDate}`,
      };
    }),
  };
}
