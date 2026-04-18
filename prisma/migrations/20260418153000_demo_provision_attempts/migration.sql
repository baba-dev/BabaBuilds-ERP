-- CreateTable
CREATE TABLE "DemoProvisionAttempt" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ip" TEXT NOT NULL,
    "fingerprint" TEXT,
    "reason" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "DemoProvisionAttempt_createdAt_idx" ON "DemoProvisionAttempt"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "DemoProvisionAttempt_ip_createdAt_idx" ON "DemoProvisionAttempt"("ip", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DemoProvisionAttempt_fingerprint_createdAt_idx" ON "DemoProvisionAttempt"("fingerprint", "createdAt" DESC);
