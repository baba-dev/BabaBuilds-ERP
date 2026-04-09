-- CreateTable
CREATE TABLE "AppActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadataJson" JSON,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "requestId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppActivityLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AppActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "AppActivityLog_status_check" CHECK ("status" IN ('SUCCESS', 'FAILURE'))
);

-- CreateIndex
CREATE INDEX "AppActivityLog_createdAt_idx" ON "AppActivityLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AppActivityLog_workspaceId_createdAt_idx" ON "AppActivityLog"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AppActivityLog_action_createdAt_idx" ON "AppActivityLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AppActivityLog_actorUserId_createdAt_idx" ON "AppActivityLog"("actorUserId", "createdAt" DESC);
