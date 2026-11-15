-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'OTHER',
    "reference" TEXT,
    "notes" TEXT,
    "bankTransactionId" TEXT,
    "idempotencyKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" DATETIME,
    "reversedByUserId" TEXT,
    "reversalReason" TEXT,
    CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" TEXT,
    "actorUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,
    CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "Proposal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("amountReceived", "billingMonth", "clientId", "clientName", "collectionRiskScore", "createdAt", "dateReceived", "dueDate", "expectedPaymentDate", "financialYear", "followUpStatus", "grandTotal", "id", "invoiceDate", "invoiceNumber", "lastReminderSentAt", "paymentTermsDays", "pdfPath", "providerGateway", "providerPaymentLinkId", "sacCode", "serviceDescription", "sourceProposalId", "status", "subtotal", "taxAmount", "taxMode", "taxRate", "totalAmount", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId") SELECT "amountReceived", "billingMonth", "clientId", "clientName", "collectionRiskScore", "createdAt", "dateReceived", "dueDate", "expectedPaymentDate", "financialYear", "followUpStatus", "grandTotal", "id", "invoiceDate", "invoiceNumber", "lastReminderSentAt", "paymentTermsDays", "pdfPath", "providerGateway", "providerPaymentLinkId", "sacCode", "serviceDescription", "sourceProposalId", "status", "subtotal", "taxAmount", "taxMode", "taxRate", "totalAmount", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId" FROM "Invoice";
DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";
CREATE INDEX "Invoice_financialYear_idx" ON "Invoice"("financialYear");
CREATE INDEX "Invoice_workspaceId_idx" ON "Invoice"("workspaceId");
CREATE INDEX "Invoice_workspaceId_status_dueDate_idx" ON "Invoice"("workspaceId", "status", "dueDate");
CREATE INDEX "Invoice_workspaceId_financialYear_status_idx" ON "Invoice"("workspaceId", "financialYear", "status");
CREATE INDEX "Invoice_workspaceId_clientId_idx" ON "Invoice"("workspaceId", "clientId");
CREATE INDEX "Invoice_workspaceId_invoiceDate_idx" ON "Invoice"("workspaceId", "invoiceDate");
CREATE UNIQUE INDEX "Invoice_invoiceNumber_workspaceId_key" ON "Invoice"("invoiceNumber", "workspaceId");
CREATE TABLE "new_WorkspaceTaxPreference" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'AUTO',
    "defaultCountryCode" TEXT,
    "provider" TEXT,
    "taxEstimateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxEstimateRatePercent" REAL NOT NULL DEFAULT 50,
    "updatedBy" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceTaxPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_WorkspaceTaxPreference" ("createdAt", "defaultCountryCode", "id", "mode", "provider", "updatedAt", "updatedBy", "workspaceId") SELECT "createdAt", "defaultCountryCode", "id", "mode", "provider", "updatedAt", "updatedBy", "workspaceId" FROM "WorkspaceTaxPreference";
DROP TABLE "WorkspaceTaxPreference";
ALTER TABLE "new_WorkspaceTaxPreference" RENAME TO "WorkspaceTaxPreference";
CREATE UNIQUE INDEX "WorkspaceTaxPreference_workspaceId_key" ON "WorkspaceTaxPreference"("workspaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePayment_workspaceId_receivedAt_idx" ON "InvoicePayment"("workspaceId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_workspaceId_idempotencyKey_key" ON "InvoicePayment"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_workspaceId_creditNoteNumber_key" ON "CreditNote"("workspaceId", "creditNoteNumber");


-- Data backfill (see prisma/backfills/invoice-rework.sql)
-- Idempotent data backfill for the invoice rework (multi-currency, payments table, stock marker).
-- Applied (a) at the end of the 20261108100000_invoice_rework migration for migrated databases and
-- (b) by `npm run backfill:invoices` for databases created with `prisma db push` (production deploy).
-- Safe to run repeatedly.

-- Legacy rows created before grandTotal existed carry the default 0; totalAmount is the real total.
UPDATE "Invoice" SET "grandTotal" = "totalAmount" WHERE "grandTotal" = 0 AND "totalAmount" > 0;

-- Existing invoices are in the workspace base currency at rate 1.
UPDATE "Invoice" SET "currency" = COALESCE((SELECT "baseCurrency" FROM "Workspace" WHERE "Workspace"."id" = "Invoice"."workspaceId"), 'INR') WHERE "exchangeRate" = 1 AND "baseGrandTotal" IS NULL;
UPDATE "Invoice" SET "baseGrandTotal" = "grandTotal" WHERE "baseGrandTotal" IS NULL;

UPDATE "Invoice" SET "source" = 'PROPOSAL' WHERE "sourceProposalId" IS NOT NULL AND "source" = 'MANUAL';

-- Stock for product lines was deducted when an invoice became PAID: mark those as committed.
UPDATE "Invoice" SET "stockCommittedAt" = COALESCE("dateReceived", "createdAt") WHERE "status" = 'PAID' AND "stockCommittedAt" IS NULL;

-- One synthetic payment row per invoice that already has money received.
INSERT INTO "InvoicePayment" ("id", "workspaceId", "invoiceId", "amount", "receivedAt", "method", "notes", "createdAt")
SELECT 'legacy_' || "id", "workspaceId", "id", "amountReceived", COALESCE("dateReceived", "createdAt"), 'OTHER', 'Imported from invoice record', CURRENT_TIMESTAMP
FROM "Invoice"
WHERE "amountReceived" IS NOT NULL AND "amountReceived" > 0
  AND NOT EXISTS (SELECT 1 FROM "InvoicePayment" p WHERE p."invoiceId" = "Invoice"."id");

-- Invoices created through the main generator showed a due date on the PDF (invoice date + 7 days) but never
-- stored it, so they could never become overdue. Store the date that was printed.
UPDATE "Invoice" SET "dueDate" = "invoiceDate" + 604800000 WHERE "dueDate" IS NULL AND "status" IN ('PENDING', 'PARTIALLY_PAID');
