import { describe, expect, it } from 'vitest';
import { getSettingsAccountNumberDisplay, shouldSubmitSettingsAccountNumber } from '@/lib/settings/account-number-payload';

describe('settings account number payload handling', () => {
  it('uses the primary bank account display value when GET omits the full account number', () => {
    expect(
      getSettingsAccountNumberDisplay({
        accountNumber: null,
        primaryBankAccount: {
          accountNumberDisplay: '•••• 4242',
          maskedAccountNumber: '••••4242',
        },
      }),
    ).toBe('•••• 4242');
  });

  it('falls back to the masked account number when no display value is present', () => {
    expect(
      getSettingsAccountNumberDisplay({
        primaryBankAccount: {
          accountNumberDisplay: null,
          maskedAccountNumber: '••••1111',
        },
      }),
    ).toBe('••••1111');
  });

  it('omits an unchanged server-provided masked placeholder from settings saves', () => {
    expect(shouldSubmitSettingsAccountNumber('•••• 4242', '•••• 4242')).toBe(false);
    expect(shouldSubmitSettingsAccountNumber('1234567890', '•••• 4242')).toBe(true);
  });
});
