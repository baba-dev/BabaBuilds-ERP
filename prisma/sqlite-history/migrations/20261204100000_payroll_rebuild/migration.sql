-- AlterTable
ALTER TABLE "PayrollRun" ADD COLUMN "approvedByUserId" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN "disbursedAt" DATETIME;
ALTER TABLE "PayrollRun" ADD COLUMN "disbursedByUserId" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN "disbursementTxId" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN "notes" TEXT;
ALTER TABLE "PayrollRun" ADD COLUMN "preflightJson" JSONB;
ALTER TABLE "PayrollRun" ADD COLUMN "submittedAt" DATETIME;
ALTER TABLE "PayrollRun" ADD COLUMN "summaryJson" JSONB;

-- CreateTable
CREATE TABLE "EmployeeCompensation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "annualCtc" DECIMAL NOT NULL DEFAULT 0,
    "componentsJson" JSONB NOT NULL,
    "taxRegime" TEXT NOT NULL DEFAULT 'new',
    "oldRegimeDeductions" DECIMAL NOT NULL DEFAULT 0,
    "pfEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pfOnActualBasic" BOOLEAN NOT NULL DEFAULT false,
    "esiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ptState" TEXT,
    "panEnc" TEXT,
    "panLast4" TEXT,
    "uan" TEXT,
    "esiNumber" TEXT,
    "accountHolder" TEXT,
    "bankName" TEXT,
    "ifsc" TEXT,
    "accountEnc" TEXT,
    "accountLast4" TEXT,
    "paymentMode" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeCompensation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmployeeCompensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EmployeeLoan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "principal" DECIMAL NOT NULL,
    "emi" DECIMAL NOT NULL,
    "outstanding" DECIMAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startPeriod" DATETIME NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EmployeeLoan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "EmployeeLoan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PayrollRemittance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "runId" TEXT,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "dueDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "paidAt" DATETIME,
    "paidByUserId" TEXT,
    "reference" TEXT,
    "accountingTxId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PayrollRemittance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollRemittance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollRemittance_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PayrollLineItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "employeeSnapshotId" TEXT NOT NULL,
    "earnings" DECIMAL NOT NULL DEFAULT 0,
    "deductions" DECIMAL NOT NULL DEFAULT 0,
    "employerCosts" DECIMAL NOT NULL DEFAULT 0,
    "netPay" DECIMAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "breakdownJson" JSONB,
    "calculationLog" JSONB,
    "statutoryJson" JSONB,
    "payoutStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" DATETIME,
    "payoutRef" TEXT,
    "payslipSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollLineItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PayrollLineItem_employeeSnapshotId_fkey" FOREIGN KEY ("employeeSnapshotId") REFERENCES "PayrollEmployeeSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PayrollLineItem" ("breakdownJson", "calculationLog", "createdAt", "currency", "deductions", "earnings", "employeeSnapshotId", "employerCosts", "id", "netPay", "runId") SELECT "breakdownJson", "calculationLog", "createdAt", "currency", "deductions", "earnings", "employeeSnapshotId", "employerCosts", "id", "netPay", "runId" FROM "PayrollLineItem";
DROP TABLE "PayrollLineItem";
ALTER TABLE "new_PayrollLineItem" RENAME TO "PayrollLineItem";
CREATE INDEX "PayrollLineItem_runId_netPay_idx" ON "PayrollLineItem"("runId", "netPay");
CREATE UNIQUE INDEX "PayrollLineItem_runId_employeeSnapshotId_key" ON "PayrollLineItem"("runId", "employeeSnapshotId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "EmployeeCompensation_workspaceId_employeeId_effectiveFrom_idx" ON "EmployeeCompensation"("workspaceId", "employeeId", "effectiveFrom" DESC);

-- CreateIndex
CREATE INDEX "PayrollAdjustment_workspaceId_periodId_idx" ON "PayrollAdjustment"("workspaceId", "periodId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_periodId_employeeId_idx" ON "PayrollAdjustment"("periodId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeLoan_workspaceId_employeeId_status_idx" ON "EmployeeLoan"("workspaceId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "PayrollRemittance_workspaceId_status_dueDate_idx" ON "PayrollRemittance"("workspaceId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRemittance_workspaceId_periodId_kind_key" ON "PayrollRemittance"("workspaceId", "periodId", "kind");

