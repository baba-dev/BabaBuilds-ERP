-- AlterTable
ALTER TABLE "MailBillingMailbox" ADD COLUMN     "usageCheckedAt" TIMESTAMP(3),
ADD COLUMN     "usedMb" INTEGER;

-- AlterTable
ALTER TABLE "MailBillingSettings" ADD COLUMN     "allowMailboxManagement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastDigestOn" TIMESTAMP(3),
ADD COLUMN     "paymentDigest" TEXT NOT NULL DEFAULT 'DAILY',
ADD COLUMN     "quotaAlertPercent" INTEGER NOT NULL DEFAULT 90;

