-- Brand accent colour for invoices: workspace default, per-client override, per-invoice override.
ALTER TABLE "BusinessProfile" ADD COLUMN "invoiceAccentColor" TEXT;
ALTER TABLE "Client" ADD COLUMN "invoiceAccentColor" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "accentColor" TEXT;
