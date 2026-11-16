-- CreateTable
CREATE TABLE "ReportView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "name" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "paramsJson" JSONB,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "visibility" TEXT NOT NULL DEFAULT 'WORKSPACE',
    "pinnedToDashboard" BOOLEAN NOT NULL DEFAULT false,
    "scheduleFrequency" TEXT,
    "scheduleRecipients" TEXT,
    "scheduleFormat" TEXT NOT NULL DEFAULT 'CSV',
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleHour" INTEGER NOT NULL DEFAULT 7,
    "scheduleTz" TEXT NOT NULL DEFAULT 'UTC',
    "scheduleNextAt" DATETIME,
    "scheduleLastAt" DATETIME,
    "scheduleLastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ReportView_workspaceId_createdByUserId_idx" ON "ReportView"("workspaceId", "createdByUserId");

-- CreateIndex
CREATE INDEX "ReportView_scheduleNextAt_idx" ON "ReportView"("scheduleNextAt");

