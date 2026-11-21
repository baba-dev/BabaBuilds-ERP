-- UPI ID for pay-now QR codes on invoices, and uploaded static payment QR images.
ALTER TABLE "BusinessProfile" ADD COLUMN "upiVpa" TEXT;
ALTER TABLE "BusinessProfile" ADD COLUMN "upiPayeeName" TEXT;

CREATE TABLE "PaymentQrImage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "imagePath" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentQrImage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PaymentQrImage_workspaceId_sortOrder_idx" ON "PaymentQrImage"("workspaceId", "sortOrder");

ALTER TABLE "PaymentQrImage" ADD CONSTRAINT "PaymentQrImage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
