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

function roundCurrency(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function calculateInvoiceTotals({
  services,
  isTaxExempt,
  defaultTaxRate = 0.18,
}: InvoiceTotalsInput): InvoiceTotals {
  const subtotal = roundCurrency(
    services.reduce((sum, service) => sum + Number(service.amount || 0), 0)
  );
  const taxMode: InvoiceTaxMode = isTaxExempt ? 'exempt' : 'taxable';
  const taxRate = taxMode === 'taxable' ? defaultTaxRate : 0;
  const taxAmount = roundCurrency(subtotal * taxRate);
  const total = roundCurrency(subtotal + taxAmount);

  return {
    subtotal,
    taxRate,
    taxAmount,
    total,
    taxMode,
  };
}
