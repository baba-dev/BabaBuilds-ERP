-- CreateTable
CREATE TABLE "TaxDocumentLink" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'EVIDENCE',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxDocumentLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxDocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxImportBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "sourceName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "submittedByUserId" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TaxImportRow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "code" TEXT,
    "message" TEXT,
    "fieldName" TEXT,
    "rawData" JSONB,
    "normalizedData" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxImportRow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TaxImportBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TaxDocumentLink_workspaceId_documentId_entityType_entityKey_key" ON "TaxDocumentLink"("workspaceId", "documentId", "entityType", "entityKey");
CREATE INDEX "TaxDocumentLink_workspaceId_entityType_entityKey_createdAt_idx" ON "TaxDocumentLink"("workspaceId", "entityType", "entityKey", "createdAt" DESC);
CREATE INDEX "TaxDocumentLink_workspaceId_documentId_createdAt_idx" ON "TaxDocumentLink"("workspaceId", "documentId", "createdAt" DESC);

CREATE INDEX "TaxImportBatch_workspaceId_templateType_createdAt_idx" ON "TaxImportBatch"("workspaceId", "templateType", "createdAt" DESC);
CREATE INDEX "TaxImportBatch_workspaceId_status_createdAt_idx" ON "TaxImportBatch"("workspaceId", "status", "createdAt" DESC);

CREATE INDEX "TaxImportRow_workspaceId_batchId_rowNumber_idx" ON "TaxImportRow"("workspaceId", "batchId", "rowNumber");
CREATE INDEX "TaxImportRow_workspaceId_status_createdAt_idx" ON "TaxImportRow"("workspaceId", "status", "createdAt" DESC);
