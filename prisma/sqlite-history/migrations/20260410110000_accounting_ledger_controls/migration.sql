-- CreateTable
CREATE TABLE "AccountingTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventOccurredAt" DATETIME NOT NULL,
    "postedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postingCurrency" TEXT NOT NULL,
    "exchangeRate" DECIMAL,
    "description" TEXT,
    "sourceTable" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRef" TEXT,
    "requestId" TEXT,
    "jobId" TEXT,
    "statementBatchId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AccountingTransaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "transactionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountCode" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL,
    "postedAt" DATETIME NOT NULL,
    "isPosted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AccountingTransaction" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountingEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingIntegrityRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "runType" TEXT NOT NULL DEFAULT 'NIGHTLY',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "summary" JSONB,
    CONSTRAINT "AccountingIntegrityRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AccountingViolationReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "invariantCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "details" JSONB NOT NULL,
    "detectedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountingViolationReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "AccountingViolationReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AccountingIntegrityRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AccountingTransaction_workspaceId_eventType_postedAt_idx" ON "AccountingTransaction"("workspaceId", "eventType", "postedAt");
CREATE INDEX "AccountingTransaction_workspaceId_sourceTable_sourceId_idx" ON "AccountingTransaction"("workspaceId", "sourceTable", "sourceId");
CREATE INDEX "AccountingTransaction_requestId_idx" ON "AccountingTransaction"("requestId");
CREATE INDEX "AccountingTransaction_jobId_idx" ON "AccountingTransaction"("jobId");
CREATE UNIQUE INDEX "AccountingTransaction_workspaceId_sourceTable_sourceId_eventType_key" ON "AccountingTransaction"("workspaceId", "sourceTable", "sourceId", "eventType");

CREATE INDEX "AccountingEntry_workspaceId_accountCode_postedAt_idx" ON "AccountingEntry"("workspaceId", "accountCode", "postedAt");
CREATE INDEX "AccountingEntry_workspaceId_transactionId_idx" ON "AccountingEntry"("workspaceId", "transactionId");
CREATE UNIQUE INDEX "AccountingEntry_transactionId_lineNumber_key" ON "AccountingEntry"("transactionId", "lineNumber");

CREATE INDEX "AccountingIntegrityRun_workspaceId_startedAt_idx" ON "AccountingIntegrityRun"("workspaceId", "startedAt" DESC);

CREATE INDEX "AccountingViolationReport_workspaceId_detectedAt_idx" ON "AccountingViolationReport"("workspaceId", "detectedAt" DESC);
CREATE INDEX "AccountingViolationReport_runId_invariantCode_idx" ON "AccountingViolationReport"("runId", "invariantCode");
