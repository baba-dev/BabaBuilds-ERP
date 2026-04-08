import test from 'node:test';
import assert from 'node:assert/strict';

import {
  determineInvoicePaymentStatus,
  validatePayInvoicePayload,
  validatePaymentBusinessRules,
} from './route';
import { INVOICE_STATUS } from '@/lib/invoice-status';

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
  assert.equal(determineInvoicePaymentStatus(0, 1000), INVOICE_STATUS.PENDING);
  assert.equal(determineInvoicePaymentStatus(250, 1000), INVOICE_STATUS.PARTIALLY_PAID);
  assert.equal(determineInvoicePaymentStatus(1000, 1000), INVOICE_STATUS.PAID);
  assert.equal(determineInvoicePaymentStatus(1200, 1000), INVOICE_STATUS.PAID);
});

test('validatePaymentBusinessRules rejects overpayment unless explicitly allowed', () => {
  const blocked = validatePaymentBusinessRules({
    invoiceStatus: INVOICE_STATUS.PENDING,
    paymentAmount: 1200,
    invoiceGrandTotal: 1000,
  });
  assert.equal(blocked.ok, false);
  if (!blocked.ok) {
    assert.equal(blocked.error.code, 'OVERPAYMENT_NOT_ALLOWED');
  }

  const allowed = validatePaymentBusinessRules({
    invoiceStatus: INVOICE_STATUS.PENDING,
    paymentAmount: 1200,
    invoiceGrandTotal: 1000,
    allowOverpayment: true,
  });
  assert.equal(allowed.ok, true);
});

test('validatePaymentBusinessRules rejects non-payable statuses', () => {
  const result = validatePaymentBusinessRules({
    invoiceStatus: 'VOID',
    paymentAmount: 100,
    invoiceGrandTotal: 1000,
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, 'INVOICE_STATUS_NOT_PAYABLE');
  }
});
