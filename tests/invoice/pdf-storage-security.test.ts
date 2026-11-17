import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { getInvoicePublicFallbackPath } from '@/lib/invoice/pdf-storage';

describe('legacy invoice PDF fallback isolation', () => {
  it('preserves legitimate namespaced and pre-namespace legacy invoice paths', () => {
    expect(getInvoicePublicFallbackPath('/invoices/ws_a/INV_2026_001.pdf', 'ws_a'))
      .toBe(path.resolve(process.cwd(), 'public/invoices/ws_a/INV_2026_001.pdf'));
    expect(getInvoicePublicFallbackPath('/invoices/INV_2024_001.pdf', 'ws_a'))
      .toBe(path.resolve(process.cwd(), 'public/invoices/INV_2024_001.pdf'));
  });
  it.each([
    '/invoices/ws_b/secret.pdf',
    '/invoices/../../.env',
    '/invoices/ws_a/../../../private_uploads/invoices/ws_b/secret.pdf',
    '/invoices/ws_a/./a.pdf',
    '/invoices/ws_a/a\\\\b.pdf',
    '/receipts/ws_a/something.pdf',
    '//invoices/ws_a/a.pdf',
    'https://example.org/invoices/evil.pdf',
  ])('rejects suspicious or cross-workspace paths: %s', (stored) => {
    expect(getInvoicePublicFallbackPath(stored, 'ws_a')).toBeNull();
  });
});
