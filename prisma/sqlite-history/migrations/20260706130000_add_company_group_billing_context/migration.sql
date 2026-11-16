ALTER TABLE "CompanyGroup" ADD COLUMN "subscriptionStatus" TEXT NOT NULL DEFAULT 'FREE';
ALTER TABLE "CompanyGroup" ADD COLUMN "subscriptionEndsAt" DATETIME;
ALTER TABLE "CompanyGroup" ADD COLUMN "planTier" TEXT NOT NULL DEFAULT 'FREE';

ALTER TABLE "CompanyGroupWorkspace" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX "CompanyGroupWorkspace_workspaceId_idx";
CREATE INDEX "CompanyGroupWorkspace_workspaceId_isActive_idx" ON "CompanyGroupWorkspace"("workspaceId", "isActive");
