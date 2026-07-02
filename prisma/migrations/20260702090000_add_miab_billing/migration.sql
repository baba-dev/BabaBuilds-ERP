CREATE TABLE "MailBillingServer" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "provider" TEXT NOT NULL DEFAULT 'MIAB',
  "accessMode" TEXT NOT NULL DEFAULT 'READ_ONLY_ADAPTER',
  "baseUrl" TEXT NOT NULL,
  "encryptedToken" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastSyncAt" DATETIME,
  "lastSyncStatus" TEXT,
  "lastSyncError" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MailBillingServer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "MailBillingDomain" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "domain" TEXT NOT NULL,
  "clientId" TEXT,
  "retainerId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "mailboxCount" INTEGER NOT NULL DEFAULT 0,
  "aliasCount" INTEGER NOT NULL DEFAULT 0,
  "billingMode" TEXT NOT NULL DEFAULT 'DOMAIN_PLAN',
  "billingNotes" TEXT,
  "discoveredAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MailBillingDomain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingDomain_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MailBillingServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingDomain_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "MailBillingDomain_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE "MailBillingMailbox" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "domainId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "localPart" TEXT NOT NULL,
  "quotaMb" INTEGER,
  "isAdmin" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "lastSeenAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "archivedAt" DATETIME,
  "rawJson" JSONB,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "MailBillingMailbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingMailbox_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MailBillingServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingMailbox_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "MailBillingDomain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE "MailBillingSyncRun" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "serverId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" DATETIME,
  "domainsSeen" INTEGER NOT NULL DEFAULT 0,
  "mailboxesSeen" INTEGER NOT NULL DEFAULT 0,
  "domainsAdded" INTEGER NOT NULL DEFAULT 0,
  "domainsRemoved" INTEGER NOT NULL DEFAULT 0,
  "mailboxesAdded" INTEGER NOT NULL DEFAULT 0,
  "mailboxesRemoved" INTEGER NOT NULL DEFAULT 0,
  "errorMessage" TEXT,
  "summaryJson" JSONB,
  CONSTRAINT "MailBillingSyncRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MailBillingSyncRun_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MailBillingServer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MailBillingServer_workspaceId_name_key" ON "MailBillingServer"("workspaceId", "name");
CREATE INDEX "MailBillingServer_workspaceId_status_idx" ON "MailBillingServer"("workspaceId", "status");
CREATE UNIQUE INDEX "MailBillingDomain_workspaceId_serverId_domain_key" ON "MailBillingDomain"("workspaceId", "serverId", "domain");
CREATE INDEX "MailBillingDomain_workspaceId_clientId_idx" ON "MailBillingDomain"("workspaceId", "clientId");
CREATE INDEX "MailBillingDomain_workspaceId_retainerId_idx" ON "MailBillingDomain"("workspaceId", "retainerId");
CREATE INDEX "MailBillingDomain_workspaceId_status_idx" ON "MailBillingDomain"("workspaceId", "status");
CREATE UNIQUE INDEX "MailBillingMailbox_workspaceId_serverId_email_key" ON "MailBillingMailbox"("workspaceId", "serverId", "email");
CREATE INDEX "MailBillingMailbox_workspaceId_domainId_idx" ON "MailBillingMailbox"("workspaceId", "domainId");
CREATE INDEX "MailBillingMailbox_workspaceId_status_idx" ON "MailBillingMailbox"("workspaceId", "status");
CREATE INDEX "MailBillingSyncRun_workspaceId_startedAt_idx" ON "MailBillingSyncRun"("workspaceId", "startedAt");
CREATE INDEX "MailBillingSyncRun_workspaceId_serverId_startedAt_idx" ON "MailBillingSyncRun"("workspaceId", "serverId", "startedAt");
