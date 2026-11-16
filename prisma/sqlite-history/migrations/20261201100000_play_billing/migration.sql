-- CreateTable
CREATE TABLE "PlayPurchase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "purchaseToken" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "subscriptionState" TEXT NOT NULL,
    "autoRenewing" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" DATETIME,
    "latestOrderId" TEXT,
    "linkedPurchaseToken" TEXT,
    "isTestPurchase" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" DATETIME,
    "lastSyncedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlayPurchase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "PlayPurchase_purchaseToken_key" ON "PlayPurchase"("purchaseToken");

-- CreateIndex
CREATE INDEX "PlayPurchase_workspaceId_idx" ON "PlayPurchase"("workspaceId");

