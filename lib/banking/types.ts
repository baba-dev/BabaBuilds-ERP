export type RemittanceSource = "BANK_ACCOUNT" | "BUSINESS_PROFILE_LEGACY";

export type NormalizedPrimaryRemittanceAccount = {
  id: string | null;
  bankName: string | null;
  accountHolderName: string | null;
  maskedAccountNumber: string | null;
  accountNumberDisplay: string | null;
  routingCode: string | null;
  routingLabel: string;
  currency: string;
  isPrimaryRemittance: boolean;
  source: RemittanceSource;
};

export type PrimaryRemittanceSyncSourceType = "SETTINGS_SYNC" | "SETUP_SEEDED" | "CASH_FLOW";
