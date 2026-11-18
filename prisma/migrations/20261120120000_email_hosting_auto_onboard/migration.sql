-- AlterTable
ALTER TABLE "MailBillingSettings" ADD COLUMN     "autoOnboardEmailInvoices" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoOnboardNewDomains" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoOnboardSince" TIMESTAMP(3),
ADD COLUMN     "autoOnboardTrialDays" INTEGER NOT NULL DEFAULT 0;

