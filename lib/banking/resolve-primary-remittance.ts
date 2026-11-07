import { prisma } from "@/lib/prisma";
import { maskAccountNumber } from "@/lib/banking/mask";
import type { NormalizedPrimaryRemittanceAccount } from "@/lib/banking/types";

type RemittanceProfile =
  | {
      routingLabel?: string | null;
      bankName?: string | null;
      accountName?: string | null;
      accountNumber?: string | null;
      ifscCode?: string | null;
      workspace?: { baseCurrency?: string | null; [key: string]: unknown } | null;
      primaryBankAccount?: {
        id?: string | null;
        bankName?: string | null;
        accountHolderName?: string | null;
        maskedAccountNumber?: string | null;
        routingCode?: string | null;
        currency?: string | null;
        isPrimaryRemittance?: boolean | null;
      } | null;
    }
  | null
  | undefined;

function fromProfile(profile: RemittanceProfile): NormalizedPrimaryRemittanceAccount {
  const routingLabel = profile?.routingLabel || "IFSC Code";
  const currency = profile?.workspace?.baseCurrency || "INR";
  const primary = profile?.primaryBankAccount;

  if (primary) {
    return {
      id: primary.id ?? null,
      bankName: primary.bankName ?? null,
      accountHolderName: primary.accountHolderName ?? null,
      maskedAccountNumber: primary.maskedAccountNumber ?? null,
      accountNumberDisplay: primary.maskedAccountNumber ?? null,
      routingCode: primary.routingCode ?? null,
      routingLabel,
      currency: primary.currency ?? currency,
      isPrimaryRemittance: Boolean(primary.isPrimaryRemittance),
      source: "BANK_ACCOUNT",
    };
  }

  return {
    id: null,
    bankName: profile?.bankName ?? null,
    accountHolderName: profile?.accountName ?? null,
    maskedAccountNumber: maskAccountNumber(profile?.accountNumber ?? null),
    accountNumberDisplay: maskAccountNumber(profile?.accountNumber ?? null),
    routingCode: profile?.ifscCode ?? null,
    routingLabel,
    currency,
    isPrimaryRemittance: false,
    source: "BUSINESS_PROFILE_LEGACY",
  };
}

export async function resolvePrimaryRemittanceBankAccount(workspaceId: string): Promise<NormalizedPrimaryRemittanceAccount> {
  const profile = await prisma.businessProfile.findUnique({
    where: { workspaceId },
    include: {
      workspace: { select: { baseCurrency: true } },
      primaryBankAccount: true,
    },
  });

  if (!profile) {
    return {
      id: null,
      bankName: null,
      accountHolderName: null,
      maskedAccountNumber: null,
      accountNumberDisplay: null,
      routingCode: null,
      routingLabel: "IFSC Code",
      currency: "INR",
      isPrimaryRemittance: false,
      source: "BUSINESS_PROFILE_LEGACY",
    };
  }

  return fromProfile(profile);
}

export function resolvePrimaryRemittanceFromProfile(profile: RemittanceProfile): NormalizedPrimaryRemittanceAccount {
  return fromProfile(profile);
}
