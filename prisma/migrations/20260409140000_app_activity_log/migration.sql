-- CreateTable
CREATE TABLE "AppActivityLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "metadata" JSON,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AppActivityLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AppActivityLog_workspaceId_createdAt_idx" ON "AppActivityLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AppActivityLog_workspaceId_action_idx" ON "AppActivityLog"("workspaceId", "action");

-- CreateIndex
CREATE INDEX "AppActivityLog_workspaceId_status_idx" ON "AppActivityLog"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AppActivityLog_workspaceId_correlationId_idx" ON "AppActivityLog"("workspaceId", "correlationId");
