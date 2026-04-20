-- Primary remittance bridge between BusinessProfile and BankAccount
ALTER TABLE "BusinessProfile" ADD COLUMN "primaryBankAccountId" TEXT;

ALTER TABLE "BankAccount" ADD COLUMN "accountHolderName" TEXT;
ALTER TABLE "BankAccount" ADD COLUMN "routingCode" TEXT;
ALTER TABLE "BankAccount" ADD COLUMN "sourceType" TEXT DEFAULT 'MANUAL';
ALTER TABLE "BankAccount" ADD COLUMN "isPrimaryRemittance" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "BusinessProfile_primaryBankAccountId_idx" ON "BusinessProfile"("primaryBankAccountId");
CREATE INDEX "BankAccount_workspaceId_isPrimaryRemittance_idx" ON "BankAccount"("workspaceId", "isPrimaryRemittance");
