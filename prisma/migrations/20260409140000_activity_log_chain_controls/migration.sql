-- Add tamper-evidence fields to tax override activity logs
ALTER TABLE "TaxRateOverrideAuditLog" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "TaxRateOverrideAuditLog" ADD COLUMN "entryHash" TEXT;
ALTER TABLE "TaxRateOverrideAuditLog" ADD COLUMN "canonicalPayload" JSON;

CREATE INDEX "TaxRateOverrideAuditLog_workspaceId_entryHash_idx"
ON "TaxRateOverrideAuditLog"("workspaceId", "entryHash");
