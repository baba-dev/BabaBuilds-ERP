import { describe, expect, it } from 'vitest';
import { maskAccountNumber, normalizeRoutingCode } from '@/lib/banking/mask';
import { resolvePrimaryRemittanceFromProfile } from '@/lib/banking/resolve-primary-remittance';
import { scorePrimaryRemittanceCandidate } from '@/lib/banking/sync-primary-remittance-account';

describe('banking remittance utils', () => {
  it('masks account number safely', () => {
    expect(maskAccountNumber('1234567890')).toBe('••••••7890');
    expect(maskAccountNumber('4321')).toBe('4321');
  });

  it('normalizes routing code', () => {
    expect(normalizeRoutingCode(' ab c 123 ')).toBe('AB C 123');
  });

  it('prefers canonical primary bank account when present', () => {
    const resolved = resolvePrimaryRemittanceFromProfile({
      routingLabel: 'IFSC',
      workspace: { baseCurrency: 'INR' },
      bankName: 'Legacy Bank',
      accountName: 'Legacy Holder',
      accountNumber: '9999',
      ifscCode: 'legacy',
      primaryBankAccount: {
        id: 'ba_1',
        bankName: 'Canonical Bank',
        accountHolderName: 'Canonical Holder',
        maskedAccountNumber: '••••1111',
        routingCode: 'IFSC001',
        isPrimaryRemittance: true,
        currency: 'USD',
      },
    });

    expect(resolved.source).toBe('BANK_ACCOUNT');
    expect(resolved.bankName).toBe('Canonical Bank');
    expect(resolved.maskedAccountNumber).toBe('••••1111');
    expect(resolved.currency).toBe('USD');
  });

  it('scores candidate matches with strong preference for masked account equality', () => {
    const score = scorePrimaryRemittanceCandidate(
      {
        bankName: 'Acme Bank',
        accountHolderName: 'Baba Builds',
        maskedAccountNumber: '••••1234',
      },
      {
        bankName: 'acme bank',
        accountHolderName: 'baba builds',
        masked: '••••1234',
        last4: '1234',
      },
    );
    expect(score).toBeGreaterThanOrEqual(4);
  });
});
