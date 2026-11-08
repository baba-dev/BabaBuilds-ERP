-- CreateTable
CREATE TABLE "ProposalEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" TEXT,
    "actorUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProposalEvent_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Proposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "proposalNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dateCreated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME NOT NULL,
    "publicToken" TEXT NOT NULL,
    "acceptedAt" DATETIME,
    "clientIp" TEXT,
    "acceptedByName" TEXT,
    "sentAt" DATETIME,
    "sentByUserId" TEXT,
    "firstViewedAt" DATETIME,
    "lastViewedAt" DATETIME,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "declinedAt" DATETIME,
    "declineReason" TEXT,
    "firstConvertedAt" DATETIME,
    "expiredAt" DATETIME,
    "richSections" JSONB,
    "clientSignatureBase64" TEXT,
    "subtotal" DECIMAL NOT NULL,
    "estimatedTax" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchangeRate" DECIMAL NOT NULL DEFAULT 1,
    "taxRatePercent" REAL NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" DATETIME,
    "richMedia" JSONB,
    CONSTRAINT "Proposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Proposal" ("acceptedAt", "acceptedByName", "clientId", "clientIp", "clientSignatureBase64", "dateCreated", "declineReason", "declinedAt", "estimatedTax", "expiredAt", "firstConvertedAt", "firstViewedAt", "id", "lastViewedAt", "proposalNo", "publicToken", "richSections", "sentAt", "sentByUserId", "status", "subtotal", "title", "totalAmount", "validUntil", "viewCount", "workspaceId") SELECT "acceptedAt", "acceptedByName", "clientId", "clientIp", "clientSignatureBase64", "dateCreated", "declineReason", "declinedAt", "estimatedTax", "expiredAt", "firstConvertedAt", "firstViewedAt", "id", "lastViewedAt", "proposalNo", "publicToken", "richSections", "sentAt", "sentByUserId", "status", "subtotal", "title", "totalAmount", "validUntil", "viewCount", "workspaceId" FROM "Proposal";
DROP TABLE "Proposal";
ALTER TABLE "new_Proposal" RENAME TO "Proposal";
CREATE UNIQUE INDEX "Proposal_publicToken_key" ON "Proposal"("publicToken");
CREATE INDEX "Proposal_workspaceId_idx" ON "Proposal"("workspaceId");
CREATE INDEX "Proposal_publicToken_idx" ON "Proposal"("publicToken");
CREATE INDEX "Proposal_workspaceId_status_idx" ON "Proposal"("workspaceId", "status");
CREATE INDEX "Proposal_workspaceId_clientId_idx" ON "Proposal"("workspaceId", "clientId");
CREATE INDEX "Proposal_workspaceId_dateCreated_idx" ON "Proposal"("workspaceId", "dateCreated");
CREATE UNIQUE INDEX "Proposal_proposalNo_workspaceId_key" ON "Proposal"("proposalNo", "workspaceId");
CREATE TABLE "new_ProposalItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "serviceTemplateId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL NOT NULL,
    "total" DECIMAL NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "ProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProposalItem_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ProposalItem" ("description", "id", "isOptional", "isSelected", "proposalId", "quantity", "serviceTemplateId", "title", "total", "unitPrice") SELECT "description", "id", "isOptional", "isSelected", "proposalId", "quantity", "serviceTemplateId", "title", "total", "unitPrice" FROM "ProposalItem";
DROP TABLE "ProposalItem";
ALTER TABLE "new_ProposalItem" RENAME TO "ProposalItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ProposalEvent_proposalId_createdAt_idx" ON "ProposalEvent"("proposalId", "createdAt");


-- Data backfill (see prisma/backfills/proposal-rework.sql)
-- Idempotent data backfill for the proposals rework (draft-first lifecycle, frozen pricing context, richMedia column).
-- Applied (a) at the end of the 20261109100000_proposal_rework migration and (b) by `npm run backfill`
-- for `prisma db push` databases (production). Safe to run repeatedly.

-- Pricing context: proposals existed only in the workspace base currency.
UPDATE "Proposal" SET "currency" = COALESCE((SELECT "baseCurrency" FROM "Workspace" WHERE "Workspace"."id" = "Proposal"."workspaceId"), 'INR') WHERE "currency" = 'INR';

-- Recover the tax rate the proposal was priced with, from its stored amounts.
UPDATE "Proposal" SET "taxRatePercent" = ROUND(CAST("estimatedTax" AS REAL) * 100.0 / CAST("subtotal" AS REAL), 2) WHERE "taxRatePercent" = 0 AND CAST("subtotal" AS REAL) > 0 AND CAST("estimatedTax" AS REAL) > 0;

-- Before the draft-first flow every saved proposal was treated as sent at creation.
UPDATE "Proposal" SET "sentAt" = "dateCreated" WHERE "sentAt" IS NULL AND "status" IN ('SENT', 'VIEWED', 'ACCEPTED', 'INVOICED', 'DECLINED', 'REVISION_REQUESTED');

-- The media list was stored inside the free-text `declineReason` JSON; move it to its own column.
UPDATE "Proposal" SET "richMedia" = json_extract("declineReason", '$.richMedia') WHERE "richMedia" IS NULL AND "declineReason" IS NOT NULL AND CASE WHEN json_valid("declineReason") THEN json_type("declineReason", '$.richMedia') = 'array' ELSE 0 END;
UPDATE "Proposal" SET "declineReason" = CASE WHEN json_remove("declineReason", '$.richMedia') = '{}' THEN NULL ELSE json_remove("declineReason", '$.richMedia') END WHERE "declineReason" IS NOT NULL AND CASE WHEN json_valid("declineReason") THEN json_type("declineReason", '$.richMedia') = 'array' ELSE 0 END;
