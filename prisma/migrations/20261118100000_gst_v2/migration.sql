-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "ewayBillNo" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "gstEcoGstin" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "gstSupplyOverride" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "irn" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "irnAckDate" DATETIME;
ALTER TABLE "Invoice" ADD COLUMN "irnAckNo" TEXT;

-- CreateTable
CREATE TABLE "GstDebitNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "issuedAt" DATETIME NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" DATETIME,
    "recipientName" TEXT NOT NULL,
    "recipientGstin" TEXT,
    "pos" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "taxable" DECIMAL NOT NULL DEFAULT 0,
    "igst" DECIMAL NOT NULL DEFAULT 0,
    "cgst" DECIMAL NOT NULL DEFAULT 0,
    "sgst" DECIMAL NOT NULL DEFAULT 0,
    "cess" DECIMAL NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GstDebitNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GstAmendment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "originalPeriodKey" TEXT NOT NULL,
    "originalNumber" TEXT NOT NULL,
    "originalDate" DATETIME NOT NULL,
    "recipientName" TEXT,
    "recipientGstin" TEXT,
    "pos" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "originalTaxable" DECIMAL NOT NULL DEFAULT 0,
    "originalIgst" DECIMAL NOT NULL DEFAULT 0,
    "originalCgst" DECIMAL NOT NULL DEFAULT 0,
    "originalSgst" DECIMAL NOT NULL DEFAULT 0,
    "revisedTaxable" DECIMAL NOT NULL DEFAULT 0,
    "revisedIgst" DECIMAL NOT NULL DEFAULT 0,
    "revisedCgst" DECIMAL NOT NULL DEFAULT 0,
    "revisedSgst" DECIMAL NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GstAmendment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GstAdvance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "receivedAt" DATETIME NOT NULL,
    "party" TEXT NOT NULL,
    "recipientGstin" TEXT,
    "pos" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "amount" DECIMAL NOT NULL,
    "taxable" DECIMAL NOT NULL DEFAULT 0,
    "igst" DECIMAL NOT NULL DEFAULT 0,
    "cgst" DECIMAL NOT NULL DEFAULT 0,
    "sgst" DECIMAL NOT NULL DEFAULT 0,
    "adjustedAt" DATETIME,
    "adjustedInvoice" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GstAdvance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GstReturnComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "returnType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GstReturnComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "GstReminderLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GstReminderLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
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
    "gstRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
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
INSERT INTO "new_BusinessProfile" ("accountName", "accountNumber", "address", "bankName", "companyName", "defaultGateway", "defaultSacCode", "defaultTaxRate", "email", "groqApiKey", "gstFilingFrequency", "gstLutActive", "gstPrevFyTurnover", "gstRegisteredFrom", "gstRegistrationType", "gstStateCode", "gstin", "id", "ifscCode", "invoicePrefix", "invoiceTheme", "logoUrl", "panNumber", "phone", "primaryBankAccountId", "proprietorName", "razorpayKeyId", "razorpayKeySecret", "routingLabel", "shopAboutMd", "shopAccentColor", "shopAnnouncement", "shopEnabled", "shopFaqJson", "shopFooterNote", "shopShowAiAssist", "shopSlug", "shopSocialJson", "shopTagline", "signatureUrl", "smtpFromEmail", "smtpHost", "smtpPassword", "smtpPort", "smtpUser", "stripePublishableKey", "stripeSecretKey", "taxIdLabel", "taxLabel", "udyamNumber", "updatedAt", "website", "workspaceId") SELECT "accountName", "accountNumber", "address", "bankName", "companyName", "defaultGateway", "defaultSacCode", "defaultTaxRate", "email", "groqApiKey", "gstFilingFrequency", "gstLutActive", "gstPrevFyTurnover", "gstRegisteredFrom", "gstRegistrationType", "gstStateCode", "gstin", "id", "ifscCode", "invoicePrefix", "invoiceTheme", "logoUrl", "panNumber", "phone", "primaryBankAccountId", "proprietorName", "razorpayKeyId", "razorpayKeySecret", "routingLabel", "shopAboutMd", "shopAccentColor", "shopAnnouncement", "shopEnabled", "shopFaqJson", "shopFooterNote", "shopShowAiAssist", "shopSlug", "shopSocialJson", "shopTagline", "signatureUrl", "smtpFromEmail", "smtpHost", "smtpPassword", "smtpPort", "smtpUser", "stripePublishableKey", "stripeSecretKey", "taxIdLabel", "taxLabel", "udyamNumber", "updatedAt", "website", "workspaceId" FROM "BusinessProfile";
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
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "paidAt" DATETIME,
    "itcHeld" BOOLEAN NOT NULL DEFAULT false,
    "itcClaimMonth" TEXT,
    CONSTRAINT "Expense_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "category", "cessAmount", "cgstAmount", "createdAt", "date", "description", "gstRate", "hsnCode", "id", "igstAmount", "itcStatus", "receiptUrl", "sgstAmount", "vendor", "vendorGstin", "vendorInvoiceNo", "vendorStateCode", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId") SELECT "amount", "category", "cessAmount", "cgstAmount", "createdAt", "date", "description", "gstRate", "hsnCode", "id", "igstAmount", "itcStatus", "receiptUrl", "sgstAmount", "vendor", "vendorGstin", "vendorInvoiceNo", "vendorStateCode", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
CREATE INDEX "Expense_category_idx" ON "Expense"("category");
CREATE INDEX "Expense_workspaceId_idx" ON "Expense"("workspaceId");
CREATE INDEX "Expense_workspaceId_date_idx" ON "Expense"("workspaceId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "GstDebitNote_workspaceId_issuedAt_idx" ON "GstDebitNote"("workspaceId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GstDebitNote_workspaceId_noteNumber_key" ON "GstDebitNote"("workspaceId", "noteNumber");

-- CreateIndex
CREATE INDEX "GstAmendment_workspaceId_periodKey_idx" ON "GstAmendment"("workspaceId", "periodKey");

-- CreateIndex
CREATE INDEX "GstAdvance_workspaceId_receivedAt_idx" ON "GstAdvance"("workspaceId", "receivedAt");

-- CreateIndex
CREATE INDEX "GstReturnComment_workspaceId_returnType_periodKey_idx" ON "GstReturnComment"("workspaceId", "returnType", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "GstReminderLog_workspaceId_key_channel_key" ON "GstReminderLog"("workspaceId", "key", "channel");

