-- Idempotent data backfill for the invoice rework (multi-currency, payments table, stock marker).
-- Applied (a) at the end of the 20261108100000_invoice_rework migration for migrated databases and
-- (b) by `npm run backfill:invoices` for databases created with `prisma db push` (production deploy).
-- Safe to run repeatedly.

-- Legacy rows created before grandTotal existed carry the default 0; totalAmount is the real total.
UPDATE "Invoice" SET "grandTotal" = "totalAmount" WHERE "grandTotal" = 0 AND "totalAmount" > 0;

-- Existing invoices are in the workspace base currency at rate 1.
UPDATE "Invoice" SET "currency" = COALESCE((SELECT "baseCurrency" FROM "Workspace" WHERE "Workspace"."id" = "Invoice"."workspaceId"), 'INR') WHERE "exchangeRate" = 1 AND "baseGrandTotal" IS NULL;
UPDATE "Invoice" SET "baseGrandTotal" = "grandTotal" WHERE "baseGrandTotal" IS NULL;

UPDATE "Invoice" SET "source" = 'PROPOSAL' WHERE "sourceProposalId" IS NOT NULL AND "source" = 'MANUAL';

-- Stock for product lines was deducted when an invoice became PAID: mark those as committed.
UPDATE "Invoice" SET "stockCommittedAt" = COALESCE("dateReceived", "createdAt") WHERE "status" = 'PAID' AND "stockCommittedAt" IS NULL;

-- One synthetic payment row per invoice that already has money received.
INSERT INTO "InvoicePayment" ("id", "workspaceId", "invoiceId", "amount", "receivedAt", "method", "notes", "createdAt")
SELECT 'legacy_' || "id", "workspaceId", "id", "amountReceived", COALESCE("dateReceived", "createdAt"), 'OTHER', 'Imported from invoice record', CURRENT_TIMESTAMP
FROM "Invoice"
WHERE "amountReceived" IS NOT NULL AND "amountReceived" > 0
  AND NOT EXISTS (SELECT 1 FROM "InvoicePayment" p WHERE p."invoiceId" = "Invoice"."id");

-- Invoices created through the main generator showed a due date on the PDF (invoice date + 7 days) but never
-- stored it, so they could never become overdue. Store the date that was printed.
UPDATE "Invoice" SET "dueDate" = "invoiceDate" + 604800000 WHERE "dueDate" IS NULL AND "status" IN ('PENDING', 'PARTIALLY_PAID');
