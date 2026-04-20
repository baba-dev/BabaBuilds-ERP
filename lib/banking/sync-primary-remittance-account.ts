import type { Prisma } from "@prisma/client";
import { maskAccountNumber, normalizeRoutingCode, toLast4 } from "@/lib/banking/mask";
import type { PrimaryRemittanceSyncSourceType } from "@/lib/banking/types";

type Tx = Prisma.TransactionClient;

type SyncInput = {
  workspaceId: string;
  bankName?: string | null;
  accountHolderName?: string | null;
  accountNumber?: string | null;
  routingCode?: string | null;
  routingLabel?: string | null;
  currency?: string | null;
  sourceType: PrimaryRemittanceSyncSourceType;
};

function normalized(v?: string | null) {
  return v?.trim().toLowerCase() || null;
}

export function scorePrimaryRemittanceCandidate(
  candidate: { bankName: string | null; accountHolderName: string | null; maskedAccountNumber: string | null },
  incoming: { bankName: string | null; accountHolderName: string | null; masked: string | null; last4: string | null },
) {
  let score = 0;
  const candidateBank = normalized(candidate.bankName);
  const incomingBank = normalized(incoming.bankName);
  if (candidateBank && incomingBank && candidateBank === incomingBank) score += 1;

  const candidateHolder = normalized(candidate.accountHolderName);
  const incomingHolder = normalized(incoming.accountHolderName);
  if (candidateHolder && incomingHolder && candidateHolder === incomingHolder) score += 1;

  if (incoming.masked && candidate.maskedAccountNumber === incoming.masked) score += 2;
  if (incoming.last4 && candidate.maskedAccountNumber?.endsWith(incoming.last4)) score += 1;
  return score;
}

export async function syncPrimaryRemittanceBankAccount(tx: Tx, input: SyncInput) {
  const bankName = input.bankName?.trim() || null;
  const accountHolderName = input.accountHolderName?.trim() || null;
  const accountNumber = input.accountNumber?.trim() || null;
  const routingCode = normalizeRoutingCode(input.routingCode);
  const hasUsable = Boolean(bankName || accountHolderName || accountNumber || routingCode);

  const profile = await tx.businessProfile.findUnique({ where: { workspaceId: input.workspaceId } });
  if (!profile) return null;

  if (!hasUsable) {
    await tx.bankAccount.updateMany({
      where: { workspaceId: input.workspaceId, isPrimaryRemittance: true },
      data: { isPrimaryRemittance: false },
    });
    await tx.businessProfile.update({
      where: { workspaceId: input.workspaceId },
      data: {
        primaryBankAccountId: null,
        bankName: "",
        accountName: "",
        accountNumber: "",
        ifscCode: "",
      },
    });
    return null;
  }

  const masked = maskAccountNumber(accountNumber);
  const last4 = toLast4(accountNumber);

  const existingByProfile = profile.primaryBankAccountId
    ? await tx.bankAccount.findFirst({
        where: { id: profile.primaryBankAccountId, workspaceId: input.workspaceId },
      })
    : null;

  let existing = existingByProfile;
  if (!existing) {
    const candidates = await tx.bankAccount.findMany({
      where: {
        workspaceId: input.workspaceId,
        OR: [
          bankName ? { bankName } : undefined,
          masked ? { maskedAccountNumber: masked } : undefined,
          last4 ? { maskedAccountNumber: { endsWith: last4 } } : undefined,
          accountHolderName ? { accountHolderName } : undefined,
        ].filter(Boolean) as Prisma.BankAccountWhereInput[],
      },
      select: { id: true, name: true, bankName: true, accountHolderName: true, maskedAccountNumber: true, currency: true },
    });

    const best = candidates
      .map((candidate) => ({
        candidate,
        score: scorePrimaryRemittanceCandidate(candidate, { bankName, accountHolderName, masked, last4 }),
      }))
      .sort((a, b) => b.score - a.score)[0];

    if (best && best.score >= 2) {
      existing = await tx.bankAccount.findUnique({ where: { id: best.candidate.id } });
    }
  }

  let account = existing;
  if (account) {
    account = await tx.bankAccount.update({
      where: { id: account.id },
      data: {
        name: account.name || "Primary Remittance",
        bankName,
        accountHolderName,
        maskedAccountNumber: masked,
        routingCode,
        sourceType: input.sourceType,
        currency: input.currency || account.currency || "INR",
        isPrimaryRemittance: true,
      },
    });
  } else {
    account = await tx.bankAccount.create({
      data: {
        workspaceId: input.workspaceId,
        name: "Primary Remittance",
        bankName,
        accountHolderName,
        maskedAccountNumber: masked,
        routingCode,
        currency: input.currency || "INR",
        sourceType: input.sourceType,
        isPrimaryRemittance: true,
      },
    });
  }

  await tx.bankAccount.updateMany({
    where: { workspaceId: input.workspaceId, isPrimaryRemittance: true, id: { not: account.id } },
    data: { isPrimaryRemittance: false },
  });

  await tx.businessProfile.update({
    where: { workspaceId: input.workspaceId },
    data: {
      primaryBankAccountId: account.id,
      bankName: bankName || "",
      accountName: accountHolderName || "",
      accountNumber: accountNumber || "",
      ifscCode: routingCode || "",
      routingLabel: input.routingLabel ?? profile.routingLabel,
    },
  });

  return account;
}
