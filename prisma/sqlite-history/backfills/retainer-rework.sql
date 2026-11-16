-- Retainer rework: idempotent data fix-ups (safe to run on every deploy).
-- Give legacy retainers a display name from the old single-service field or their first item.
UPDATE "Retainer" SET "name" = "serviceName" WHERE "name" IS NULL AND "serviceName" IS NOT NULL AND TRIM("serviceName") <> '';
UPDATE "Retainer" SET "name" = (SELECT "title" FROM "RetainerItem" WHERE "RetainerItem"."retainerId" = "Retainer"."id" ORDER BY "id" LIMIT 1) WHERE "name" IS NULL;
-- Cycles already billed = invoices generated for that client from the retainer engine are not attributable, so start at 0.
