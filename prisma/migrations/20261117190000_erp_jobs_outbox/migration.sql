-- Additive PostgreSQL-only outbox. Existing production financial tables are not modified.
CREATE TABLE "ErpJobOutbox" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "payloadJson" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ErpJobOutbox_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ErpJobOutbox_workspaceId_kind_dedupeKey_key"
  ON "ErpJobOutbox"("workspaceId", "kind", "dedupeKey");
CREATE INDEX "ErpJobOutbox_status_nextAttemptAt_idx"
  ON "ErpJobOutbox"("status", "nextAttemptAt");
CREATE INDEX "ErpJobOutbox_workspaceId_createdAt_idx"
  ON "ErpJobOutbox"("workspaceId", "createdAt" DESC);
ALTER TABLE "ErpJobOutbox" ADD CONSTRAINT "ErpJobOutbox_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
