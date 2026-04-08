import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeMoney, toDecimal } from '@/lib/money';
import { getInvoiceBilledAmount, sumInvoiceBilledAmount } from '@/lib/invoice/totals';

type InvoiceFixture = {
  totalAmount: number | string;
  grandTotal?: number | string | null;
};

test('billed revenue consistently uses grandTotal ?? totalAmount across dashboard and ledger aggregations', () => {
  const invoices: InvoiceFixture[] = [
    { totalAmount: '100.00', grandTotal: '118.00' },
    { totalAmount: '250.00', grandTotal: null },
    { totalAmount: '99.99', grandTotal: '120.49' },
    { totalAmount: '40.01' },
  ];

  const dashboardRevenue = sumInvoiceBilledAmount(invoices);
  const ledgerRevenue = invoices.reduce((sum, invoice) => sum.plus(getInvoiceBilledAmount(invoice)), toDecimal(0));

  assert.equal(serializeMoney(dashboardRevenue), '528.50');
  assert.equal(serializeMoney(ledgerRevenue), '528.50');
  assert.equal(serializeMoney(dashboardRevenue), serializeMoney(ledgerRevenue));
});
