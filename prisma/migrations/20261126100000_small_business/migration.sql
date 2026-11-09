-- Small-business rules: supply kind (GST threshold), MSME investment, and MSME vendor tags for section 43B(h).
ALTER TABLE "BusinessProfile" ADD COLUMN "gstSupplyKind" TEXT NOT NULL DEFAULT 'SERVICES';
ALTER TABLE "BusinessProfile" ADD COLUMN "msmeInvestment" DECIMAL;
ALTER TABLE "Expense" ADD COLUMN "vendorUdyam" TEXT;
ALTER TABLE "Expense" ADD COLUMN "vendorMsme" TEXT;
ALTER TABLE "Expense" ADD COLUMN "vendorAgreedDays" INTEGER;
