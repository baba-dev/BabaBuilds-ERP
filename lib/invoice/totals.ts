export type InvoiceTaxMode = 'taxable' | 'exempt' | 'mixed';
import type { MoneyInput } from '@/lib/money';
import { toDecimal } from '@/lib/money';
import { Prisma } from '@prisma/client';

export interface InvoiceTotalsInput {
  services: Array<{ amount: number, taxRate?: number | null }>;
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
  let subtotalDecimal = new Prisma.Decimal(0);
  let taxAmountDecimal = new Prisma.Decimal(0);
  const ratesUsed = new Set<number>();

  services.forEach((service) => {
    const amount = toDecimal(service.amount || 0);
    subtotalDecimal = subtotalDecimal.plus(amount);

    const itemTaxRate = isTaxExempt ? 0 : (service.taxRate ?? defaultTaxRate);
    ratesUsed.add(itemTaxRate);
    const itemTaxAmount = amount.times(itemTaxRate);
    taxAmountDecimal = taxAmountDecimal.plus(itemTaxAmount);
  });

  const taxMode: InvoiceTaxMode = isTaxExempt ? 'exempt' : (ratesUsed.size > 1 ? 'mixed' : 'taxable');
  
  const taxAmount = taxAmountDecimal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const total = subtotalDecimal.plus(taxAmount);

  const effectiveTaxRate = isTaxExempt ? 0 : (ratesUsed.size === 1 ? Array.from(ratesUsed)[0] : defaultTaxRate);

  return {
    subtotal: subtotalDecimal.toNumber(),
    taxRate: effectiveTaxRate,
    taxAmount: taxAmount.toNumber(),
    total: total.toNumber(),
    taxMode,
  };
}
