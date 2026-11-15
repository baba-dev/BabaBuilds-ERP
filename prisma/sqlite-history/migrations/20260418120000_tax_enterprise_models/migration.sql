-- Persisted tax determination chain + audit + idempotency + global reference catalog

CREATE TABLE "TaxableEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "sourceEntityKind" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "taxableAmount" REAL NOT NULL,
    "originCountryCode" TEXT NOT NULL DEFAULT '',
    "destinationCountryCode" TEXT NOT NULL DEFAULT '',
    "occurredAt" DATETIME NOT NULL,
    "invoiceId" TEXT,
    "expenseId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxableEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxableEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxableEvent_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TaxDetermination" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "taxableEventId" TEXT NOT NULL,
    "ratePercent" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "totalAmount" REAL NOT NULL,
    "resolutionSource" TEXT NOT NULL,
    "resolutionReason" TEXT NOT NULL,
    "overrideId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxDetermination_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxDetermination_taxableEventId_fkey" FOREIGN KEY ("taxableEventId") REFERENCES "TaxableEvent" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TaxDetermination_taxableEventId_key" ON "TaxDetermination"("taxableEventId");

CREATE TABLE "TaxComponentLine" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "taxDeterminationId" TEXT NOT NULL,
    "componentKey" TEXT NOT NULL,
    "ratePercent" REAL NOT NULL,
    "taxableAmount" REAL NOT NULL,
    "taxAmount" REAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxComponentLine_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TaxComponentLine_taxDeterminationId_fkey" FOREIGN KEY ("taxDeterminationId") REFERENCES "TaxDetermination" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TaxAuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "correlationId" TEXT,
    "actorUserId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "payloadJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxAuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "TaxOperationIdempotency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" TEXT,
    "status" TEXT NOT NULL DEFAULT 'CONSUMED',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxOperationIdempotency_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TaxOperationIdempotency_workspaceId_operation_idempotencyKey_key" ON "TaxOperationIdempotency"("workspaceId", "operation", "idempotencyKey");

CREATE TABLE "TaxReferenceEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT,
    "entryType" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "code" TEXT NOT NULL,
    "label" TEXT,
    "payloadJson" TEXT NOT NULL,
    "effectiveFrom" DATETIME,
    "effectiveTo" DATETIME,
    "sourceDocumentRef" TEXT,
    "verificationLevel" TEXT,
    "reviewStatus" TEXT,
    "legalCertaintyRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TaxReferenceEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "TaxReferenceEntry_entryType_countryCode_code_key" ON "TaxReferenceEntry"("entryType", "countryCode", "code");

CREATE INDEX "TaxableEvent_workspaceId_sourceEntityKind_sourceEntityId_idx" ON "TaxableEvent"("workspaceId", "sourceEntityKind", "sourceEntityId");
CREATE INDEX "TaxableEvent_workspaceId_occurredAt_idx" ON "TaxableEvent"("workspaceId", "occurredAt");
CREATE INDEX "TaxDetermination_workspaceId_idx" ON "TaxDetermination"("workspaceId");
CREATE INDEX "TaxComponentLine_workspaceId_taxDeterminationId_idx" ON "TaxComponentLine"("workspaceId", "taxDeterminationId");
CREATE INDEX "TaxAuditEvent_workspaceId_createdAt_idx" ON "TaxAuditEvent"("workspaceId", "createdAt" DESC);
CREATE INDEX "TaxAuditEvent_workspaceId_correlationId_idx" ON "TaxAuditEvent"("workspaceId", "correlationId");
CREATE INDEX "TaxAuditEvent_workspaceId_eventType_createdAt_idx" ON "TaxAuditEvent"("workspaceId", "eventType", "createdAt" DESC);
CREATE INDEX "TaxOperationIdempotency_workspaceId_expiresAt_idx" ON "TaxOperationIdempotency"("workspaceId", "expiresAt");
CREATE INDEX "TaxReferenceEntry_workspaceId_entryType_idx" ON "TaxReferenceEntry"("workspaceId", "entryType");
CREATE INDEX "TaxReferenceEntry_countryCode_entryType_idx" ON "TaxReferenceEntry"("countryCode", "entryType");
