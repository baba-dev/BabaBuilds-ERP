-- Phase 5 additive, fail-closed delivery-intent ledger.
-- No existing table is altered or backfilled and no external delivery is enabled.
-- Must be tested against an independent restored PG17 snapshot before production.
CREATE TABLE "ErpJobDelivery" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventKind" TEXT NOT NULL,
    "occurrenceKey" TEXT NOT NULL,
    "recipientKey" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "claimToken" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "externalAttemptedAt" TIMESTAMP(3),
    "providerAckHash" TEXT,
    "lastErrorCode" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpJobDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErpJobDelivery_occurrence_unique"
    ON "ErpJobDelivery"("workspaceId","eventKind","occurrenceKey","channel","recipientKey");

CREATE INDEX "ErpJobDelivery_pending_idx"
    ON "ErpJobDelivery"("status","nextAttemptAt");

CREATE INDEX "ErpJobDelivery_ws_created_idx"
    ON "ErpJobDelivery"("workspaceId","createdAt" DESC);

ALTER TABLE "ErpJobDelivery"
ADD CONSTRAINT "ErpJobDelivery_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
