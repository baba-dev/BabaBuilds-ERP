-- AlterTable
ALTER TABLE "MailBillingSubscription" ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "MailBillingSettings" ADD COLUMN     "prorateIncreases" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "usageBillingPolicy" TEXT NOT NULL DEFAULT 'LATEST';

-- Backfill: existing subscriptions started when they were created; cancelled ones stopped when last changed.
UPDATE "MailBillingSubscription" SET "startedAt" = "createdAt";
UPDATE "MailBillingSubscription" SET "cancelledAt" = "updatedAt" WHERE "billingStatus" = 'CANCELLED';

-- CreateTable
CREATE TABLE "MailUsageSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "capturedOn" TIMESTAMP(3) NOT NULL,
    "mailboxCount" INTEGER NOT NULL DEFAULT 0,
    "adminMailboxCount" INTEGER NOT NULL DEFAULT 0,
    "aliasCount" INTEGER NOT NULL DEFAULT 0,
    "totalQuotaMb" INTEGER NOT NULL DEFAULT 0,
    "billableMailboxCount" INTEGER NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'CRON',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailUsageSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailBillingChange" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'QUANTITY_CHANGE',
    "source" TEXT NOT NULL,
    "fromCount" INTEGER NOT NULL,
    "toCount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "prorationAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "meteredUsageId" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailBillingChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailUsageSnapshot_workspaceId_capturedOn_idx" ON "MailUsageSnapshot"("workspaceId", "capturedOn");

-- CreateIndex
CREATE UNIQUE INDEX "MailUsageSnapshot_subscriptionId_capturedOn_key" ON "MailUsageSnapshot"("subscriptionId", "capturedOn");

-- CreateIndex
CREATE INDEX "MailBillingChange_workspaceId_createdAt_idx" ON "MailBillingChange"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "MailBillingChange_subscriptionId_createdAt_idx" ON "MailBillingChange"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "MailBillingSubscription_workspaceId_trialEndsAt_idx" ON "MailBillingSubscription"("workspaceId", "trialEndsAt");

-- AddForeignKey
ALTER TABLE "MailUsageSnapshot" ADD CONSTRAINT "MailUsageSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailUsageSnapshot" ADD CONSTRAINT "MailUsageSnapshot_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MailBillingSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingChange" ADD CONSTRAINT "MailBillingChange_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingChange" ADD CONSTRAINT "MailBillingChange_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MailBillingSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

