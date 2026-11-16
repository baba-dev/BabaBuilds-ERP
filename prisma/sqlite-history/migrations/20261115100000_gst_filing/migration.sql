-- AlterTable
ALTER TABLE "Client" ADD COLUMN "gstStateCode" TEXT;

-- CreateTable
CREATE TABLE "GstReturn" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "returnType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "extendedDueDate" DATETIME,
    "filedAt" DATETIME,
    "arn" TEXT,
    "filedByUserId" TEXT,
    "isNil" BOOLEAN NOT NULL DEFAULT false,
    "lateFeePaid" DECIMAL NOT NULL DEFAULT 0,
    "interestPaid" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "inputsJson" JSONB,
    "snapshotJson" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "GstReturn_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GstAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "igst" DECIMAL NOT NULL DEFAULT 0,
    "cgst" DECIMAL NOT NULL DEFAULT 0,
    "sgst" DECIMAL NOT NULL DEFAULT 0,
    "cess" DECIMAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GstAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Gstr2bEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "supplierGstin" TEXT NOT NULL,
    "supplierName" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" DATETIME,
    "taxableValue" DECIMAL NOT NULL DEFAULT 0,
    "igst" DECIMAL NOT NULL DEFAULT 0,
    "cgst" DECIMAL NOT NULL DEFAULT 0,
    "sgst" DECIMAL NOT NULL DEFAULT 0,
    "cess" DECIMAL NOT NULL DEFAULT 0,
    "itcAvailable" BOOLEAN NOT NULL DEFAULT true,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Gstr2bEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BusinessProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "proprietorName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "invoiceTheme" TEXT NOT NULL DEFAULT 'DESIGN_1',
    "invoicePrefix" TEXT DEFAULT 'INV',
    "taxLabel" TEXT NOT NULL DEFAULT 'GST',
    "taxIdLabel" TEXT NOT NULL DEFAULT 'GSTIN',
    "routingLabel" TEXT NOT NULL DEFAULT 'IFSC Code',
    "panNumber" TEXT NOT NULL,
    "udyamNumber" TEXT,
    "gstin" TEXT,
    "gstStateCode" TEXT,
    "gstRegistrationType" TEXT NOT NULL DEFAULT 'REGULAR',
    "gstFilingFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "gstPrevFyTurnover" DECIMAL,
    "gstRegisteredFrom" DATETIME,
    "gstLutActive" BOOLEAN NOT NULL DEFAULT true,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "primaryBankAccountId" TEXT,
    "logoUrl" TEXT,
    "signatureUrl" TEXT,
    "groqApiKey" TEXT,
    "defaultSacCode" TEXT DEFAULT '998313',
    "defaultTaxRate" REAL,
    "razorpayKeyId" TEXT,
    "razorpayKeySecret" TEXT,
    "stripePublishableKey" TEXT,
    "stripeSecretKey" TEXT,
    "defaultGateway" TEXT DEFAULT 'RAZORPAY',
    "shopSlug" TEXT,
    "shopTagline" TEXT,
    "shopEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shopAccentColor" TEXT DEFAULT '#6366f1',
    "shopAnnouncement" TEXT,
    "shopAboutMd" TEXT,
    "shopFooterNote" TEXT,
    "shopSocialJson" TEXT,
    "shopFaqJson" TEXT,
    "shopShowAiAssist" BOOLEAN NOT NULL DEFAULT true,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFromEmail" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BusinessProfile_primaryBankAccountId_fkey" FOREIGN KEY ("primaryBankAccountId") REFERENCES "BankAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_BusinessProfile" ("accountName", "accountNumber", "address", "bankName", "companyName", "defaultGateway", "defaultSacCode", "defaultTaxRate", "email", "groqApiKey", "gstin", "id", "ifscCode", "invoicePrefix", "invoiceTheme", "logoUrl", "panNumber", "phone", "primaryBankAccountId", "proprietorName", "razorpayKeyId", "razorpayKeySecret", "routingLabel", "shopAboutMd", "shopAccentColor", "shopAnnouncement", "shopEnabled", "shopFaqJson", "shopFooterNote", "shopShowAiAssist", "shopSlug", "shopSocialJson", "shopTagline", "signatureUrl", "smtpFromEmail", "smtpHost", "smtpPassword", "smtpPort", "smtpUser", "stripePublishableKey", "stripeSecretKey", "taxIdLabel", "taxLabel", "udyamNumber", "updatedAt", "website", "workspaceId") SELECT "accountName", "accountNumber", "address", "bankName", "companyName", "defaultGateway", "defaultSacCode", "defaultTaxRate", "email", "groqApiKey", "gstin", "id", "ifscCode", "invoicePrefix", "invoiceTheme", "logoUrl", "panNumber", "phone", "primaryBankAccountId", "proprietorName", "razorpayKeyId", "razorpayKeySecret", "routingLabel", "shopAboutMd", "shopAccentColor", "shopAnnouncement", "shopEnabled", "shopFaqJson", "shopFooterNote", "shopShowAiAssist", "shopSlug", "shopSocialJson", "shopTagline", "signatureUrl", "smtpFromEmail", "smtpHost", "smtpPassword", "smtpPort", "smtpUser", "stripePublishableKey", "stripeSecretKey", "taxIdLabel", "taxLabel", "udyamNumber", "updatedAt", "website", "workspaceId" FROM "BusinessProfile";
DROP TABLE "BusinessProfile";
ALTER TABLE "new_BusinessProfile" RENAME TO "BusinessProfile";
CREATE UNIQUE INDEX "BusinessProfile_workspaceId_key" ON "BusinessProfile"("workspaceId");
CREATE UNIQUE INDEX "BusinessProfile_shopSlug_key" ON "BusinessProfile"("shopSlug");
CREATE INDEX "BusinessProfile_primaryBankAccountId_idx" ON "BusinessProfile"("primaryBankAccountId");
CREATE TABLE "new_Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT,
    "receiptUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withholdingRatePercent" DECIMAL,
    "withholdingAmount" DECIMAL,
    "withholdingDeductedAt" DATETIME,
    "withholdingDepositedAt" DATETIME,
    "withholdingDepositDueAt" DATETIME,
    "withholdingReminderSentAt" DATETIME,
    "vendorGstin" TEXT,
    "vendorInvoiceNo" TEXT,
    "vendorStateCode" TEXT,
    "hsnCode" TEXT,
    "gstRate" REAL,
    "cgstAmount" DECIMAL NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL NOT NULL DEFAULT 0,
    "itcStatus" TEXT NOT NULL DEFAULT 'NONE',
    CONSTRAINT "Expense_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "category", "createdAt", "date", "description", "id", "receiptUrl", "vendor", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId") SELECT "amount", "category", "createdAt", "date", "description", "id", "receiptUrl", "vendor", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
CREATE INDEX "Expense_category_idx" ON "Expense"("category");
CREATE INDEX "Expense_workspaceId_idx" ON "Expense"("workspaceId");
CREATE INDEX "Expense_workspaceId_date_idx" ON "Expense"("workspaceId", "date");
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
    "gstPlaceOfSupply" TEXT,
    "gstReverseCharge" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "Proposal" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Invoice" ("amountReceived", "baseGrandTotal", "billingMonth", "clientId", "clientName", "collectionRiskScore", "createdAt", "currency", "dateReceived", "dueDate", "exchangeRate", "expectedPaymentDate", "financialYear", "followUpStatus", "grandTotal", "id", "invoiceDate", "invoiceNumber", "lastReminderSentAt", "paymentTermsDays", "pdfPath", "providerGateway", "providerPaymentLinkId", "reminderCount", "retainerId", "sacCode", "sentAt", "serviceDescription", "source", "sourceProposalId", "status", "stockCommittedAt", "subtotal", "taxAmount", "taxMode", "taxRate", "totalAmount", "voidReason", "voidedAt", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId") SELECT "amountReceived", "baseGrandTotal", "billingMonth", "clientId", "clientName", "collectionRiskScore", "createdAt", "currency", "dateReceived", "dueDate", "exchangeRate", "expectedPaymentDate", "financialYear", "followUpStatus", "grandTotal", "id", "invoiceDate", "invoiceNumber", "lastReminderSentAt", "paymentTermsDays", "pdfPath", "providerGateway", "providerPaymentLinkId", "reminderCount", "retainerId", "sacCode", "sentAt", "serviceDescription", "source", "sourceProposalId", "status", "stockCommittedAt", "subtotal", "taxAmount", "taxMode", "taxRate", "totalAmount", "voidReason", "voidedAt", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId" FROM "Invoice";
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
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GstReturn_workspaceId_status_idx" ON "GstReturn"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GstReturn_workspaceId_returnType_periodKey_key" ON "GstReturn"("workspaceId", "returnType", "periodKey");

-- CreateIndex
CREATE INDEX "GstAdjustment_workspaceId_periodKey_idx" ON "GstAdjustment"("workspaceId", "periodKey");

-- CreateIndex
CREATE INDEX "Gstr2bEntry_workspaceId_periodKey_idx" ON "Gstr2bEntry"("workspaceId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "Gstr2bEntry_workspaceId_periodKey_supplierGstin_invoiceNumber_key" ON "Gstr2bEntry"("workspaceId", "periodKey", "supplierGstin", "invoiceNumber");

