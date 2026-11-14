-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "gstin" TEXT,
    "stateCode" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "msmeClass" TEXT,
    "udyam" TEXT,
    "paymentTermsDays" INTEGER,
    "defaultCategory" TEXT,
    "tdsSection" TEXT,
    "tdsRatePercent" REAL,
    "notes" TEXT,
    "archivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "vendorId" TEXT,
    "vendor" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "nextRunDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "autoPost" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "dueInDays" INTEGER,
    "itcStatus" TEXT NOT NULL DEFAULT 'NONE',
    "gstRate" REAL,
    "lastRunAt" DATETIME,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecurringExpense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExpenseBudget" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "monthlyAmount" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ExpenseSettings" (
    "workspaceId" TEXT NOT NULL PRIMARY KEY,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvalThreshold" DECIMAL NOT NULL DEFAULT 0,
    "inboxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inboxToken" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
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
    "vendorUdyam" TEXT,
    "vendorMsme" TEXT,
    "vendorAgreedDays" INTEGER,
    "vendorId" TEXT,
    "dueDate" DATETIME,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "purchaseOrderId" TEXT,
    "recurringId" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "submittedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" DATETIME,
    "rejectionReason" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "markupPercent" REAL,
    "billedInvoiceId" TEXT,
    CONSTRAINT "Expense_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Expense_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Expense" ("amount", "category", "cessAmount", "cgstAmount", "createdAt", "date", "description", "gstRate", "hsnCode", "id", "igstAmount", "itcClaimMonth", "itcHeld", "itcStatus", "paidAt", "paymentStatus", "receiptUrl", "sgstAmount", "vendor", "vendorAgreedDays", "vendorGstin", "vendorInvoiceNo", "vendorMsme", "vendorStateCode", "vendorUdyam", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId") SELECT "amount", "category", "cessAmount", "cgstAmount", "createdAt", "date", "description", "gstRate", "hsnCode", "id", "igstAmount", "itcClaimMonth", "itcHeld", "itcStatus", "paidAt", "paymentStatus", "receiptUrl", "sgstAmount", "vendor", "vendorAgreedDays", "vendorGstin", "vendorInvoiceNo", "vendorMsme", "vendorStateCode", "vendorUdyam", "withholdingAmount", "withholdingDeductedAt", "withholdingDepositDueAt", "withholdingDepositedAt", "withholdingRatePercent", "withholdingReminderSentAt", "workspaceId" FROM "Expense";
DROP TABLE "Expense";
ALTER TABLE "new_Expense" RENAME TO "Expense";
CREATE INDEX "Expense_date_idx" ON "Expense"("date");
CREATE INDEX "Expense_category_idx" ON "Expense"("category");
CREATE INDEX "Expense_workspaceId_idx" ON "Expense"("workspaceId");
CREATE INDEX "Expense_workspaceId_date_idx" ON "Expense"("workspaceId", "date");
CREATE INDEX "Expense_workspaceId_approvalStatus_idx" ON "Expense"("workspaceId", "approvalStatus");
CREATE INDEX "Expense_workspaceId_paymentStatus_dueDate_idx" ON "Expense"("workspaceId", "paymentStatus", "dueDate");
CREATE INDEX "Expense_vendorId_idx" ON "Expense"("vendorId");
CREATE INDEX "Expense_clientId_billable_idx" ON "Expense"("clientId", "billable");
CREATE INDEX "Expense_purchaseOrderId_idx" ON "Expense"("purchaseOrderId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Vendor_workspaceId_archivedAt_idx" ON "Vendor"("workspaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_workspaceId_nameKey_key" ON "Vendor"("workspaceId", "nameKey");

-- CreateIndex
CREATE INDEX "RecurringExpense_workspaceId_status_nextRunDate_idx" ON "RecurringExpense"("workspaceId", "status", "nextRunDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseBudget_workspaceId_category_key" ON "ExpenseBudget"("workspaceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseSettings_inboxToken_key" ON "ExpenseSettings"("inboxToken");


-- Backfill: one vendor per distinct supplier name already used on an expense (same key as lib/expenses/vendors.ts vendorKey).
INSERT INTO "Vendor" ("id", "workspaceId", "name", "nameKey", "updatedAt")
SELECT lower(hex(randomblob(12))), "workspaceId", MIN("vendor"), "nameKey", CURRENT_TIMESTAMP
FROM (
  SELECT "workspaceId", "vendor",
         lower(replace(replace(replace(replace(replace(trim("vendor"), ' ', ''), '.', ''), ',', ''), '-', ''), '&', '')) AS "nameKey"
  FROM "Expense" WHERE trim("vendor") <> ''
)
WHERE "nameKey" <> ''
GROUP BY "workspaceId", "nameKey";

UPDATE "Expense" SET "vendorId" = (
  SELECT v."id" FROM "Vendor" v
  WHERE v."workspaceId" = "Expense"."workspaceId"
    AND v."nameKey" = lower(replace(replace(replace(replace(replace(trim("Expense"."vendor"), ' ', ''), '.', ''), ',', ''), '-', ''), '&', ''))
) WHERE trim("vendor") <> '';

UPDATE "Expense" SET "source" = 'PO' WHERE "description" LIKE 'Auto-generated expense for PO #%';
UPDATE "Expense" SET "source" = 'IMPORT' WHERE "vendor" = 'File Import' AND "category" = 'Imported';
