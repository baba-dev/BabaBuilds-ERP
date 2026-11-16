-- Financial operation idempotency + replay safety controls
CREATE TABLE "FinancialOperationIdempotency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "FinancialOperationIdempotency_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "FinancialOperationIdempotency_workspaceId_operation_idempotencyKey_key"
ON "FinancialOperationIdempotency"("workspaceId", "operation", "idempotencyKey");

CREATE INDEX "FinancialOperationIdempotency_workspaceId_operation_expiresAt_idx"
ON "FinancialOperationIdempotency"("workspaceId", "operation", "expiresAt");

CREATE UNIQUE INDEX "BillingTransaction_workspaceId_providerReference_key"
ON "BillingTransaction"("workspaceId", "providerReference");
