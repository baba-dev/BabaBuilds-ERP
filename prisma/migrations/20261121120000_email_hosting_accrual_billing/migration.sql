-- AlterTable
ALTER TABLE "MailBillingMailbox" ADD COLUMN     "billedThrough" TIMESTAMP(3),
ADD COLUMN     "billingStartsOn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "MailBillingPlan" ADD COLUMN     "includedQuotaMb" INTEGER,
ADD COLUMN     "outboundPerDay" INTEGER;

-- AlterTable
ALTER TABLE "MailBillingSettings" ADD COLUMN     "billingModel" TEXT NOT NULL DEFAULT 'RECURRING';

-- Backfill: existing addresses are charged from when the ERP first saw them.
UPDATE "MailBillingMailbox" SET "billingStartsOn" = "createdAt";

-- CreateTable
CREATE TABLE "MailCollection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "asOf" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "total" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INVOICING',
    "linesJson" JSONB NOT NULL,
    "idempotencyKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "MailCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailCollection_workspaceId_clientId_createdAt_idx" ON "MailCollection"("workspaceId", "clientId", "createdAt");

-- CreateIndex
CREATE INDEX "MailCollection_workspaceId_status_idx" ON "MailCollection"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MailCollection_workspaceId_idempotencyKey_key" ON "MailCollection"("workspaceId", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "MailCollection" ADD CONSTRAINT "MailCollection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailCollection" ADD CONSTRAINT "MailCollection_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailCollection" ADD CONSTRAINT "MailCollection_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

