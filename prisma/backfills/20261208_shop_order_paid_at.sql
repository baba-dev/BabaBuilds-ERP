-- Paid shop orders created before payment times were recorded: use the last update as the best available paid time.
UPDATE "ShopOrder" SET "paidAt" = "updatedAt" WHERE "paidAt" IS NULL AND "status" IN ('PAID', 'FULFILLED', 'SHIPPED');
