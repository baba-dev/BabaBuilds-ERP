-- Track the external billing contract separately from the customer/payment reference.
-- Existing production checkout records are prepaid Razorpay orders, so PREPAID is
-- the safe backwards-compatible contract type.

ALTER TABLE "Workspace" ADD COLUMN "billingProvider" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "billingContractType" TEXT NOT NULL DEFAULT 'PREPAID';
ALTER TABLE "Workspace" ADD COLUMN "billingProviderSubscriptionId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN "subscriptionCancelRequestedAt" DATETIME;
ALTER TABLE "Workspace" ADD COLUMN "subscriptionCancelEffectiveAt" DATETIME;
ALTER TABLE "Workspace" ADD COLUMN "subscriptionCancellationLastError" TEXT;
