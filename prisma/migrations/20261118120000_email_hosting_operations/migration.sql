-- AlterTable
ALTER TABLE "MailBillingServer" ADD COLUMN     "miabVersion" TEXT,
ADD COLUMN     "writesEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "MailBillingMailbox" ADD COLUMN     "deleteScheduledFor" TIMESTAMP(3),
ADD COLUMN     "provisionedByOperationId" TEXT,
ADD COLUMN     "suspendedAt" TIMESTAMP(3),
ADD COLUMN     "suspendedReason" TEXT;

-- CreateTable
CREATE TABLE "MailOperation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "domainId" TEXT,
    "mailboxId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL DEFAULT 'UI',
    "idempotencyKey" TEXT,
    "payloadJson" JSONB,
    "resultJson" JSONB,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 1,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "requestedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailOperation_workspaceId_status_runAfter_idx" ON "MailOperation"("workspaceId", "status", "runAfter");

-- CreateIndex
CREATE INDEX "MailOperation_workspaceId_serverId_createdAt_idx" ON "MailOperation"("workspaceId", "serverId", "createdAt");

-- CreateIndex
CREATE INDEX "MailOperation_mailboxId_idx" ON "MailOperation"("mailboxId");

-- CreateIndex
CREATE UNIQUE INDEX "MailOperation_workspaceId_idempotencyKey_key" ON "MailOperation"("workspaceId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "MailOperation" ADD CONSTRAINT "MailOperation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailOperation" ADD CONSTRAINT "MailOperation_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MailBillingServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailOperation" ADD CONSTRAINT "MailOperation_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "MailBillingDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailOperation" ADD CONSTRAINT "MailOperation_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "MailBillingMailbox"("id") ON DELETE SET NULL ON UPDATE CASCADE;

