-- First-login onboarding state stored server-side per user
CREATE TABLE "UserOnboarding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "completedSteps" TEXT NOT NULL DEFAULT '[]',
    "dismissedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "UserOnboarding_userId_key" ON "UserOnboarding"("userId");

CREATE INDEX "UserOnboarding_isFirstLogin_idx" ON "UserOnboarding"("isFirstLogin");

-- Backfill legacy accounts so pre-existing users are NOT treated as first-login users.
INSERT INTO "UserOnboarding" (
    "id",
    "userId",
    "isFirstLogin",
    "completedSteps",
    "dismissedAt",
    "completedAt",
    "createdAt",
    "updatedAt"
)
SELECT
    'legacy_onboarding_' || "id",
    "id",
    false,
    '[]',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "User";
