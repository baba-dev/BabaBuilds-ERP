-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" DATETIME,
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "theme" TEXT NOT NULL DEFAULT 'system',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "locale" TEXT NOT NULL DEFAULT 'en-IN',
    "currencyFormat" TEXT NOT NULL DEFAULT 'INR',
    "defaultLandingPage" TEXT NOT NULL DEFAULT '/',
    "transactionalAlerts" BOOLEAN NOT NULL DEFAULT true,
    "marketingEmails" BOOLEAN NOT NULL DEFAULT false,
    "weeklyReport" BOOLEAN NOT NULL DEFAULT true
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" DATETIME NOT NULL,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSetupComplete" BOOLEAN NOT NULL DEFAULT false,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'FREE',
    "subscriptionEndsAt" DATETIME,
    "planTier" TEXT NOT NULL DEFAULT 'FREE',
    "currentMonthInvoices" INTEGER NOT NULL DEFAULT 0,
    "planInterval" TEXT,
    "paymentMethodMask" TEXT,
    "billingProviderId" TEXT,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "WorkspaceUser" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    CONSTRAINT "WorkspaceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "proprietorName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "invoiceTheme" TEXT NOT NULL DEFAULT 'DESIGN_1',
    "taxLabel" TEXT NOT NULL DEFAULT 'GST',
    "taxIdLabel" TEXT NOT NULL DEFAULT 'GSTIN',
    "routingLabel" TEXT NOT NULL DEFAULT 'IFSC Code',
    "panNumber" TEXT NOT NULL,
    "udyamNumber" TEXT,
    "gstin" TEXT,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "logoUrl" TEXT,
    "signatureUrl" TEXT,
    "groqApiKey" TEXT,
    "defaultSacCode" TEXT DEFAULT '998313',
    "defaultTaxRate" REAL,
    "razorpayKeyId" TEXT,
    "razorpayKeySecret" TEXT,
    "stripePublishableKey" TEXT,
    "stripeSecretKey" TEXT,
    "defaultGateway" TEXT DEFAULT 'RAZORPAY',
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFromEmail" TEXT,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BusinessProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "taxId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "logoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isExport" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "billingMonth" TEXT NOT NULL DEFAULT 'Unknown',
    "invoiceDate" DATETIME NOT NULL,
    "clientName" TEXT NOT NULL,
    "sacCode" TEXT,
    "serviceDescription" TEXT NOT NULL,
    "subtotal" DECIMAL NOT NULL DEFAULT 0,
    "taxRate" REAL NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL NOT NULL DEFAULT 0,
    "taxMode" TEXT NOT NULL DEFAULT 'exempt',
    "totalAmount" DECIMAL NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "amountReceived" DECIMAL,
    "dateReceived" DATETIME,
    "clientId" TEXT,
    CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "InvoiceIdempotency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "invoiceId" TEXT,
    "responseBody" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "InvoiceIdempotency_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "InvoiceIdempotency_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "description" TEXT,
    "receiptUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Expense_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "referenceId" TEXT,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "matchedInvoiceId" TEXT,
    "matchedExpenseId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankTransaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "category" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Investment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "NICCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "isCustom" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "SACCode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "igstRate" REAL NOT NULL DEFAULT 18.0,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "isCustom" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "ServiceTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultPrice" DECIMAL NOT NULL DEFAULT 0,
    "nicCodeId" TEXT,
    "sacCodeId" TEXT,
    CONSTRAINT "ServiceTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ServiceTemplate_nicCodeId_fkey" FOREIGN KEY ("nicCodeId") REFERENCES "NICCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "ServiceTemplate_sacCodeId_fkey" FOREIGN KEY ("sacCodeId") REFERENCES "SACCode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "proposalNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dateCreated" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" DATETIME NOT NULL,
    "publicToken" TEXT NOT NULL,
    "acceptedAt" DATETIME,
    "clientIp" TEXT,
    "subtotal" DECIMAL NOT NULL,
    "estimatedTax" DECIMAL NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL NOT NULL,
    CONSTRAINT "Proposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProposalItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "proposalId" TEXT NOT NULL,
    "serviceTemplateId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL NOT NULL,
    "total" DECIMAL NOT NULL,
    CONSTRAINT "ProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProposalItem_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Retainer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "amount" DECIMAL NOT NULL,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nextBillingDate" DATETIME NOT NULL,
    "autoAppendMonth" BOOLEAN NOT NULL DEFAULT true,
    "serviceName" TEXT NOT NULL,
    "sacCode" TEXT,
    "taxRate" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Retainer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Retainer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "workspaceId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceUser_userId_workspaceId_key" ON "WorkspaceUser"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_workspaceId_key" ON "BusinessProfile"("workspaceId");

-- CreateIndex
CREATE INDEX "Client_workspaceId_idx" ON "Client"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_workspaceId_key" ON "Client"("name", "workspaceId");

-- CreateIndex
CREATE INDEX "Invoice_financialYear_idx" ON "Invoice"("financialYear");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_idx" ON "Invoice"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_workspaceId_key" ON "Invoice"("invoiceNumber", "workspaceId");

-- CreateIndex
CREATE INDEX "InvoiceIdempotency_workspaceId_expiresAt_idx" ON "InvoiceIdempotency"("workspaceId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceIdempotency_workspaceId_idempotencyKey_key" ON "InvoiceIdempotency"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_workspaceId_idx" ON "Expense"("workspaceId");

-- CreateIndex
CREATE INDEX "BankTransaction_workspaceId_idx" ON "BankTransaction"("workspaceId");

-- CreateIndex
CREATE INDEX "BankTransaction_date_idx" ON "BankTransaction"("date");

-- CreateIndex
CREATE INDEX "Investment_date_idx" ON "Investment"("date");

-- CreateIndex
CREATE INDEX "Investment_category_idx" ON "Investment"("category");

-- CreateIndex
CREATE INDEX "Investment_workspaceId_idx" ON "Investment"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "NICCode_code_key" ON "NICCode"("code");

-- CreateIndex
CREATE UNIQUE INDEX "SACCode_code_key" ON "SACCode"("code");

-- CreateIndex
CREATE INDEX "ServiceTemplate_workspaceId_idx" ON "ServiceTemplate"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_publicToken_key" ON "Proposal"("publicToken");

-- CreateIndex
CREATE INDEX "Proposal_workspaceId_idx" ON "Proposal"("workspaceId");

-- CreateIndex
CREATE INDEX "Proposal_publicToken_idx" ON "Proposal"("publicToken");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_proposalNo_workspaceId_key" ON "Proposal"("proposalNo", "workspaceId");

-- CreateIndex
CREATE INDEX "Task_workspaceId_idx" ON "Task"("workspaceId");

