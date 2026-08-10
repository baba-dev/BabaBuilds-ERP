-- Fail closed: legacy placeholder jobs are not executable or successful OCR evidence.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_DocumentOcrJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentFileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'GENERIC',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "finishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DocumentOcrJob_workspaceId_fkey"
      FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentOcrJob_documentId_fkey"
      FOREIGN KEY ("documentId") REFERENCES "Document" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DocumentOcrJob_documentFileId_fkey"
      FOREIGN KEY ("documentFileId") REFERENCES "DocumentFile" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_DocumentOcrJob" (
    "id",
    "workspaceId",
    "documentId",
    "documentFileId",
    "kind",
    "status",
    "provider",
    "attemptCount",
    "errorCode",
    "errorMessage",
    "queuedAt",
    "startedAt",
    "finishedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    "id",
    "workspaceId",
    "documentId",
    "documentFileId",
    "kind",
    CASE WHEN "provider" = 'UNCONFIGURED' THEN 'FAILED' ELSE "status" END,
    CASE WHEN "provider" = 'UNCONFIGURED' THEN 'DISABLED_LEGACY' ELSE "provider" END,
    "attemptCount",
    CASE
      WHEN "provider" = 'UNCONFIGURED' THEN 'OCR_CAPABILITY_DISABLED'
      ELSE "errorCode"
    END,
    CASE
      WHEN "provider" = 'UNCONFIGURED'
        THEN 'Legacy placeholder OCR job disabled during production-readiness remediation.'
      ELSE "errorMessage"
    END,
    "queuedAt",
    "startedAt",
    CASE
      WHEN "provider" = 'UNCONFIGURED' THEN COALESCE("finishedAt", CURRENT_TIMESTAMP)
      ELSE "finishedAt"
    END,
    "createdAt",
    CURRENT_TIMESTAMP
FROM "DocumentOcrJob";

DROP TABLE "DocumentOcrJob";
ALTER TABLE "new_DocumentOcrJob" RENAME TO "DocumentOcrJob";

CREATE INDEX "DocumentOcrJob_workspaceId_status_queuedAt_idx"
  ON "DocumentOcrJob"("workspaceId", "status", "queuedAt" DESC);
CREATE INDEX "DocumentOcrJob_workspaceId_documentId_idx"
  ON "DocumentOcrJob"("workspaceId", "documentId");
CREATE INDEX "DocumentOcrJob_workspaceId_documentFileId_idx"
  ON "DocumentOcrJob"("workspaceId", "documentFileId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
