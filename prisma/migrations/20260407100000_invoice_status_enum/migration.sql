-- Prisma enum compatibility for SQLite: normalize historical status values
-- and enforce canonical contract values: PENDING | PARTIALLY_PAID | PAID.

UPDATE "Invoice"
SET "status" = CASE
  WHEN "status" IS NULL THEN 'PENDING'
  WHEN LOWER(TRIM("status")) IN ('paid') THEN 'PAID'
  WHEN LOWER(TRIM("status")) IN ('partially paid', 'partially_paid', 'partial paid') THEN 'PARTIALLY_PAID'
  WHEN LOWER(TRIM("status")) IN ('pending') THEN 'PENDING'
  ELSE 'PENDING'
END;

CREATE TABLE "new_Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "billingMonth" TEXT NOT NULL DEFAULT 'Unknown',
    "invoiceDate" DATETIME NOT NULL,
    "clientName" TEXT NOT NULL,
    "sacCode" TEXT,
    "serviceDescription" TEXT NOT NULL,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "taxAmount" REAL NOT NULL DEFAULT 0,
    "grandTotal" REAL NOT NULL DEFAULT 0,
    "taxMode" TEXT NOT NULL DEFAULT 'exempt',
    "totalAmount" REAL NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amountReceived" REAL,
    "dateReceived" DATETIME,
    "clientId" TEXT,
    CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Invoice_status_check" CHECK ("status" IN ('PENDING', 'PARTIALLY_PAID', 'PAID'))
);

INSERT INTO "new_Invoice" (
  "id", "workspaceId", "invoiceNumber", "financialYear", "billingMonth", "invoiceDate", "clientName",
  "sacCode", "serviceDescription", "subtotal", "taxRate", "taxAmount", "grandTotal", "taxMode",
  "totalAmount", "pdfPath", "createdAt", "status", "amountReceived", "dateReceived", "clientId"
)
SELECT
  "id", "workspaceId", "invoiceNumber", "financialYear", "billingMonth", "invoiceDate", "clientName",
  "sacCode", "serviceDescription", "subtotal", "taxRate", "taxAmount", "grandTotal", "taxMode",
  "totalAmount", "pdfPath", "createdAt", "status", "amountReceived", "dateReceived", "clientId"
FROM "Invoice";

DROP TABLE "Invoice";
ALTER TABLE "new_Invoice" RENAME TO "Invoice";

CREATE UNIQUE INDEX "Invoice_invoiceNumber_workspaceId_key" ON "Invoice"("invoiceNumber", "workspaceId");
CREATE INDEX "Invoice_financialYear_idx" ON "Invoice"("financialYear");
CREATE INDEX "Invoice_workspaceId_idx" ON "Invoice"("workspaceId");
