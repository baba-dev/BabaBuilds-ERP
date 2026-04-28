-- Product-only shop hardening migration
-- 1) Product storefront visibility fields and supporting index
ALTER TABLE "Product" ADD COLUMN "showInShop" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN "shopSortOrder" INTEGER;
ALTER TABLE "Product" ADD COLUMN "shopDescription" TEXT;
ALTER TABLE "Product" ADD COLUMN "shopImageUrl" TEXT;

CREATE INDEX "Product_workspaceId_showInShop_currentStock_idx"
ON "Product"("workspaceId", "showInShop", "currentStock");
