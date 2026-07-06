CREATE TABLE "CompanyGroup" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "name" TEXT NOT NULL,
  "billingWorkspaceId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CompanyGroup_billingWorkspaceId_fkey" FOREIGN KEY ("billingWorkspaceId") REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "CompanyGroupWorkspace" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyGroupId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CompanyGroupWorkspace_companyGroupId_fkey" FOREIGN KEY ("companyGroupId") REFERENCES "CompanyGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompanyGroupWorkspace_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CompanyGroupMember" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyGroupId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'MEMBER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CompanyGroupMember_companyGroupId_fkey" FOREIGN KEY ("companyGroupId") REFERENCES "CompanyGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompanyGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CompanyGroupMemberWorkspaceAccess" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyGroupMemberId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "accessRole" TEXT NOT NULL DEFAULT 'MEMBER',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CompanyGroupMemberWorkspaceAccess_companyGroupMemberId_fkey" FOREIGN KEY ("companyGroupMemberId") REFERENCES "CompanyGroupMember" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CompanyGroupMemberWorkspaceAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CompanyGroupModule" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "companyGroupId" TEXT NOT NULL,
  "moduleKey" TEXT NOT NULL,
  "isEnabled" BOOLEAN NOT NULL DEFAULT true,
  "configJson" JSONB,
  "enabledAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "disabledAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "CompanyGroupModule_companyGroupId_fkey" FOREIGN KEY ("companyGroupId") REFERENCES "CompanyGroup" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "CompanyGroup_billingWorkspaceId_idx" ON "CompanyGroup"("billingWorkspaceId");
CREATE UNIQUE INDEX "CompanyGroupWorkspace_companyGroupId_workspaceId_key" ON "CompanyGroupWorkspace"("companyGroupId", "workspaceId");
CREATE INDEX "CompanyGroupWorkspace_workspaceId_idx" ON "CompanyGroupWorkspace"("workspaceId");
CREATE INDEX "CompanyGroupWorkspace_companyGroupId_isPrimary_idx" ON "CompanyGroupWorkspace"("companyGroupId", "isPrimary");
CREATE UNIQUE INDEX "CompanyGroupMember_companyGroupId_userId_key" ON "CompanyGroupMember"("companyGroupId", "userId");
CREATE INDEX "CompanyGroupMember_userId_idx" ON "CompanyGroupMember"("userId");
CREATE INDEX "CompanyGroupMember_companyGroupId_isActive_idx" ON "CompanyGroupMember"("companyGroupId", "isActive");
CREATE UNIQUE INDEX "CompanyGroupMemberWorkspaceAccess_companyGroupMemberId_workspaceId_key" ON "CompanyGroupMemberWorkspaceAccess"("companyGroupMemberId", "workspaceId");
CREATE INDEX "CompanyGroupMemberWorkspaceAccess_workspaceId_isActive_idx" ON "CompanyGroupMemberWorkspaceAccess"("workspaceId", "isActive");
CREATE UNIQUE INDEX "CompanyGroupModule_companyGroupId_moduleKey_key" ON "CompanyGroupModule"("companyGroupId", "moduleKey");
CREATE INDEX "CompanyGroupModule_companyGroupId_isEnabled_idx" ON "CompanyGroupModule"("companyGroupId", "isEnabled");
