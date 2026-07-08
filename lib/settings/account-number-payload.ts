export type SettingsBankAccountDisplaySource = {
  accountNumber?: string | null;
  primaryBankAccount?: {
    accountNumberDisplay?: string | null;
    maskedAccountNumber?: string | null;
  } | null;
};

export function getSettingsAccountNumberDisplay(data: SettingsBankAccountDisplaySource): string {
  return (
    data.accountNumber ||
    data.primaryBankAccount?.accountNumberDisplay ||
    data.primaryBankAccount?.maskedAccountNumber ||
    ""
  );
}

export function shouldSubmitSettingsAccountNumber(value: string, serverDisplayValue: string | null): boolean {
  if (!value) return false;
  return !serverDisplayValue || value !== serverDisplayValue;
}
