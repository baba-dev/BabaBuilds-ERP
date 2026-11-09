-- CRM fields on Client
ALTER TABLE "Client" ADD COLUMN "countryCode" TEXT;
ALTER TABLE "Client" ADD COLUMN "website" TEXT;
ALTER TABLE "Client" ADD COLUMN "industry" TEXT;
ALTER TABLE "Client" ADD COLUMN "currency" TEXT;
ALTER TABLE "Client" ADD COLUMN "paymentTermsDays" INTEGER;
ALTER TABLE "Client" ADD COLUMN "creditLimit" DECIMAL;
ALTER TABLE "Client" ADD COLUMN "tags" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Client" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Client" ADD COLUMN "isWalkIn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Client" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Client" ADD COLUMN "ownerUserId" TEXT;
ALTER TABLE "Client" ADD COLUMN "lastContactedAt" DATETIME;
ALTER TABLE "Client" ADD COLUMN "updatedAt" DATETIME;

-- Existing POS counter customers become walk-ins
UPDATE "Client" SET "isWalkIn" = true, "source" = 'POS' WHERE "name" = 'Walk-in Customer';

-- Country codes for the common spellings already in the data
UPDATE "Client" SET "countryCode" = 'IN' WHERE upper(trim("country")) IN ('IN', 'INDIA');

-- CreateIndex
CREATE INDEX "Client_workspaceId_archivedAt_idx" ON "Client"("workspaceId", "archivedAt");

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "receivesInvoices" BOOLEAN NOT NULL DEFAULT true,
    "receivesReminders" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME,
    CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ClientContact_workspaceId_clientId_idx" ON "ClientContact"("workspaceId", "clientId");

-- CreateIndex
CREATE INDEX "ClientNote_workspaceId_clientId_createdAt_idx" ON "ClientNote"("workspaceId", "clientId", "createdAt" DESC);
