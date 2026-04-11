-- First-login onboarding state stored server-side per user
CREATE TABLE "UserOnboarding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "completedSteps" TEXT NOT NULL DEFAULT '[]',
    "dismissedAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "UserOnboarding_userId_key" ON "UserOnboarding"("userId");

CREATE INDEX "UserOnboarding_isFirstLogin_idx" ON "UserOnboarding"("isFirstLogin");

ALTER TABLE "UserOnboarding"
ADD CONSTRAINT "UserOnboarding_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
