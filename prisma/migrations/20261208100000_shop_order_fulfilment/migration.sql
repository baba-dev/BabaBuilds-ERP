-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN "courier" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "fulfilledAt" DATETIME;
ALTER TABLE "ShopOrder" ADD COLUMN "internalNote" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "paidAt" DATETIME;
ALTER TABLE "ShopOrder" ADD COLUMN "refundedAt" DATETIME;
ALTER TABLE "ShopOrder" ADD COLUMN "shippedAt" DATETIME;
ALTER TABLE "ShopOrder" ADD COLUMN "shippingAddress" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "trackingRef" TEXT;


-- Paid shop orders created before payment times were recorded: use the last update as the best available paid time.
UPDATE "ShopOrder" SET "paidAt" = "updatedAt" WHERE "paidAt" IS NULL AND "status" IN ('PAID', 'FULFILLED', 'SHIPPED');
