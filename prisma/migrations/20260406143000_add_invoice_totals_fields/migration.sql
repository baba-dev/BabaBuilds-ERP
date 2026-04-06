-- Add explicit totals breakdown fields to invoices.
ALTER TABLE "Invoice"
  ADD COLUMN "subtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "taxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "grandTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "taxMode" TEXT NOT NULL DEFAULT 'exempt';

-- Backfill from existing totalAmount for historical invoices.
UPDATE "Invoice"
SET
  "subtotal" = COALESCE("totalAmount", 0),
  "taxRate" = 0,
  "taxAmount" = 0,
  "grandTotal" = COALESCE("totalAmount", 0),
  "taxMode" = 'exempt'
WHERE "grandTotal" = 0;
