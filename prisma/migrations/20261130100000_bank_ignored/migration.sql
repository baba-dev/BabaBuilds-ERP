-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN "ignoredAt" DATETIME;

-- CreateIndex
CREATE INDEX "BankTransaction_workspaceId_isReconciled_ignoredAt_idx" ON "BankTransaction"("workspaceId", "isReconciled", "ignoredAt");

