export type InvoiceTaxMode = 'taxable' | 'exempt';
import type { MoneyInput } from '@/lib/money';
import { toDecimal } from '@/lib/money';
import { Prisma } from '@prisma/client';

export interface InvoiceTotalsInput {
  services: Array<{ amount: number }>;
  isTaxExempt: boolean;
  defaultTaxRate?: number;
}

export interface InvoiceTotals {
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  total: number;
  taxMode: InvoiceTaxMode;
}

export interface InvoiceBilledAmountInput {
  totalAmount?: MoneyInput;
  grandTotal?: MoneyInput;
}

export function getInvoiceBilledAmount(invoice: InvoiceBilledAmountInput): Prisma.Decimal {
  return toDecimal(invoice.grandTotal ?? invoice.totalAmount);
}

export function sumInvoiceBilledAmount(invoices: InvoiceBilledAmountInput[]): Prisma.Decimal {
  return invoices.reduce(
    (sum, invoice) => sum.plus(getInvoiceBilledAmount(invoice)),
    new Prisma.Decimal(0)
  );
}

export function calculateInvoiceTotals({
  services,
  isTaxExempt,
  defaultTaxRate = 0.18,
}: InvoiceTotalsInput): InvoiceTotals {
  const subtotal = services.reduce((sum, service) => {
    return sum.plus(toDecimal(service.amount || 0));
  }, new Prisma.Decimal(0));

  const taxMode: InvoiceTaxMode = isTaxExempt ? 'exempt' : 'taxable';
  const taxRate = taxMode === 'taxable' ? defaultTaxRate : 0;
  
  const taxAmount = subtotal.times(taxRate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const total = subtotal.plus(taxAmount);

  return {
    subtotal: subtotal.toNumber(),
    taxRate,
    taxAmount: taxAmount.toNumber(),
    total: total.toNumber(),
    taxMode,
  };
}
