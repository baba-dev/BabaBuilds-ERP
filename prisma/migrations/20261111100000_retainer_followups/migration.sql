-- AlterTable
ALTER TABLE "MeteredUsage" ADD COLUMN "taxRate" REAL;

-- CreateTable
CREATE TABLE "RetainerPriceChange" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "retainerId" TEXT NOT NULL,
    "effectiveDate" DATETIME NOT NULL,
    "percent" REAL NOT NULL,
    "note" TEXT,
    "appliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RetainerPriceChange_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "billingMonth" TEXT NOT NULL DEFAULT 'Unknown',
    "invoiceDate" DATETIME NOT NULL,
    "dueDate" DATETIME,
    "paymentTermsDays" INTEGER,
    "expectedPaymentDate" DATETIME,
    "collectionRiskScore" REAL,
    "lastReminderSentAt" DATETIME,
    "followUpStatus" TEXT,
    "clientName" TEXT NOT NULL,
    "sacCode" TEXT,
    "serviceDescription" TEXT NOT NULL,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL NOT NULL DEFAULT 0,
    "taxMode" TEXT NOT NULL DEFAULT 'exempt',
    "totalAmount" DECIMAL NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amountReceived" DECIMAL,
    "dateReceived" DATETIME,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "baseGrandTotal" DECIMAL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "sentAt" DATETIME,
    "voidedAt" DATETIME,
    "voidReason" TEXT,
    "stockCommittedAt" DATETIME,
    "withholdingRatePercent" DECIMAL,
    "withholdingAmount" DECIMAL,
    "withholdingDeductedAt" DATETIME,
    "withholdingDepositedAt" DATETIME,
    "withholdingDepositDueAt" DATETIME,
    "withholdingReminderSentAt" DATETIME,
    "providerGateway" TEXT,
    "providerPaymentLinkId" TEXT,
    "clientId" TEXT,
    "sourceProposalId" TEXT,
    "retainerId" TEXT,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "Proposal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("amountReceived", "baseGrandTotal", "billingMonth", "clientId", "clientName", "collectionRiskScore", "createdAt", "currency", "dateReceived", "dueDate", "exchangeRate", "expectedPaymentDate", "financialYear", "followUpStatus", "grandTotal", "id", "invoiceDate", "invoiceNumber", "lastReminderSentAt", "paymentTermsDays", "pdfPath", "providerGateway", "providerPaymentLinkId", "retainerId", "sacCode", "sentAt", "serviceDescription", "source", "sourceProposalId", "status", "stockCommittedAt", "subtotal", "taxAmount", "taxMode", "taxRate", "totalAmount", "voidReason", "voidedAt", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId") SELECT "amountReceived", "baseGrandTotal", "billingMonth", "clientId", "clientName", "collectionRiskScore", "createdAt", "currency", "dateReceived", "dueDate", "exchangeRate", "expectedPaymentDate", "financialYear", "followUpStatus", "grandTotal", "id", "invoiceDate", "invoiceNumber", "lastReminderSentAt", "paymentTermsDays", "pdfPath", "providerGateway", "providerPaymentLinkId", "retainerId", "sacCode", "sentAt", "serviceDescription", "source", "sourceProposalId", "status", "stockCommittedAt", "subtotal", "taxAmount", "taxMode", "taxRate", "totalAmount", "voidReason", "voidedAt", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE INDEX "Invoice_financialYear_idx" ON "Invoice"("financialYear");
CREATE INDEX "Invoice_workspaceId_idx" ON "Invoice"("workspaceId");
CREATE INDEX "Invoice_workspaceId_status_dueDate_idx" ON "Invoice"("workspaceId", "status", "dueDate");
CREATE INDEX "Invoice_workspaceId_financialYear_status_idx" ON "Invoice"("workspaceId", "financialYear", "status");
CREATE INDEX "Invoice_workspaceId_clientId_idx" ON "Invoice"("workspaceId", "clientId");
CREATE INDEX "Invoice_workspaceId_invoiceDate_idx" ON "Invoice"("workspaceId", "invoiceDate");
CREATE INDEX "Invoice_workspaceId_retainerId_idx" ON "Invoice"("workspaceId", "retainerId");
CREATE UNIQUE INDEX "Invoice_invoiceNumber_workspaceId_key" ON "Invoice"("invoiceNumber", "workspaceId");
CREATE TABLE "new_Retainer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nextBillingDate" DATETIME NOT NULL,
    "autoAppendMonth" BOOLEAN NOT NULL DEFAULT true,
    "sourceProposalId" TEXT,
    "amount" DECIMAL,
    "sacCode" TEXT,
    "serviceName" TEXT,
    "name" TEXT,
    "notes" TEXT,
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 7,
    "emailInvoice" BOOLEAN NOT NULL DEFAULT true,
    "endDate" DATETIME,
    "maxCycles" INTEGER,
    "cyclesBilled" INTEGER NOT NULL DEFAULT 0,
    "lastBilledAt" DATETIME,
    "lastError" TEXT,
    "lastErrorAt" DATETIME,
    "cancelledAt" DATETIME,
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "renewCycles" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Retainer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Retainer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Retainer_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "Proposal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Retainer" ("amount", "autoAppendMonth", "cancelledAt", "clientId", "createdAt", "currency", "cyclesBilled", "emailInvoice", "endDate", "exchangeRate", "frequency", "id", "lastBilledAt", "lastError", "lastErrorAt", "maxCycles", "name", "nextBillingDate", "notes", "paymentTermsDays", "sacCode", "serviceName", "sourceProposalId", "status", "updatedAt", "workspaceId") SELECT "amount", "autoAppendMonth", "cancelledAt", "clientId", "createdAt", "currency", "cyclesBilled", "emailInvoice", "endDate", "exchangeRate", "frequency", "id", "lastBilledAt", "lastError", "lastErrorAt", "maxCycles", "name", "nextBillingDate", "notes", "paymentTermsDays", "sacCode", "serviceName", "sourceProposalId", "status", "updatedAt", "workspaceId" FROM "Retainer";
DROP TABLE "Retainer";
ALTER TABLE "new_Retainer" RENAME TO "Retainer";
CREATE INDEX "Retainer_workspaceId_status_idx" ON "Retainer"("workspaceId", "status");
CREATE INDEX "Retainer_workspaceId_nextBillingDate_idx" ON "Retainer"("workspaceId", "nextBillingDate");
CREATE INDEX "Retainer_workspaceId_clientId_idx" ON "Retainer"("workspaceId", "clientId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "RetainerPriceChange_retainerId_effectiveDate_idx" ON "RetainerPriceChange"("retainerId", "effectiveDate");

