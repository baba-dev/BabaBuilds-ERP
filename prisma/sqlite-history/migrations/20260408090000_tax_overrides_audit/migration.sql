CREATE TABLE "TaxRateOverride" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'WORKSPACE',
    "scopeRef" TEXT,
    "rate" REAL NOT NULL,
    "effectiveFrom" DATETIME NOT NULL,
    "effectiveTo" DATETIME,
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" DATETIME,
    "createdByUserId" TEXT,
    "createdByEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TaxRateOverride_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TaxDecisionAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "taxRateOverrideId" TEXT,
    "action" TEXT NOT NULL,
    "decisionSource" TEXT NOT NULL DEFAULT 'OVERRIDE',
    "scopeType" TEXT NOT NULL,
    "scopeRef" TEXT,
    "rate" REAL,
    "effectiveFrom" DATETIME,
    "effectiveTo" DATETIME,
    "reason" TEXT,
    "previousValues" JSON,
    "newValues" JSON,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxDecisionAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxDecisionAuditLog_taxRateOverrideId_fkey" FOREIGN KEY ("taxRateOverrideId") REFERENCES "TaxRateOverride" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "TaxRateOverride_workspaceId_scopeType_isActive_idx" ON "TaxRateOverride"("workspaceId", "scopeType", "isActive");
CREATE INDEX "TaxRateOverride_workspaceId_effectiveFrom_idx" ON "TaxRateOverride"("workspaceId", "effectiveFrom");

CREATE INDEX "TaxDecisionAuditLog_workspaceId_createdAt_idx" ON "TaxDecisionAuditLog"("workspaceId", "createdAt");
CREATE INDEX "TaxDecisionAuditLog_workspaceId_action_idx" ON "TaxDecisionAuditLog"("workspaceId", "action");
CREATE INDEX "TaxDecisionAuditLog_workspaceId_scopeType_idx" ON "TaxDecisionAuditLog"("workspaceId", "scopeType");
