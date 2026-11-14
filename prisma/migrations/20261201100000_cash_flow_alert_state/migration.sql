-- AlterTable
ALTER TABLE "CashForecastAlertPreference" ADD COLUMN "lastAlertAt" DATETIME;
ALTER TABLE "CashForecastAlertPreference" ADD COLUMN "lastAlertKey" TEXT;
