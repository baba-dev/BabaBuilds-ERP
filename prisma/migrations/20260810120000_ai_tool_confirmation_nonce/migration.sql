-- One-time replay protection for signed AI finance-tool confirmations.
CREATE TABLE "AiToolConfirmationNonce" (
    "nonce" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "consumedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX "AiToolConfirmationNonce_workspaceId_userId_expiresAt_idx"
ON "AiToolConfirmationNonce"("workspaceId", "userId", "expiresAt");

CREATE INDEX "AiToolConfirmationNonce_expiresAt_idx"
ON "AiToolConfirmationNonce"("expiresAt");
