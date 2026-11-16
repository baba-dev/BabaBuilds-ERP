-- Idempotent PostgreSQL invoice normalization. Reviewed historical data only.
UPDATE "Invoice" SET "grandTotal"="totalAmount" WHERE "grandTotal"=0 AND "totalAmount">0;
UPDATE "Invoice" i SET "currency"=COALESCE(w."baseCurrency",'INR')
FROM "Workspace" w WHERE w."id"=i."workspaceId" AND i."exchangeRate"=1 AND i."baseGrandTotal" IS NULL;
UPDATE "Invoice" SET "baseGrandTotal"="grandTotal" WHERE "baseGrandTotal" IS NULL;
UPDATE "Invoice" SET "source"='PROPOSAL' WHERE "sourceProposalId" IS NOT NULL AND "source"='MANUAL';
UPDATE "Invoice" SET "stockCommittedAt"=COALESCE("dateReceived","createdAt")
WHERE "status"='PAID' AND "stockCommittedAt" IS NULL;
INSERT INTO "InvoicePayment" ("id","workspaceId","invoiceId","amount","receivedAt","method","notes","createdAt")
SELECT 'legacy_'||i."id",i."workspaceId",i."id",i."amountReceived",
COALESCE(i."dateReceived",i."createdAt"),'OTHER','Imported from invoice record',CURRENT_TIMESTAMP
FROM "Invoice" i
WHERE i."amountReceived" IS NOT NULL AND i."amountReceived">0
AND NOT EXISTS(SELECT 1 FROM "InvoicePayment" p WHERE p."invoiceId"=i."id");
UPDATE "Invoice" SET "dueDate"="invoiceDate"+INTERVAL '7 days'
WHERE "dueDate" IS NULL AND "status" IN ('PENDING','PARTIALLY_PAID');
