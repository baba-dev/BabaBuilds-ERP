-- Default payment terms for new invoices (was hard-coded to 7 days).
ALTER TABLE "BusinessProfile" ADD COLUMN "invoiceTermsDays" INTEGER NOT NULL DEFAULT 7;
