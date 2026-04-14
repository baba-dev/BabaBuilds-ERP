import test from 'node:test';
import assert from 'node:assert/strict';
import { Prisma } from '@prisma/client';

import {
  determineInvoicePaymentStatus,
  validatePayInvoicePayload,
  validatePaymentBusinessRules,
} from './logic';
import { INVOICE_STATUS } from '@/lib/invoice-status';

// Helper: wrap a plain number or decimal string in Prisma.Decimal for test call sites
const d = (n: number | string) => new Prisma.Decimal(n);

test('validatePayInvoicePayload rejects invalid amount/date', () => {
  const result = validatePayInvoicePayload({ amountReceived: -1, dateReceived: 'not-a-date' });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'INVALID_PAYMENT_PAYLOAD');
  }
});

test('validatePayInvoicePayload accepts zero amount and iso date', () => {
  const result = validatePayInvoicePayload({ amountReceived: 0, dateReceived: '2026-04-07' });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.amountReceived, 0);
  }
});

test('validatePayInvoicePayload rejects too large amount', () => {
  const result = validatePayInvoicePayload({ amountReceived: 1_000_000_001, dateReceived: '2026-04-07' });
  assert.equal(result.ok, false);
});

test('determineInvoicePaymentStatus covers 0 partial full overpayment values', () => {
  assert.equal(determineInvoicePaymentStatus(d(0), d(1000)), INVOICE_STATUS.PENDING);
  assert.equal(determineInvoicePaymentStatus(d(250), d(1000)), INVOICE_STATUS.PARTIALLY_PAID);
  assert.equal(determineInvoicePaymentStatus(d(1000), d(1000)), INVOICE_STATUS.PAID);
  assert.equal(determineInvoicePaymentStatus(d(1200), d(1000)), INVOICE_STATUS.PAID);
});

test('validatePaymentBusinessRules rejects overpayment unless explicitly allowed', () => {
  const blocked = validatePaymentBusinessRules({
    invoiceStatus: INVOICE_STATUS.PENDING,
    cumulativeAmountReceived: d(1200),
    invoiceGrandTotal: d(1000),
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.error.code, 'OVERPAYMENT_NOT_ALLOWED');
  }

  const allowed = validatePaymentBusinessRules({
    invoiceStatus: INVOICE_STATUS.PENDING,
    cumulativeAmountReceived: d(1200),
    invoiceGrandTotal: d(1000),
    allowOverpayment: true,
  });
  assert.equal(allowed.ok, true);
});

test('validatePaymentBusinessRules rejects non-payable statuses', () => {
  const result = validatePaymentBusinessRules({
    invoiceStatus: 'VOID',
    cumulativeAmountReceived: d(100),
    invoiceGrandTotal: d(1000),
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'INVOICE_STATUS_NOT_PAYABLE');
  }
});

test('two-step partial payments remain PARTIALLY_PAID until fully settled', () => {
  const invoiceGrandTotal = d(1000);
  let existingReceived = d(0);

  const firstIncomingPayment = d(300);
  const firstCumulative = existingReceived.plus(firstIncomingPayment);
  assert.equal(determineInvoicePaymentStatus(firstCumulative, invoiceGrandTotal), INVOICE_STATUS.PARTIALLY_PAID);
  existingReceived = firstCumulative;

  const secondIncomingPayment = d(200);
  const secondCumulative = existingReceived.plus(secondIncomingPayment);
  assert.equal(determineInvoicePaymentStatus(secondCumulative, invoiceGrandTotal), INVOICE_STATUS.PARTIALLY_PAID);
});

test('exact final settlement transitions cumulative total to PAID', () => {
  const invoiceGrandTotal = d(1000);
  const existingReceived = d(400);
  const incomingPayment = d(600);
  const newCumulativeReceived = existingReceived.plus(incomingPayment);

  assert.ok(newCumulativeReceived.equals(invoiceGrandTotal));
  assert.equal(determineInvoicePaymentStatus(newCumulativeReceived, invoiceGrandTotal), INVOICE_STATUS.PAID);
});

test('overpayment rejection uses cumulative math, not only incoming amount', () => {
  const invoiceGrandTotal = d(1000);
  const existingReceived = d(900);
  const incomingPayment = d(200);
  const newCumulativeReceived = existingReceived.plus(incomingPayment);

  const result = validatePaymentBusinessRules({
    invoiceStatus: INVOICE_STATUS.PARTIALLY_PAID,
    cumulativeAmountReceived: newCumulativeReceived,
    invoiceGrandTotal,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'OVERPAYMENT_NOT_ALLOWED');
  }
});

test('floating-point drift: 500.005 + 500.005 correctly resolves to PAID (1-paisa tolerance)', () => {
  // Classic IEEE 754 problem: 500.005 + 500.005 = 1000.0099999... as a native number
  // Prisma.Decimal handles this correctly
  const invoiceGrandTotal = d('1000.01');
  const firstPayment = d('500.005');
  const secondPayment = d('500.005');
  const cumulative = firstPayment.plus(secondPayment).toDecimalPlaces(2);
  assert.equal(determineInvoicePaymentStatus(cumulative, invoiceGrandTotal), INVOICE_STATUS.PAID);
});
