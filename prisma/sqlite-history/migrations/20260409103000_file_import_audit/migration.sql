-- CreateTable
CREATE TABLE "FileImportAuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "flow" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FileImportAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "FileImportAuditLog_workspaceId_createdAt_idx" ON "FileImportAuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "FileImportAuditLog_workspaceId_status_idx" ON "FileImportAuditLog"("workspaceId", "status");
