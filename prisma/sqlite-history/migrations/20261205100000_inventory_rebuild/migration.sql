-- AlterTable
ALTER TABLE "Product" ADD COLUMN "archivedAt" DATETIME;
ALTER TABLE "Product" ADD COLUMN "leadTimeDays" INTEGER;
ALTER TABLE "Product" ADD COLUMN "preferredVendorId" TEXT;
ALTER TABLE "Product" ADD COLUMN "reorderQuantity" INTEGER;

-- AlterTable
ALTER TABLE "InventoryMovement" ADD COLUMN "balanceAfter" INTEGER;
ALTER TABLE "InventoryMovement" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "InventoryMovement" ADD COLUMN "unitCost" DECIMAL;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "createdByUserId" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "notes" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "sentAt" DATETIME;
ALTER TABLE "PurchaseOrder" ADD COLUMN "vendorId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PurchaseOrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "poId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL NOT NULL,
    "expectedTotal" DECIMAL NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "hsnCode" TEXT,
    "gstRate" REAL,
    CONSTRAINT "PurchaseOrderItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_PurchaseOrderItem" ("expectedTotal", "gstRate", "hsnCode", "id", "poId", "productId", "quantity", "unitPrice") SELECT "expectedTotal", "gstRate", "hsnCode", "id", "poId", "productId", "quantity", "unitPrice" FROM "PurchaseOrderItem";
DROP TABLE "PurchaseOrderItem";
ALTER TABLE "new_PurchaseOrderItem" RENAME TO "PurchaseOrderItem";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;


-- Backfill: lines of purchase orders already delivered received their full quantity.
UPDATE "PurchaseOrderItem" SET "receivedQuantity" = "quantity" WHERE "receivedQuantity" = 0 AND "poId" IN (SELECT "id" FROM "PurchaseOrder" WHERE "status" = 'DELIVERED');
