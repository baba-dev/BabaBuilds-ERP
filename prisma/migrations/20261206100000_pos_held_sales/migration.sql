-- CreateTable
CREATE TABLE "PosHeldSale" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "clientId" TEXT,
    "cartJson" JSONB NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "PosHeldSale_workspaceId_createdAt_idx" ON "PosHeldSale"("workspaceId", "createdAt");

