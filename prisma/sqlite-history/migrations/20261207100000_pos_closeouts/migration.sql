-- CreateTable
CREATE TABLE "PosCloseout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" DATETIME NOT NULL,
    "closedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "salesCount" INTEGER NOT NULL DEFAULT 0,
    "totalSales" DECIMAL NOT NULL DEFAULT 0,
    "expectedCash" DECIMAL NOT NULL DEFAULT 0,
    "countedCash" DECIMAL NOT NULL DEFAULT 0,
    "variance" DECIMAL NOT NULL DEFAULT 0,
    "byMethodJson" JSONB,
    "notes" TEXT
);

-- CreateIndex
CREATE INDEX "PosCloseout_workspaceId_closedAt_idx" ON "PosCloseout"("workspaceId", "closedAt");

