-- Purchase orders already delivered under the old model received every line in full.
-- Idempotent: only touches lines that still show nothing received.
UPDATE "PurchaseOrderItem"
SET "receivedQuantity" = "quantity"
WHERE "receivedQuantity" = 0
  AND "poId" IN (SELECT "id" FROM "PurchaseOrder" WHERE "status" = 'DELIVERED');
