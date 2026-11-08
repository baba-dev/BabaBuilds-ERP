-- AlterTable
ALTER TABLE "Client" ADD COLUMN "gstSupplyOverride" TEXT;
ALTER TABLE "Client" ADD COLUMN "gstReverseCharge" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "hsnCode" TEXT;
ALTER TABLE "Product" ADD COLUMN "gstRate" REAL;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN "supplierGstin" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "supplierStateCode" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN "supplierInvoiceNo" TEXT;

-- AlterTable
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "hsnCode" TEXT;
ALTER TABLE "PurchaseOrderItem" ADD COLUMN "gstRate" REAL;

-- AlterTable
ALTER TABLE "ShopOrder" ADD COLUMN "buyerStateCode" TEXT;
ALTER TABLE "ShopOrder" ADD COLUMN "buyerGstin" TEXT;
