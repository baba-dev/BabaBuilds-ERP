-- Canonicalize authenticated home route to /dashboard.
ALTER TABLE "User" ADD COLUMN "defaultLandingPage_new" TEXT NOT NULL DEFAULT '/dashboard';
UPDATE "User"
SET "defaultLandingPage_new" = CASE
  WHEN "defaultLandingPage" = '/' THEN '/dashboard'
  ELSE "defaultLandingPage"
END;
ALTER TABLE "User" DROP COLUMN "defaultLandingPage";
ALTER TABLE "User" RENAME COLUMN "defaultLandingPage_new" TO "defaultLandingPage";
