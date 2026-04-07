export type InvoiceTaxMode = 'taxable' | 'exempt';

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

function toMinorUnits(value: number): number {
  return Math.round((value + Number.EPSILON) * 100);
}

function fromMinorUnits(value: number): number {
  return value / 100;
}

export function calculateInvoiceTotals({
  services,
  isTaxExempt,
  defaultTaxRate = 0.18,
}: InvoiceTotalsInput): InvoiceTotals {
  const subtotalMinor = services.reduce((sum, service) => {
    const amount = Number(service.amount || 0);
    if (!Number.isFinite(amount)) return sum;
    return sum + toMinorUnits(amount);
  }, 0);

  const taxMode: InvoiceTaxMode = isTaxExempt ? 'exempt' : 'taxable';
  const taxRate = taxMode === 'taxable' ? defaultTaxRate : 0;
  const taxMinor = Math.round(subtotalMinor * taxRate);
  const totalMinor = subtotalMinor + taxMinor;

  return {
    subtotal: fromMinorUnits(subtotalMinor),
    taxRate,
    taxAmount: fromMinorUnits(taxMinor),
    total: fromMinorUnits(totalMinor),
    taxMode,
  };
}
