import { prisma } from '@/lib/prisma';
import { syncPrimaryRemittanceBankAccount } from '@/lib/banking/sync-primary-remittance-account';

async function main() {
  const profiles = await prisma.businessProfile.findMany({
    select: {
      workspaceId: true,
      bankName: true,
      accountName: true,
      accountNumber: true,
      ifscCode: true,
      routingLabel: true,
    },
  });

  for (const profile of profiles) {
    const hasData = [profile.bankName, profile.accountName, profile.accountNumber, profile.ifscCode]
      .some((v) => Boolean(v && v.trim()));
    if (!hasData) continue;

    await prisma.$transaction(async (tx) => {
      await syncPrimaryRemittanceBankAccount(tx, {
        workspaceId: profile.workspaceId,
        bankName: profile.bankName,
        accountHolderName: profile.accountName,
        accountNumber: profile.accountNumber,
        routingCode: profile.ifscCode,
        routingLabel: profile.routingLabel,
        sourceType: "SETTINGS_SYNC",
      });
    });
  }

  console.log(`Backfill completed for ${profiles.length} business profiles`);
}

main().finally(async () => {
  await prisma.$disconnect();
});
