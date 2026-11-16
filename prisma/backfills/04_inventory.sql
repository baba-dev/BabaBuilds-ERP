UPDATE "PurchaseOrderItem" SET "receivedQuantity"="quantity"
WHERE "receivedQuantity"=0 AND "poId" IN
 (SELECT "id" FROM "PurchaseOrder" WHERE "status"='DELIVERED');
