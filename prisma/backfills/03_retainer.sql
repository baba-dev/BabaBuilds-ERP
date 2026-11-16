UPDATE "Retainer" SET "name"="serviceName"
WHERE "name" IS NULL AND "serviceName" IS NOT NULL AND BTRIM("serviceName")<>'';
UPDATE "Retainer" r SET "name"=(
 SELECT "title" FROM "RetainerItem" ri WHERE ri."retainerId"=r."id"
 ORDER BY "id" LIMIT 1)
WHERE r."name" IS NULL;
