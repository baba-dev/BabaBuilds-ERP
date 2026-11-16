CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB,
    "errorMessage" TEXT,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "ProcessedWebhookEvent_provider_eventId_key"
ON "ProcessedWebhookEvent"("provider", "eventId");

CREATE INDEX "ProcessedWebhookEvent_provider_createdAt_idx"
ON "ProcessedWebhookEvent"("provider", "createdAt");

CREATE INDEX "ProcessedWebhookEvent_provider_status_createdAt_idx"
ON "ProcessedWebhookEvent"("provider", "status", "createdAt");
