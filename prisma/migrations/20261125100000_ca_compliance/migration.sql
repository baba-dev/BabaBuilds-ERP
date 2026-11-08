-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN "caEntityType" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "caTaxRegime" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "caPresumptive" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "caTaxAuditApplicable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "BusinessProfile" ADD COLUMN "caTan" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "caSetupAt" DATETIME;

-- CreateTable
CREATE TABLE "CaComplianceItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "ownerUserId" TEXT,
    "filedAt" DATETIME,
    "reference" TEXT,
    "notes" TEXT,
    "dueOverride" DATETIME,
    "signedOffByUserId" TEXT,
    "signedOffByName" TEXT,
    "signedOffAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaComplianceItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "itemKind" TEXT,
    "periodKey" TEXT,
    "linkType" TEXT,
    "linkId" TEXT,
    "dueDate" DATETIME,
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "closedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CaRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CaRequestMessage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requestId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT,
    "body" TEXT NOT NULL,
    "documentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CaRequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CaRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CaComplianceItem_workspaceId_fy_idx" ON "CaComplianceItem"("workspaceId", "fy");
CREATE UNIQUE INDEX "CaComplianceItem_workspaceId_kind_periodKey_key" ON "CaComplianceItem"("workspaceId", "kind", "periodKey");
CREATE INDEX "CaRequest_workspaceId_fy_status_idx" ON "CaRequest"("workspaceId", "fy", "status");
CREATE INDEX "CaRequestMessage_requestId_createdAt_idx" ON "CaRequestMessage"("requestId", "createdAt");
