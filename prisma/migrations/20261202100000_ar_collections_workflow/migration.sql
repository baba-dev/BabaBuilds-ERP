-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "promiseDate" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "nextFollowUpAt" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "disputeReason" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "collectionReminders" INTEGER NOT NULL DEFAULT 0;
