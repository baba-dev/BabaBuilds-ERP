-- Add tamper-evidence fields to tax decision activity logs
ALTER TABLE "TaxDecisionAuditLog" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "TaxDecisionAuditLog" ADD COLUMN "entryHash" TEXT;
ALTER TABLE "TaxDecisionAuditLog" ADD COLUMN "canonicalPayload" JSON;

CREATE INDEX "TaxDecisionAuditLog_workspaceId_entryHash_idx"
ON "TaxDecisionAuditLog"("workspaceId", "entryHash");
