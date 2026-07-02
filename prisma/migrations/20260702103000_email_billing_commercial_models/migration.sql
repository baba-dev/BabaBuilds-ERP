CREATE TABLE "MailBillingPlan" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "billingMode" TEXT NOT NULL DEFAULT 'FIXED',
  "currency" TEXT NOT NULL DEFAULT 'INR',
  "basePrice" DECIMAL NOT NULL DEFAULT 0,
  "includedMailboxes" INTEGER NOT NULL DEFAULT 0,
  "extraMailboxPrice" DECIMAL NOT NULL DEFAULT 0,
  "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MailBillingPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "MailBillingSubscription" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "domainId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "planId" TEXT,
  "retainerId" TEXT,
  "billingStatus" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
  "billingModeSnapshot" TEXT NOT NULL DEFAULT 'FIXED',
  "currencySnapshot" TEXT NOT NULL DEFAULT 'INR',
  "basePriceSnapshot" DECIMAL NOT NULL DEFAULT 0,
  "includedMailboxesSnapshot" INTEGER NOT NULL DEFAULT 0,
  "extraMailboxPriceSnapshot" DECIMAL NOT NULL DEFAULT 0,
  "billableMailboxCount" INTEGER NOT NULL DEFAULT 0,
  "lastSyncedMailboxCount" INTEGER NOT NULL DEFAULT 0,
  "pendingMailboxCount" INTEGER,
  "autoUpdateQuantity" BOOLEAN NOT NULL DEFAULT false,
  "nextReviewAt" DATETIME,
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MailBillingSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingSubscription_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "MailBillingDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingSubscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MailBillingPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MailBillingSubscription_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "MailBillingReviewItem" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "domainId" TEXT,
  "subscriptionId" TEXT,
  "serverId" TEXT,
  "type" TEXT NOT NULL,
  "severity" TEXT NOT NULL DEFAULT 'INFO',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "title" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "suggestedAction" TEXT,
  "oldValueJson" JSONB,
  "newValueJson" JSONB,
  "metadataJson" JSONB,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" DATETIME,
  "resolvedByUserId" TEXT,
  CONSTRAINT "MailBillingReviewItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingReviewItem_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "MailBillingDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingReviewItem_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MailBillingSubscription" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MailBillingReviewItem_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MailBillingServer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "MailBillingSettings" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "defaultBillingMode" TEXT NOT NULL DEFAULT 'FIXED',
  "defaultCurrency" TEXT NOT NULL DEFAULT 'INR',
  "defaultPlanId" TEXT,
  "autoCreateReviewItems" BOOLEAN NOT NULL DEFAULT true,
  "autoUpdateRetainerQuantities" BOOLEAN NOT NULL DEFAULT false,
  "syncFrequencyPreference" TEXT NOT NULL DEFAULT 'MANUAL',
  "alertRecipientsJson" JSONB,
  "treatRemovedDomainsAsReviewRequired" BOOLEAN NOT NULL DEFAULT true,
  "ignoreAdminMailboxesFromBilling" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MailBillingSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingSettings_defaultPlanId_fkey" FOREIGN KEY ("defaultPlanId") REFERENCES "MailBillingPlan" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
ALTER TABLE "MailBillingSyncRun" ADD COLUMN "reviewItemsCreated" INTEGER NOT NULL DEFAULT 0;
INSERT INTO "MailBillingSubscription" ("id", "workspaceId", "domainId", "clientId", "retainerId", "billingStatus", "billingModeSnapshot", "currencySnapshot", "basePriceSnapshot", "billableMailboxCount", "lastSyncedMailboxCount", "notes", "createdAt", "updatedAt")
SELECT lower(hex(randomblob(12))), d."workspaceId", d."id", d."clientId", d."retainerId",
  CASE WHEN r."id" IS NOT NULL AND r."status" = 'ACTIVE' THEN 'ACTIVE' ELSE 'REVIEW_REQUIRED' END,
  CASE WHEN d."billingMode" = 'PER_MAILBOX' THEN 'PER_MAILBOX' WHEN d."billingMode" = 'MANUAL' THEN 'MANUAL' ELSE 'FIXED' END,
  COALESCE(r."currency", 'INR'), COALESCE(r."amount", 0), d."mailboxCount", d."mailboxCount", d."billingNotes", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "MailBillingDomain" d
LEFT JOIN "Retainer" r ON r."id" = d."retainerId"
WHERE d."clientId" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "MailBillingSubscription" s WHERE s."workspaceId" = d."workspaceId" AND s."domainId" = d."id");
CREATE UNIQUE INDEX "MailBillingPlan_workspaceId_name_key" ON "MailBillingPlan"("workspaceId", "name");
CREATE INDEX "MailBillingPlan_workspaceId_isActive_idx" ON "MailBillingPlan"("workspaceId", "isActive");
CREATE INDEX "MailBillingPlan_workspaceId_sortOrder_idx" ON "MailBillingPlan"("workspaceId", "sortOrder");
CREATE UNIQUE INDEX "MailBillingSubscription_workspaceId_domainId_key" ON "MailBillingSubscription"("workspaceId", "domainId");
CREATE INDEX "MailBillingSubscription_workspaceId_clientId_idx" ON "MailBillingSubscription"("workspaceId", "clientId");
CREATE INDEX "MailBillingSubscription_workspaceId_planId_idx" ON "MailBillingSubscription"("workspaceId", "planId");
CREATE INDEX "MailBillingSubscription_workspaceId_retainerId_idx" ON "MailBillingSubscription"("workspaceId", "retainerId");
CREATE INDEX "MailBillingSubscription_workspaceId_billingStatus_idx" ON "MailBillingSubscription"("workspaceId", "billingStatus");
CREATE INDEX "MailBillingReviewItem_workspaceId_status_severity_idx" ON "MailBillingReviewItem"("workspaceId", "status", "severity");
CREATE INDEX "MailBillingReviewItem_workspaceId_domainId_status_idx" ON "MailBillingReviewItem"("workspaceId", "domainId", "status");
CREATE INDEX "MailBillingReviewItem_workspaceId_subscriptionId_idx" ON "MailBillingReviewItem"("workspaceId", "subscriptionId");
CREATE INDEX "MailBillingReviewItem_workspaceId_serverId_idx" ON "MailBillingReviewItem"("workspaceId", "serverId");
CREATE INDEX "MailBillingReviewItem_workspaceId_type_status_idx" ON "MailBillingReviewItem"("workspaceId", "type", "status");
CREATE UNIQUE INDEX "MailBillingSettings_workspaceId_key" ON "MailBillingSettings"("workspaceId");
CREATE INDEX "MailBillingSettings_workspaceId_defaultPlanId_idx" ON "MailBillingSettings"("workspaceId", "defaultPlanId");
