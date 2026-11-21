-- Expected TDS: a per-client default and the amount shown on each invoice.
ALTER TABLE "Client" ADD COLUMN "tdsSection" TEXT;
ALTER TABLE "Client" ADD COLUMN "tdsRatePercent" DOUBLE PRECISION;
ALTER TABLE "Invoice" ADD COLUMN "tdsSection" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "tdsRatePercent" DOUBLE PRECISION;
ALTER TABLE "Invoice" ADD COLUMN "tdsAmount" DECIMAL(65,30);
