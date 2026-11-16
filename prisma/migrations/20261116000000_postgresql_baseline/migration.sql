-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PARTIALLY_PAID', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "InvoiceSource" AS ENUM ('MANUAL', 'PROPOSAL', 'RETAINER', 'POS', 'SHOP', 'API');

-- CreateEnum
CREATE TYPE "BusinessRoleEnum" AS ENUM ('OWNER', 'ADMIN', 'FINANCE_MANAGER', 'ACCOUNTANT', 'SALES_MANAGER', 'OPERATIONS_MANAGER', 'INVENTORY_MANAGER', 'STAFF', 'VIEWER');

-- CreateEnum
CREATE TYPE "CashForecastHorizonType" AS ENUM ('DAILY_30', 'WEEKLY_13', 'MONTHLY_12');

-- CreateEnum
CREATE TYPE "CashForecastScenarioTag" AS ENUM ('BASE', 'BEST_CASE', 'WORST_CASE');

-- CreateEnum
CREATE TYPE "CashForecastDirection" AS ENUM ('INFLOW', 'OUTFLOW');

-- CreateEnum
CREATE TYPE "CashForecastSourceType" AS ENUM ('INVOICE', 'RETAINER', 'EXPENSE', 'PURCHASE_ORDER', 'BANK_TRANSACTION', 'MANUAL', 'SERVICE_ORDER', 'TAX', 'PAYROLL');

-- CreateEnum
CREATE TYPE "CashForecastClassification" AS ENUM ('ACTUAL', 'COMMITTED', 'EXPECTED', 'PREDICTED', 'MANUAL');

-- CreateEnum
CREATE TYPE "CashForecastGeneratedBy" AS ENUM ('SYSTEM', 'USER', 'RULE_CHANGE', 'DATA_IMPORT');

-- CreateEnum
CREATE TYPE "CashForecastRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WorkspaceTaxMode" AS ENUM ('AUTO', 'AUTO_WITH_OVERRIDE', 'MANUAL');

-- CreateEnum
CREATE TYPE "TaxOverrideScopeType" AS ENUM ('GLOBAL', 'COUNTRY', 'REGION', 'SERVICE', 'CUSTOMER');

-- CreateEnum
CREATE TYPE "TaxResolutionSource" AS ENUM ('MANUAL_OVERRIDE', 'WORKSPACE_RULE', 'PROVIDER', 'FALLBACK');

-- CreateEnum
CREATE TYPE "TaxReturnFamily" AS ENUM ('INDIA_TDS_QTR');

-- CreateEnum
CREATE TYPE "TaxReadinessSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "TaxReturnStatus" AS ENUM ('DRAFT', 'BLOCKED', 'NEEDS_REVIEW', 'READY', 'FILED');

-- CreateEnum
CREATE TYPE "TaxReadinessBlockerStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateEnum
CREATE TYPE "FilingFrequency" AS ENUM ('MONTHLY', 'QUARTERLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "TaxObligationStatus" AS ENUM ('OPEN', 'READY', 'OVERDUE', 'FILED');

-- CreateEnum
CREATE TYPE "ComplianceTaskStatus" AS ENUM ('PENDING', 'COMPLETED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "AccountingEventType" AS ENUM ('INVOICE_CREATED', 'PAYMENT_CAPTURED', 'REFUND_ISSUED', 'CREDIT_NOTE_ISSUED', 'CHARGEBACK_RECORDED', 'FX_CONVERSION_RECORDED', 'WRITE_OFF_RECORDED', 'MANUAL_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AccountingLineSide" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "ProposalConversionType" AS ENUM ('ONE_TIME_INVOICE', 'RETAINER', 'SHOP_ORDER', 'MILESTONE_BILLING');

-- CreateEnum
CREATE TYPE "DistributorCommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOID', 'CLAWED_BACK');

-- CreateEnum
CREATE TYPE "ResellerStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "CouponAudience" AS ENUM ('RESELLER', 'CUSTOMER_REFERRAL');

-- CreateEnum
CREATE TYPE "CouponDiscountType" AS ENUM ('PERCENT', 'FIXED');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('LEAD', 'QUALIFIED', 'WON', 'LOST');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'VOID');

-- CreateEnum
CREATE TYPE "DistributorMarginBasis" AS ENUM ('LIST', 'PAID');

-- CreateEnum
CREATE TYPE "DistributorPayoutStatus" AS ENUM ('DRAFT', 'PAID');

-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'PAID', 'FAILED');

-- CreateEnum
CREATE TYPE "ReferralRewardType" AS ENUM ('FREE_MONTH', 'WALLET_CREDIT');

-- CreateEnum
CREATE TYPE "ReportShareScope" AS ENUM ('WORKSPACE', 'GROUP');

-- CreateEnum
CREATE TYPE "ReportShareAudience" AS ENUM ('INTERNAL', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "ReportShareStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "ReferralRewardStatus" AS ENUM ('PENDING', 'APPROVED', 'APPLIED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EmploymentStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'LATE', 'ABSENT', 'HALF_DAY', 'HOLIDAY', 'REMOTE');

-- CreateEnum
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayrollInputMode" AS ENUM ('STANDALONE', 'WORKFORCE_LINKED');

-- CreateEnum
CREATE TYPE "PayComponentCategory" AS ENUM ('BASE_SALARY', 'ALLOWANCE', 'VARIABLE_PAY', 'DEDUCTION', 'EMPLOYER_CONTRIBUTION');

-- CreateEnum
CREATE TYPE "PayrollPeriodStatus" AS ENUM ('OPEN', 'PROCESSING', 'CLOSED');

-- CreateEnum
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'POSTED');

-- CreateEnum
CREATE TYPE "PayrollPostingStatus" AS ENUM ('PENDING', 'POSTED', 'FAILED');

-- CreateEnum
CREATE TYPE "ErrorStatus" AS ENUM ('UNRESOLVED', 'ANALYZING', 'RESOLVED', 'IGNORED');

-- CreateEnum
CREATE TYPE "RemediationType" AS ENUM ('CODE_PATCH', 'DATA_SCRIPT', 'SYSTEM_RESTART', 'SECURITY_BAN');

-- CreateEnum
CREATE TYPE "RemediationStatus" AS ENUM ('PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'SUCCESS', 'FAILED');

-- CreateTable
CREATE TABLE "Distributor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "defaultMarginPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "defaultMarginBasis" "DistributorMarginBasis" NOT NULL DEFAULT 'LIST',
    "marginByPlanJson" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Distributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributorCoupon" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "customerDiscountPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "marginPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "marginBasis" "DistributorMarginBasis",
    "allowedTiers" TEXT NOT NULL DEFAULT 'PRO,TEAM',
    "firstPurchaseOnly" BOOLEAN NOT NULL DEFAULT false,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributorCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributorPayout" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "status" "DistributorPayoutStatus" NOT NULL DEFAULT 'DRAFT',
    "periodLabel" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "method" TEXT,
    "reference" TEXT,
    "paidAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributorPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributorAuditLog" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributorAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributorAttribution" (
    "id" TEXT NOT NULL,
    "couponId" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DistributorAttribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributorCommission" (
    "id" TEXT NOT NULL,
    "distributorId" TEXT NOT NULL,
    "couponId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "billingTransactionId" TEXT NOT NULL,
    "listAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "marginPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "DistributorCommissionStatus" NOT NULL DEFAULT 'PENDING',
    "marginBasisUsed" "DistributorMarginBasis" NOT NULL DEFAULT 'LIST',
    "payoutId" TEXT,
    "clawbackReason" TEXT,
    "reversedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributorCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT,
    "emailVerified" TIMESTAMP(3),
    "image" TEXT,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "passwordHash" TEXT,
    "passwordUpdatedAt" TIMESTAMP(3),
    "passwordFailedAttempts" INTEGER NOT NULL DEFAULT 0,
    "passwordLockedUntil" TIMESTAMP(3),
    "passwordLastFailureAt" TIMESTAMP(3),
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "demoTemplateKey" TEXT,
    "demoExpiresAt" TIMESTAMP(3),
    "theme" TEXT NOT NULL DEFAULT 'system',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "locale" TEXT NOT NULL DEFAULT 'en-IN',
    "currencyFormat" TEXT NOT NULL DEFAULT 'INR',
    "defaultLandingPage" TEXT NOT NULL DEFAULT '/dashboard',
    "transactionalAlerts" BOOLEAN NOT NULL DEFAULT true,
    "marketingEmails" BOOLEAN NOT NULL DEFAULT false,
    "weeklyReport" BOOLEAN NOT NULL DEFAULT true,
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT true,
    "notifyInApp" BOOLEAN NOT NULL DEFAULT true,
    "distributorPartnerId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnCredential" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialID" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "counter" INTEGER NOT NULL DEFAULT 0,
    "transports" TEXT,
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "WebAuthnCredential_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebAuthnChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "challenge" TEXT NOT NULL,
    "tokenHash" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usedAt" TIMESTAMP(3),

    CONSTRAINT "WebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOnboarding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "persona" TEXT,
    "isFirstLogin" BOOLEAN NOT NULL DEFAULT true,
    "completedSteps" TEXT NOT NULL DEFAULT '[]',
    "dismissedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOnboarding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requestedIp" TEXT,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
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

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "demoTemplateKey" TEXT,
    "demoExpiresAt" TIMESTAMP(3),
    "isSetupComplete" BOOLEAN NOT NULL DEFAULT false,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "baseCurrency" TEXT NOT NULL DEFAULT 'INR',
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'FREE',
    "subscriptionEndsAt" TIMESTAMP(3),
    "planTier" TEXT NOT NULL DEFAULT 'FREE',
    "currentMonthInvoices" INTEGER NOT NULL DEFAULT 0,
    "seatAddonCount" INTEGER NOT NULL DEFAULT 0,
    "planInterval" TEXT,
    "paymentMethodMask" TEXT,
    "billingProviderId" TEXT,
    "billingProvider" TEXT,
    "billingContractType" TEXT NOT NULL DEFAULT 'PREPAID',
    "billingProviderSubscriptionId" TEXT,
    "subscriptionCancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionCancelRequestedAt" TIMESTAMP(3),
    "subscriptionCancelEffectiveAt" TIMESTAMP(3),
    "subscriptionCancellationLastError" TEXT,
    "hasEverSubscribed" BOOLEAN NOT NULL DEFAULT false,
    "signupIntentJson" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subscriptionStatus" TEXT NOT NULL DEFAULT 'FREE',
    "subscriptionEndsAt" TIMESTAMP(3),
    "planTier" TEXT NOT NULL DEFAULT 'FREE',
    "billingWorkspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyGroupWorkspace" (
    "id" TEXT NOT NULL,
    "companyGroupId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL DEFAULT 'MEMBER',
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyGroupWorkspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyGroupMember" (
    "id" TEXT NOT NULL,
    "companyGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "groupRole" TEXT NOT NULL DEFAULT 'MEMBER',
    "accessMode" TEXT NOT NULL DEFAULT 'SPECIFIC_COMPANIES',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyGroupMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyGroupMemberWorkspaceAccess" (
    "id" TEXT NOT NULL,
    "companyGroupMemberId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accessRole" TEXT NOT NULL DEFAULT 'MEMBER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyGroupMemberWorkspaceAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyGroupModule" (
    "id" TEXT NOT NULL,
    "companyGroupId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyGroupModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "ResellerStatus" NOT NULL DEFAULT 'ACTIVE',
    "defaultCustomerDiscount" DECIMAL(65,30) NOT NULL DEFAULT 25,
    "defaultCommissionPercent" DECIMAL(65,30) NOT NULL DEFAULT 12.5,
    "payoutTerms" TEXT NOT NULL DEFAULT 'Net 30',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerCoupon" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "audience" "CouponAudience" NOT NULL DEFAULT 'RESELLER',
    "discountType" "CouponDiscountType" NOT NULL DEFAULT 'PERCENT',
    "discountValue" DECIMAL(65,30) NOT NULL DEFAULT 25,
    "commissionPercent" DECIMAL(65,30) NOT NULL DEFAULT 12.5,
    "firstPurchaseOnly" BOOLEAN NOT NULL DEFAULT true,
    "firstYearOnly" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "maxUses" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerCoupon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerLead" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "couponId" TEXT,
    "workspaceId" TEXT NOT NULL,
    "stage" "LeadStage" NOT NULL DEFAULT 'LEAD',
    "conversionAt" TIMESTAMP(3),
    "closedDealValue" DECIMAL(65,30),
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerPublicQuery" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "company" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "monthlyClientLeads" INTEGER,
    "message" TEXT NOT NULL,
    "budgetBand" TEXT,
    "status" "LeadStage" NOT NULL DEFAULT 'LEAD',
    "source" TEXT NOT NULL DEFAULT 'public_reseller_page',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerPublicQuery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerCommission" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "leadId" TEXT,
    "billingTransactionId" TEXT,
    "dealAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "commissionPercent" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "commissionAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "CommissionStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "payoutId" TEXT,

    CONSTRAINT "ResellerCommission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResellerPayout" (
    "id" TEXT NOT NULL,
    "resellerId" TEXT NOT NULL,
    "payoutDate" TIMESTAMP(3),
    "method" TEXT,
    "reference" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResellerPayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerReferralProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "shareLink" TEXT,
    "totalReferrals" INTEGER NOT NULL DEFAULT 0,
    "successfulReferrals" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerReferralProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerReferralRedemption" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "referredWorkspaceId" TEXT NOT NULL,
    "friendDiscountPercent" DECIMAL(65,30) NOT NULL DEFAULT 20,
    "convertedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerReferralRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerReferralReward" (
    "id" TEXT NOT NULL,
    "redemptionId" TEXT NOT NULL,
    "referrerWorkspaceId" TEXT NOT NULL,
    "rewardType" "ReferralRewardType" NOT NULL DEFAULT 'WALLET_CREDIT',
    "rewardStatus" "ReferralRewardStatus" NOT NULL DEFAULT 'PENDING',
    "walletCreditAmount" DECIMAL(65,30),
    "freeMonthsCount" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerReferralReward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoProvisionAttempt" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "fingerprint" TEXT,
    "templateKey" TEXT,
    "isAllowed" BOOLEAN NOT NULL DEFAULT false,
    "blockReason" TEXT,
    "retryAfterSeconds" INTEGER,

    CONSTRAINT "DemoProvisionAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppActivityLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "status" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppActivityLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlayPurchase" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "purchaseToken" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "interval" TEXT NOT NULL,
    "subscriptionState" TEXT NOT NULL,
    "autoRenewing" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "latestOrderId" TEXT,
    "linkedPurchaseToken" TEXT,
    "isTestPurchase" BOOLEAN NOT NULL DEFAULT false,
    "acknowledgedAt" TIMESTAMP(3),
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlayPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingTransaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PAID',
    "description" TEXT NOT NULL,
    "providerReference" TEXT,
    "receiptUrl" TEXT,
    "subscriptionListAmount" DECIMAL(65,30),
    "distributorCouponId" TEXT,
    "subscriptionCurrency" TEXT DEFAULT 'INR',
    "subscriptionInterval" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialOperationIdempotency" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialOperationIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedWebhookEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "payload" JSONB,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProcessedWebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingTransaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventType" "AccountingEventType" NOT NULL,
    "eventOccurredAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postingCurrency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(65,30),
    "description" TEXT,
    "sourceTable" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceRef" TEXT,
    "requestId" TEXT,
    "jobId" TEXT,
    "statementBatchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountingTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntry" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "accountCode" TEXT NOT NULL,
    "side" "AccountingLineSide" NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "isPosted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingIntegrityRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runType" TEXT NOT NULL DEFAULT 'NIGHTLY',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "summary" JSONB,

    CONSTRAINT "AccountingIntegrityRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingViolationReport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "invariantCode" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'ERROR',
    "details" JSONB NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingViolationReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceUser" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OWNER',
    "businessRole" "BusinessRoleEnum" DEFAULT 'OWNER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActiveAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportShare" (
    "id" TEXT NOT NULL,
    "scope" "ReportShareScope" NOT NULL,
    "audience" "ReportShareAudience" NOT NULL DEFAULT 'INTERNAL',
    "status" "ReportShareStatus" NOT NULL DEFAULT 'ACTIVE',
    "reportKey" TEXT NOT NULL,
    "name" TEXT,
    "token" TEXT NOT NULL,
    "tokenHash" TEXT,
    "workspaceId" TEXT,
    "companyGroupId" TEXT,
    "createdByUserId" TEXT,
    "liveDataEnabled" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportShareSnapshot" (
    "id" TEXT NOT NULL,
    "reportShareId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "companyGroupId" TEXT,
    "includedWorkspaceIds" JSONB NOT NULL,
    "filtersJson" JSONB,
    "columnsJson" JSONB,
    "dateRangeStart" TIMESTAMP(3),
    "dateRangeEnd" TIMESTAMP(3),
    "allowPii" BOOLEAN NOT NULL DEFAULT false,
    "allowDownload" BOOLEAN NOT NULL DEFAULT false,
    "allowCompanyBreakdown" BOOLEAN NOT NULL DEFAULT false,
    "generatedPayloadJson" JSONB,
    "exportPath" TEXT,
    "snapshotVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportShareSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "businessRole" "BusinessRoleEnum" NOT NULL DEFAULT 'STAFF',
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessProfile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "companyName" TEXT NOT NULL,
    "proprietorName" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "website" TEXT,
    "invoiceTheme" TEXT NOT NULL DEFAULT 'DESIGN_1',
    "invoicePrefix" TEXT DEFAULT 'INV',
    "invoiceTermsDays" INTEGER NOT NULL DEFAULT 7,
    "taxLabel" TEXT NOT NULL DEFAULT 'GST',
    "taxIdLabel" TEXT NOT NULL DEFAULT 'GSTIN',
    "routingLabel" TEXT NOT NULL DEFAULT 'IFSC Code',
    "panNumber" TEXT NOT NULL,
    "udyamNumber" TEXT,
    "gstin" TEXT,
    "gstStateCode" TEXT,
    "gstRegistrationType" TEXT NOT NULL DEFAULT 'REGULAR',
    "gstFilingFrequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "gstPrevFyTurnover" DECIMAL(65,30),
    "gstRegisteredFrom" TIMESTAMP(3),
    "gstRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "caEntityType" TEXT,
    "caTaxRegime" TEXT,
    "caPresumptive" TEXT,
    "caTaxAuditApplicable" BOOLEAN NOT NULL DEFAULT false,
    "caTan" TEXT,
    "caSetupAt" TIMESTAMP(3),
    "gstSupplyKind" TEXT NOT NULL DEFAULT 'SERVICES',
    "msmeInvestment" DECIMAL(65,30),
    "gstLutActive" BOOLEAN NOT NULL DEFAULT true,
    "bankName" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "ifscCode" TEXT NOT NULL,
    "primaryBankAccountId" TEXT,
    "logoUrl" TEXT,
    "signatureUrl" TEXT,
    "groqApiKey" TEXT,
    "defaultSacCode" TEXT DEFAULT '998313',
    "defaultTaxRate" DOUBLE PRECISION,
    "razorpayKeyId" TEXT,
    "razorpayKeySecret" TEXT,
    "stripePublishableKey" TEXT,
    "stripeSecretKey" TEXT,
    "defaultGateway" TEXT DEFAULT 'RAZORPAY',
    "shopSlug" TEXT,
    "shopTagline" TEXT,
    "shopEnabled" BOOLEAN NOT NULL DEFAULT false,
    "shopAccentColor" TEXT DEFAULT '#6366f1',
    "shopAnnouncement" TEXT,
    "shopAboutMd" TEXT,
    "shopFooterNote" TEXT,
    "shopSocialJson" TEXT,
    "shopFaqJson" TEXT,
    "shopShowAiAssist" BOOLEAN NOT NULL DEFAULT true,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "smtpUser" TEXT,
    "smtpPassword" TEXT,
    "smtpFromEmail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BusinessProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "taxId" TEXT,
    "gstStateCode" TEXT,
    "gstSupplyOverride" TEXT,
    "gstReverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "email" TEXT,
    "phone" TEXT,
    "logoUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "isExport" BOOLEAN NOT NULL DEFAULT true,
    "countryCode" TEXT,
    "website" TEXT,
    "industry" TEXT,
    "currency" TEXT,
    "paymentTermsDays" INTEGER,
    "creditLimit" DECIMAL(65,30),
    "tags" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "isWalkIn" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "ownerUserId" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientPaymentBehavior" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "avgDaysToPay" DOUBLE PRECISION,
    "medianDaysToPay" DOUBLE PRECISION,
    "onTimeRate" DOUBLE PRECISION,
    "lateRate" DOUBLE PRECISION,
    "partialPaymentRate" DOUBLE PRECISION,
    "sampleInvoicesCount" INTEGER NOT NULL DEFAULT 0,
    "lastComputedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPaymentBehavior_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "financialYear" TEXT NOT NULL,
    "billingMonth" TEXT NOT NULL DEFAULT 'Unknown',
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "paymentTermsDays" INTEGER,
    "expectedPaymentDate" TIMESTAMP(3),
    "collectionRiskScore" DOUBLE PRECISION,
    "lastReminderSentAt" TIMESTAMP(3),
    "followUpStatus" TEXT,
    "promiseDate" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "collectionReminders" INTEGER NOT NULL DEFAULT 0,
    "clientName" TEXT NOT NULL,
    "sacCode" TEXT,
    "serviceDescription" TEXT NOT NULL,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "grandTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxMode" TEXT NOT NULL DEFAULT 'exempt',
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "pdfPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
    "amountReceived" DECIMAL(65,30),
    "dateReceived" TIMESTAMP(3),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "baseGrandTotal" DECIMAL(65,30),
    "source" "InvoiceSource" NOT NULL DEFAULT 'MANUAL',
    "sentAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "stockCommittedAt" TIMESTAMP(3),
    "withholdingRatePercent" DECIMAL(65,30),
    "withholdingAmount" DECIMAL(65,30),
    "withholdingDeductedAt" TIMESTAMP(3),
    "withholdingDepositedAt" TIMESTAMP(3),
    "withholdingDepositDueAt" TIMESTAMP(3),
    "withholdingReminderSentAt" TIMESTAMP(3),
    "providerGateway" TEXT,
    "providerPaymentLinkId" TEXT,
    "clientId" TEXT,
    "sourceProposalId" TEXT,
    "retainerId" TEXT,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "gstPlaceOfSupply" TEXT,
    "gstReverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "gstSupplyOverride" TEXT,
    "gstEcoGstin" TEXT,
    "irn" TEXT,
    "irnAckNo" TEXT,
    "irnAckDate" TIMESTAMP(3),
    "ewayBillNo" TEXT,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoicePayment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'OTHER',
    "reference" TEXT,
    "notes" TEXT,
    "bankTransactionId" TEXT,
    "idempotencyKey" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reversedAt" TIMESTAMP(3),
    "reversedByUserId" TEXT,
    "reversalReason" TEXT,

    CONSTRAINT "InvoicePayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "creditNoteNumber" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdByUserId" TEXT,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceTaxPreference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "mode" "WorkspaceTaxMode" NOT NULL DEFAULT 'AUTO',
    "defaultCountryCode" TEXT,
    "provider" TEXT,
    "taxEstimateEnabled" BOOLEAN NOT NULL DEFAULT false,
    "taxEstimateRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "updatedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceTaxPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceTaxOverride" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeType" "TaxOverrideScopeType" NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceTaxOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxDecisionAuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "resolvedRatePercent" DOUBLE PRECISION NOT NULL,
    "resolutionSource" "TaxResolutionSource" NOT NULL,
    "basisJson" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxDecisionAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxableEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceEntityKind" TEXT NOT NULL,
    "sourceEntityId" TEXT NOT NULL,
    "taxableAmount" DECIMAL(65,30) NOT NULL,
    "originCountryCode" TEXT NOT NULL DEFAULT '',
    "destinationCountryCode" TEXT NOT NULL DEFAULT '',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "invoiceId" TEXT,
    "expenseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxableEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxDetermination" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxableEventId" TEXT NOT NULL,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "taxAmount" DECIMAL(65,30) NOT NULL,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "resolutionSource" TEXT NOT NULL,
    "resolutionReason" TEXT NOT NULL,
    "overrideId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxDetermination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxComponentLine" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxDeterminationId" TEXT NOT NULL,
    "componentKey" TEXT NOT NULL,
    "ratePercent" DOUBLE PRECISION NOT NULL,
    "taxableAmount" DECIMAL(65,30) NOT NULL,
    "taxAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxComponentLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxAuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "correlationId" TEXT,
    "actorUserId" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "payloadJson" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxOperationIdempotency" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "responseBody" JSONB,
    "status" TEXT NOT NULL DEFAULT 'CONSUMED',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxOperationIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReferenceEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "entryType" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "code" TEXT NOT NULL,
    "label" TEXT,
    "payloadJson" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "sourceDocumentRef" JSONB,
    "verificationLevel" TEXT,
    "reviewStatus" TEXT,
    "legalCertaintyRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxReferenceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxPeriod" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "periodCode" TEXT NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'QUARTER',
    "fiscalYear" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxForm" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "returnFamily" "TaxReturnFamily" NOT NULL,
    "formCode" TEXT NOT NULL,
    "version" TEXT NOT NULL DEFAULT '1.0',
    "title" TEXT,
    "schemaJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxForm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReturn" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxPeriodId" TEXT NOT NULL,
    "taxFormId" TEXT NOT NULL,
    "status" "TaxReturnStatus" NOT NULL DEFAULT 'DRAFT',
    "readinessScore" INTEGER NOT NULL DEFAULT 0,
    "lastReadinessCheckedAt" TIMESTAMP(3),
    "prefillCompletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReturnFieldValue" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxReturnId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "fieldLabel" TEXT,
    "valueJson" JSONB NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceRef" TEXT,
    "confidenceScore" DOUBLE PRECISION,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxReturnFieldValue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReadinessCheck" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "returnFamily" "TaxReturnFamily" NOT NULL,
    "checkCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "TaxReadinessSeverity" NOT NULL DEFAULT 'WARNING',
    "ruleConfigJson" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxReadinessCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReadinessBlocker" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxReturnId" TEXT NOT NULL,
    "checkId" TEXT,
    "blockerCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT,
    "severity" "TaxReadinessSeverity" NOT NULL DEFAULT 'WARNING',
    "status" "TaxReadinessBlockerStatus" NOT NULL DEFAULT 'OPEN',
    "factsJson" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxReadinessBlocker_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceIdempotency" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "invoiceId" TEXT,
    "responseBody" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceIdempotency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceGenerationDraft" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "totalsJson" JSONB NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "razorpayLinkId" TEXT,
    "razorpayLinkUrl" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "finalizedInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvoiceGenerationDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "receiptUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withholdingRatePercent" DECIMAL(65,30),
    "withholdingAmount" DECIMAL(65,30),
    "withholdingDeductedAt" TIMESTAMP(3),
    "withholdingDepositedAt" TIMESTAMP(3),
    "withholdingDepositDueAt" TIMESTAMP(3),
    "withholdingReminderSentAt" TIMESTAMP(3),
    "vendorGstin" TEXT,
    "vendorInvoiceNo" TEXT,
    "vendorStateCode" TEXT,
    "hsnCode" TEXT,
    "gstRate" DOUBLE PRECISION,
    "cgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igstAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cessAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "itcStatus" TEXT NOT NULL DEFAULT 'NONE',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "paidAt" TIMESTAMP(3),
    "itcHeld" BOOLEAN NOT NULL DEFAULT false,
    "itcClaimMonth" TEXT,
    "vendorUdyam" TEXT,
    "vendorMsme" TEXT,
    "vendorAgreedDays" INTEGER,
    "vendorId" TEXT,
    "dueDate" TIMESTAMP(3),
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "purchaseOrderId" TEXT,
    "recurringId" TEXT,
    "approvalStatus" TEXT NOT NULL DEFAULT 'APPROVED',
    "submittedByUserId" TEXT,
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "clientId" TEXT,
    "markupPercent" DOUBLE PRECISION,
    "billedInvoiceId" TEXT,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vendor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "gstin" TEXT,
    "stateCode" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "msmeClass" TEXT,
    "udyam" TEXT,
    "paymentTermsDays" INTEGER,
    "defaultCategory" TEXT,
    "tdsSection" TEXT,
    "tdsRatePercent" DOUBLE PRECISION,
    "notes" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vendor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringExpense" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "vendorId" TEXT,
    "vendor" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "nextRunDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "autoPost" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "paymentStatus" TEXT NOT NULL DEFAULT 'PAID',
    "dueInDays" INTEGER,
    "itcStatus" TEXT NOT NULL DEFAULT 'NONE',
    "gstRate" DOUBLE PRECISION,
    "lastRunAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringExpense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseBudget" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "monthlyAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseBudget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseSettings" (
    "workspaceId" TEXT NOT NULL,
    "approvalRequired" BOOLEAN NOT NULL DEFAULT false,
    "approvalThreshold" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "inboxEnabled" BOOLEAN NOT NULL DEFAULT false,
    "inboxToken" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExpenseSettings_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "WithholdingEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "invoiceId" TEXT,
    "expenseId" TEXT,
    "counterpartyName" TEXT,
    "sectionCode" TEXT,
    "grossAmount" DECIMAL(65,30) NOT NULL,
    "withheldAmount" DECIMAL(65,30) NOT NULL,
    "withholdingRatePercent" DECIMAL(65,30),
    "deductedAt" TIMESTAMP(3) NOT NULL,
    "depositedAt" TIMESTAMP(3),
    "depositDueAt" TIMESTAMP(3),
    "reminderSentAt" TIMESTAMP(3),
    "returnPeriodKey" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WithholdingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCreditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "documentId" TEXT,
    "creditType" TEXT NOT NULL DEFAULT 'WITHHOLDING',
    "counterpartyName" TEXT,
    "certificateNumber" TEXT,
    "grossAmount" DECIMAL(65,30),
    "creditedAmount" DECIMAL(65,30) NOT NULL,
    "withheldAmount" DECIMAL(65,30),
    "certificateIssuedAt" TIMESTAMP(3),
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "returnPeriodKey" TEXT,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxCreditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxCreditLedgerEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxCreditEventId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "returnPeriodKey" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxCreditLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxReturnPeriod" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "filedAt" TIMESTAMP(3),
    "expectedWithheldAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reconciledWithheldAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxReturnPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransaction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT,
    "importBatchId" TEXT,
    "providerTransactionId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "referenceId" TEXT,
    "transactionType" TEXT,
    "isInternalTransfer" BOOLEAN NOT NULL DEFAULT false,
    "reconciliationConfidence" DOUBLE PRECISION,
    "category" TEXT,
    "balanceAfter" DECIMAL(65,30),
    "originalCurrency" TEXT,
    "amountOriginalCurrency" DECIMAL(65,30),
    "parseFlagsJson" JSONB,
    "isReconciled" BOOLEAN NOT NULL DEFAULT false,
    "matchedInvoiceId" TEXT,
    "matchedExpenseId" TEXT,
    "sourceImportHash" TEXT,
    "ignoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "accountHolderName" TEXT,
    "maskedAccountNumber" TEXT,
    "routingCode" TEXT,
    "sourceType" TEXT DEFAULT 'MANUAL',
    "isPrimaryRemittance" BOOLEAN NOT NULL DEFAULT false,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "openingBalance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "openingBalanceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "currentBalance" DECIMAL(65,30),
    "plaidItemId" TEXT,
    "plaidAccountId" TEXT,
    "plaidAccessTokenEncrypted" TEXT,
    "plaidTransactionsCursor" TEXT,
    "lastPlaidSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankImportBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "parseVersion" TEXT NOT NULL DEFAULT '1',
    "parseMeta" JSONB,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawFileData" BYTEA,

    CONSTRAINT "BankImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseReconciliationCategory" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseReconciliationCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliationRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "pattern" TEXT NOT NULL,
    "matchTxnType" TEXT NOT NULL DEFAULT 'ANY',
    "setCategory" TEXT,
    "setVendor" TEXT,
    "setInternalTransfer" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReconciliationRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceReconciliationSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "autoMatchMinScore" DOUBLE PRECISION NOT NULL DEFAULT 95,
    "autoMatchSuggestionMin" DOUBLE PRECISION NOT NULL DEFAULT 70,
    "importRawRetentionDays" INTEGER NOT NULL DEFAULT 0,
    "storeRawImportBytes" BOOLEAN NOT NULL DEFAULT false,
    "bankFeedProvider" TEXT NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceReconciliationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankTransactionInvoiceSplit" (
    "id" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankTransactionInvoiceSplit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashForecastSnapshot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "horizonType" "CashForecastHorizonType" NOT NULL,
    "scenarioTag" "CashForecastScenarioTag" NOT NULL DEFAULT 'BASE',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "openingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalProjectedInflows" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalProjectedOutflows" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "confidenceScore" DOUBLE PRECISION,
    "assumptionsJson" JSONB,
    "generatedBy" "CashForecastGeneratedBy" NOT NULL DEFAULT 'SYSTEM',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashForecastSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashForecastPeriod" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "bucketLabel" TEXT NOT NULL,
    "openingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualInflows" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "projectedInflows" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "actualOutflows" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "projectedOutflows" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "closingCash" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "riskLevel" "CashForecastRiskLevel" NOT NULL DEFAULT 'LOW',
    "varianceFromPriorForecast" DECIMAL(65,30),
    "notesJson" JSONB,

    CONSTRAINT "CashForecastPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashForecastLineItem" (
    "id" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "direction" "CashForecastDirection" NOT NULL,
    "sourceType" "CashForecastSourceType" NOT NULL,
    "sourceId" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "expectedDate" TIMESTAMP(3) NOT NULL,
    "confidence" DOUBLE PRECISION,
    "scenarioTag" "CashForecastScenarioTag" NOT NULL DEFAULT 'BASE',
    "classification" "CashForecastClassification" NOT NULL,
    "title" TEXT NOT NULL,
    "metadataJson" JSONB,
    "explanation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashForecastLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashForecastAssumption" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "effectiveFrom" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashForecastAssumption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashForecastManualAdjustment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "direction" "CashForecastDirection" NOT NULL,
    "reason" TEXT NOT NULL,
    "category" TEXT,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashForecastManualAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashForecastLineItemPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "horizonType" "CashForecastHorizonType" NOT NULL,
    "scenarioTag" "CashForecastScenarioTag" NOT NULL DEFAULT 'BASE',
    "planKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashForecastLineItemPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashForecastAlertPreference" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "criticalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "warningEnabled" BOOLEAN NOT NULL DEFAULT true,
    "infoEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastAlertAt" TIMESTAMP(3),
    "lastAlertKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashForecastAlertPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Investment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "category" TEXT NOT NULL,
    "assetName" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Investment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NICCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "isCustom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "NICCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SACCode" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "igstRate" DOUBLE PRECISION NOT NULL DEFAULT 18.0,
    "countryCode" TEXT NOT NULL DEFAULT 'IN',
    "isCustom" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SACCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "longDescription" TEXT,
    "imageUrl" TEXT,
    "nicCodeId" TEXT,
    "sacCodeId" TEXT,

    CONSTRAINT "ServiceTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Proposal" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "proposalNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "dateCreated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "publicToken" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "clientIp" TEXT,
    "acceptedByName" TEXT,
    "sentAt" TIMESTAMP(3),
    "sentByUserId" TEXT,
    "firstViewedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "declinedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "firstConvertedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "richSections" JSONB,
    "clientSignatureBase64" TEXT,
    "subtotal" DECIMAL(65,30) NOT NULL,
    "estimatedTax" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalAmount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "taxRatePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "archivedAt" TIMESTAMP(3),
    "richMedia" JSONB,

    CONSTRAINT "Proposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProposalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProposalItem" (
    "id" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "serviceTemplateId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "total" DECIMAL(65,30) NOT NULL,
    "isOptional" BOOLEAN NOT NULL DEFAULT false,
    "isSelected" BOOLEAN NOT NULL DEFAULT true,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProposalItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Retainer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "nextBillingDate" TIMESTAMP(3) NOT NULL,
    "autoAppendMonth" BOOLEAN NOT NULL DEFAULT true,
    "sourceProposalId" TEXT,
    "amount" DECIMAL(65,30),
    "sacCode" TEXT,
    "serviceName" TEXT,
    "name" TEXT,
    "notes" TEXT,
    "exchangeRate" DECIMAL(65,30) NOT NULL DEFAULT 1,
    "paymentTermsDays" INTEGER NOT NULL DEFAULT 7,
    "emailInvoice" BOOLEAN NOT NULL DEFAULT true,
    "endDate" TIMESTAMP(3),
    "maxCycles" INTEGER,
    "cyclesBilled" INTEGER NOT NULL DEFAULT 0,
    "lastBilledAt" TIMESTAMP(3),
    "lastError" TEXT,
    "lastErrorAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "remindersEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoRenew" BOOLEAN NOT NULL DEFAULT false,
    "renewCycles" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Retainer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainerPriceChange" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "retainerId" TEXT NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetainerPriceChange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainerEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "retainerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT,
    "metadata" TEXT,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetainerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetainerItem" (
    "id" TEXT NOT NULL,
    "retainerId" TEXT NOT NULL,
    "serviceTemplateId" TEXT,
    "productId" TEXT,
    "title" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "taxRate" DOUBLE PRECISION DEFAULT 0,
    "sacCode" TEXT,

    CONSTRAINT "RetainerItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeteredUsage" (
    "id" TEXT NOT NULL,
    "retainerId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(65,30) NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "taxRate" DOUBLE PRECISION,
    "billedInInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MeteredUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Task" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceTaxRegistration" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxType" TEXT NOT NULL,
    "jurisdictionCode" TEXT NOT NULL,
    "registrationNumber" TEXT NOT NULL,
    "frequency" "FilingFrequency" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceTaxRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FilingCalendarRule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxRegistrationId" TEXT NOT NULL,
    "dueDayOfMonth" INTEGER NOT NULL,
    "dueMonthOfYear" INTEGER,
    "lookaheadPeriods" INTEGER NOT NULL DEFAULT 12,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FilingCalendarRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxObligationPeriod" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "TaxObligationStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxObligationPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxObligation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxRegistrationId" TEXT NOT NULL,
    "filingRuleId" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "TaxObligationStatus" NOT NULL DEFAULT 'OPEN',
    "readyAt" TIMESTAMP(3),
    "filedAt" TIMESTAMP(3),
    "periodKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxObligation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceTask" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "obligationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ComplianceTaskStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRateOverride" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'WORKSPACE',
    "scopeRef" TEXT,
    "rate" DOUBLE PRECISION NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "deactivatedAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRateOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRateOverrideAuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "taxRateOverrideId" TEXT,
    "action" TEXT NOT NULL,
    "decisionSource" TEXT NOT NULL DEFAULT 'OVERRIDE',
    "scopeType" TEXT NOT NULL,
    "scopeRef" TEXT,
    "rate" DOUBLE PRECISION,
    "effectiveFrom" TIMESTAMP(3),
    "effectiveTo" TIMESTAMP(3),
    "reason" TEXT,
    "previousValues" JSONB,
    "newValues" JSONB,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "prevHash" TEXT,
    "entryHash" TEXT,
    "canonicalPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxRateOverrideAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FileImportAuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSizeBytes" INTEGER,
    "flow" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileImportAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InAppNotification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "actionUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "workspaceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InAppNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'pcs',
    "hsnCode" TEXT,
    "gstRate" DOUBLE PRECISION,
    "baselinePrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "safetyStock" INTEGER NOT NULL DEFAULT 5,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "barcode" TEXT,
    "imageUrl" TEXT,
    "location" TEXT,
    "showInShop" BOOLEAN NOT NULL DEFAULT false,
    "shopSortOrder" INTEGER,
    "shopDescription" TEXT,
    "shopImageUrl" TEXT,
    "archivedAt" TIMESTAMP(3),
    "reorderQuantity" INTEGER,
    "preferredVendorId" TEXT,
    "leadTimeDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvoiceItem" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sacCode" TEXT,
    "totalAmount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "InvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "referenceId" TEXT,
    "unitCost" DECIMAL(65,30),
    "balanceAfter" INTEGER,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "supplierGstin" TEXT,
    "supplierStateCode" TEXT,
    "supplierInvoiceNo" TEXT,
    "vendorId" TEXT,
    "notes" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdByUserId" TEXT,
    "expectedDate" TIMESTAMP(3),
    "paymentTermsDays" INTEGER,
    "expectedPaymentDate" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "committedCashImpact" DECIMAL(65,30),
    "totalAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderItem" (
    "id" TEXT NOT NULL,
    "poId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "expectedTotal" DECIMAL(65,30) NOT NULL,
    "receivedQuantity" INTEGER NOT NULL DEFAULT 0,
    "hsnCode" TEXT,
    "gstRate" DOUBLE PRECISION,

    CONSTRAINT "PurchaseOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "buyerName" TEXT NOT NULL,
    "buyerEmail" TEXT NOT NULL,
    "buyerPhone" TEXT,
    "buyerNote" TEXT,
    "buyerStateCode" TEXT,
    "buyerGstin" TEXT,
    "subtotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "amount" DECIMAL(65,30) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "gateway" TEXT,
    "razorpayOrderId" TEXT,
    "razorpayPaymentId" TEXT,
    "razorpaySignature" TEXT,
    "stripePaymentIntentId" TEXT,
    "stripeSessionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "linkedInvoiceId" TEXT,
    "sourceProposalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopOrderItem" (
    "id" TEXT NOT NULL,
    "shopOrderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" DECIMAL(65,30) NOT NULL,
    "taxRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineTotal" DECIMAL(65,30) NOT NULL,
    "lineTax" DECIMAL(65,30) NOT NULL DEFAULT 0,

    CONSTRAINT "ShopOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "userId" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "ProposalConversion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "conversionType" "ProposalConversionType" NOT NULL,
    "invoiceId" TEXT,
    "retainerId" TEXT,
    "shopOrderId" TEXT,
    "convertedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedByUserId" TEXT,

    CONSTRAINT "ProposalConversion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingMilestone" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "proposalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "amount" DECIMAL(65,30) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "invoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HelpFeedback" (
    "id" TEXT NOT NULL,
    "docSlug" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "comment" TEXT,
    "currentRoute" TEXT,
    "userAgent" TEXT,
    "workspaceId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HelpFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RbacAuditLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "actorEmail" TEXT,
    "targetUserId" TEXT,
    "targetEmail" TEXT,
    "previousRole" TEXT,
    "newRole" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RbacAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailBillingServer" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'MIAB',
    "accessMode" TEXT NOT NULL DEFAULT 'READ_ONLY_ADAPTER',
    "baseUrl" TEXT NOT NULL,
    "encryptedToken" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSyncAt" TIMESTAMP(3),
    "lastSyncStatus" TEXT,
    "lastSyncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailBillingServer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailBillingDomain" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "clientId" TEXT,
    "retainerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "mailboxCount" INTEGER NOT NULL DEFAULT 0,
    "aliasCount" INTEGER NOT NULL DEFAULT 0,
    "billingMode" TEXT NOT NULL DEFAULT 'DOMAIN_PLAN',
    "billingNotes" TEXT,
    "discoveredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailBillingDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailBillingMailbox" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "localPart" TEXT NOT NULL,
    "quotaMb" INTEGER,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailBillingMailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailBillingSyncRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "domainsSeen" INTEGER NOT NULL DEFAULT 0,
    "mailboxesSeen" INTEGER NOT NULL DEFAULT 0,
    "domainsAdded" INTEGER NOT NULL DEFAULT 0,
    "domainsRemoved" INTEGER NOT NULL DEFAULT 0,
    "mailboxesAdded" INTEGER NOT NULL DEFAULT 0,
    "mailboxesRemoved" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "reviewItemsCreated" INTEGER NOT NULL DEFAULT 0,
    "summaryJson" JSONB,

    CONSTRAINT "MailBillingSyncRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailBillingPlan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billingMode" TEXT NOT NULL DEFAULT 'FIXED',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "basePrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "includedMailboxes" INTEGER NOT NULL DEFAULT 0,
    "extraMailboxPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailBillingPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailBillingSubscription" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "planId" TEXT,
    "retainerId" TEXT,
    "billingStatus" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "billingModeSnapshot" TEXT NOT NULL DEFAULT 'FIXED',
    "currencySnapshot" TEXT NOT NULL DEFAULT 'INR',
    "basePriceSnapshot" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "includedMailboxesSnapshot" INTEGER NOT NULL DEFAULT 0,
    "extraMailboxPriceSnapshot" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "billableMailboxCount" INTEGER NOT NULL DEFAULT 0,
    "lastSyncedMailboxCount" INTEGER NOT NULL DEFAULT 0,
    "pendingMailboxCount" INTEGER,
    "autoUpdateQuantity" BOOLEAN NOT NULL DEFAULT false,
    "nextReviewAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailBillingSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailBillingReviewItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "domainId" TEXT,
    "subscriptionId" TEXT,
    "serverId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suggestedAction" TEXT,
    "oldValueJson" JSONB,
    "newValueJson" JSONB,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByUserId" TEXT,

    CONSTRAINT "MailBillingReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MailBillingSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "defaultBillingMode" TEXT NOT NULL DEFAULT 'FIXED',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'INR',
    "defaultPlanId" TEXT,
    "autoCreateReviewItems" BOOLEAN NOT NULL DEFAULT true,
    "autoUpdateRetainerQuantities" BOOLEAN NOT NULL DEFAULT false,
    "syncFrequencyPreference" TEXT NOT NULL DEFAULT 'MANUAL',
    "alertRecipientsJson" JSONB,
    "treatRemovedDomainsAsReviewRequired" BOOLEAN NOT NULL DEFAULT true,
    "ignoreAdminMailboxesFromBilling" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailBillingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceModule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "moduleKey" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "configJson" JSONB,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "disabledAt" TIMESTAMP(3),
    "enabledByUserId" TEXT,
    "disabledByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceModule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sourceMode" TEXT NOT NULL,
    "executionMode" TEXT,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'PREVIEW_READY',
    "parsedCount" INTEGER NOT NULL DEFAULT 0,
    "importedCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "lastProcessedRow" INTEGER NOT NULL DEFAULT 0,
    "inputJson" JSONB,
    "previewJson" JSONB,
    "resultJson" JSONB,
    "errorReportJson" JSONB,
    "sourceDigest" TEXT,
    "idempotencyKey" TEXT,
    "executionStartedAt" TIMESTAMP(3),
    "executionFinishedAt" TIMESTAMP(3),
    "initiatedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'INBOX',
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "archivedAt" TIMESTAMP(3),
    "archivedByUserId" TEXT,
    "source" TEXT,
    "uploadedByUserId" TEXT,
    "aiSummary" TEXT,
    "aiMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFile" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "mimeType" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "sha256" TEXT,
    "byteSize" INTEGER NOT NULL,
    "pageCount" INTEGER,
    "imageWidth" INTEGER,
    "imageHeight" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentOcrJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentFileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'GENERIC',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "provider" TEXT NOT NULL,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentOcrJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentExtractedField" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentFileId" TEXT NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "valueText" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueDate" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION,
    "source" TEXT NOT NULL DEFAULT 'OCR',
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentExtractedField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'ATTACHMENT',
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxDocumentLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityKey" TEXT NOT NULL,
    "relation" TEXT NOT NULL DEFAULT 'EVIDENCE',
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxDocumentLink_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxImportBatch" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "templateType" TEXT NOT NULL,
    "sourceName" TEXT,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "submittedByUserId" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxImportBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxImportRow" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "code" TEXT,
    "message" TEXT,
    "fieldName" TEXT,
    "rawData" JSONB,
    "normalizedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TaxImportRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceDocumentStorage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "bytesUsedTotal" BIGINT NOT NULL DEFAULT 0,
    "bytesUsedActive" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceDocumentStorage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentAuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "documentId" TEXT,
    "documentFileId" TEXT,
    "eventType" TEXT NOT NULL,
    "actorUserId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Department" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "headId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Department_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Designation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "level" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Designation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "avatarUrl" TEXT,
    "employeeCode" TEXT,
    "status" "EmploymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinDate" TIMESTAMP(3),
    "exitDate" TIMESTAMP(3),
    "location" TEXT,
    "departmentId" TEXT,
    "designationId" TEXT,
    "managerId" TEXT,
    "emergencyName" TEXT,
    "emergencyPhone" TEXT,
    "emergencyRelation" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'PRESENT',
    "checkInAt" TIMESTAMP(3),
    "checkOutAt" TIMESTAMP(3),
    "notes" TEXT,
    "isManagerEntered" BOOLEAN NOT NULL DEFAULT false,
    "managedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT 'indigo',
    "defaultDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPaid" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "days" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "reason" TEXT,
    "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING',
    "approvedByUserId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "taskId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "entitled" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "used" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "pending" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPeriod" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "PayrollPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "lockedAt" TIMESTAMP(3),
    "lockedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT',
    "totalEarnings" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalDeductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalEmployerCosts" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "totalNetPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "generatedByUserId" TEXT,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "approvedAt" TIMESTAMP(3),
    "approvedByUserId" TEXT,
    "submittedAt" TIMESTAMP(3),
    "disbursedAt" TIMESTAMP(3),
    "disbursedByUserId" TEXT,
    "disbursementTxId" TEXT,
    "notes" TEXT,
    "preflightJson" JSONB,
    "summaryJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEmployeeSnapshot" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "employeeCode" TEXT,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "departmentName" TEXT,
    "designation" TEXT,
    "location" TEXT,
    "joinDate" TIMESTAMP(3),
    "baseSalary" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "hourlyRate" DECIMAL(65,30),
    "paymentFrequency" TEXT,
    "compensationMeta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollEmployeeSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollLineItem" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "employeeSnapshotId" TEXT NOT NULL,
    "earnings" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "employerCosts" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netPay" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "breakdownJson" JSONB,
    "calculationLog" JSONB,
    "statutoryJson" JSONB,
    "payoutStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "paidAt" TIMESTAMP(3),
    "payoutRef" TEXT,
    "payslipSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollLineItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollCostAllocation" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "departmentCode" TEXT,
    "projectCode" TEXT,
    "costCenterCode" TEXT,
    "allocationPercent" DECIMAL(65,30) NOT NULL DEFAULT 100,
    "allocatedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollCostAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPosting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "postingStatus" "PayrollPostingStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "journalReference" TEXT,
    "accountingTransactionId" TEXT,
    "accountingTransactionRef" TEXT,
    "postedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceHoliday" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "year" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkforceHoliday_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkSchedule" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "workingDays" TEXT NOT NULL DEFAULT '["MON","TUE","WED","THU","FRI"]',
    "workStartTime" TEXT NOT NULL DEFAULT '09:00',
    "workEndTime" TEXT NOT NULL DEFAULT '18:00',
    "timeZone" TEXT NOT NULL DEFAULT 'Asia/Kolkata',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSettings" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "inputMode" "PayrollInputMode" NOT NULL DEFAULT 'STANDALONE',
    "statutoryRulesJson" JSONB,
    "paymentScheduleJson" JSONB,
    "defaultCostAllocationJson" JSONB,
    "standaloneConfigJson" JSONB,
    "workforceLinkedConfigJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollPayComponent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" "PayComponentCategory" NOT NULL,
    "isTaxable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "metadataJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollPayComponent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeCompensation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "annualCtc" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "componentsJson" JSONB NOT NULL,
    "taxRegime" TEXT NOT NULL DEFAULT 'new',
    "oldRegimeDeductions" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "pfEnabled" BOOLEAN NOT NULL DEFAULT true,
    "pfOnActualBasic" BOOLEAN NOT NULL DEFAULT false,
    "esiEnabled" BOOLEAN NOT NULL DEFAULT false,
    "ptState" TEXT,
    "panEnc" TEXT,
    "panLast4" TEXT,
    "uan" TEXT,
    "esiNumber" TEXT,
    "accountHolder" TEXT,
    "bankName" TEXT,
    "ifsc" TEXT,
    "accountEnc" TEXT,
    "accountLast4" TEXT,
    "paymentMode" TEXT NOT NULL DEFAULT 'BANK_TRANSFER',
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeCompensation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollAdjustment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayrollAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmployeeLoan" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "principal" DECIMAL(65,30) NOT NULL,
    "emi" DECIMAL(65,30) NOT NULL,
    "outstanding" DECIMAL(65,30) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "startPeriod" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollRemittance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodId" TEXT NOT NULL,
    "runId" TEXT,
    "kind" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "paidAt" TIMESTAMP(3),
    "paidByUserId" TEXT,
    "reference" TEXT,
    "accountingTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollRemittance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiToolConfirmationNonce" (
    "nonce" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiToolConfirmationNonce_pkey" PRIMARY KEY ("nonce")
);

-- CreateTable
CREATE TABLE "SystemErrorLog" (
    "id" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stackTrace" TEXT,
    "sourceFile" TEXT,
    "route" TEXT,
    "method" TEXT,
    "userId" TEXT,
    "workspaceId" TEXT,
    "status" "ErrorStatus" NOT NULL DEFAULT 'UNRESOLVED',
    "environment" TEXT NOT NULL DEFAULT 'development',
    "metadata" JSONB,
    "aiDiagnosis" TEXT,
    "aiSuggestedFix" TEXT,
    "aiConfidence" INTEGER,
    "aiUserFriendlyMessage" TEXT,
    "analyzedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemErrorLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemRemediation" (
    "id" TEXT NOT NULL,
    "errorLogId" TEXT NOT NULL,
    "actionType" "RemediationType" NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" "RemediationStatus" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "executedAt" TIMESTAMP(3),
    "executedBy" TEXT,
    "executionLog" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemRemediation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstReturn" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "returnType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "extendedDueDate" TIMESTAMP(3),
    "filedAt" TIMESTAMP(3),
    "arn" TEXT,
    "filedByUserId" TEXT,
    "isNil" BOOLEAN NOT NULL DEFAULT false,
    "lateFeePaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "interestPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "inputsJson" JSONB,
    "snapshotJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GstReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstAdjustment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "igst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cess" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gstr2bEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "supplierGstin" TEXT NOT NULL,
    "supplierName" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3),
    "taxableValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cess" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "itcAvailable" BOOLEAN NOT NULL DEFAULT true,
    "reverseCharge" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gstr2bEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstDebitNote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "noteNumber" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "recipientName" TEXT NOT NULL,
    "recipientGstin" TEXT,
    "pos" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "taxable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cess" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstDebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstAmendment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "originalPeriodKey" TEXT NOT NULL,
    "originalNumber" TEXT NOT NULL,
    "originalDate" TIMESTAMP(3) NOT NULL,
    "recipientName" TEXT,
    "recipientGstin" TEXT,
    "pos" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "originalTaxable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "originalIgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "originalCgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "originalSgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "revisedTaxable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "revisedIgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "revisedCgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "revisedSgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstAmendment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstAdvance" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "party" TEXT NOT NULL,
    "recipientGstin" TEXT,
    "pos" TEXT NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "taxable" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "igst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "cgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "sgst" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "adjustedAt" TIMESTAMP(3),
    "adjustedInvoice" TEXT,
    "notes" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstAdvance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstReturnComment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "returnType" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstReturnComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GstReminderLog" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GstReminderLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaComplianceItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "ownerUserId" TEXT,
    "filedAt" TIMESTAMP(3),
    "reference" TEXT,
    "notes" TEXT,
    "dueOverride" TIMESTAMP(3),
    "signedOffByUserId" TEXT,
    "signedOffByName" TEXT,
    "signedOffAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaComplianceItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "fy" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "itemKind" TEXT,
    "periodKey" TEXT,
    "linkType" TEXT,
    "linkId" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdByUserId" TEXT NOT NULL,
    "createdByName" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaRequestMessage" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "authorName" TEXT NOT NULL,
    "authorRole" TEXT,
    "body" TEXT NOT NULL,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CaRequestMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientContact" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "receivesInvoices" BOOLEAN NOT NULL DEFAULT true,
    "receivesReminders" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientNote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "authorUserId" TEXT,
    "authorName" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportView" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "name" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "paramsJson" JSONB,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "visibility" TEXT NOT NULL DEFAULT 'WORKSPACE',
    "pinnedToDashboard" BOOLEAN NOT NULL DEFAULT false,
    "scheduleFrequency" TEXT,
    "scheduleRecipients" TEXT,
    "scheduleFormat" TEXT NOT NULL DEFAULT 'CSV',
    "scheduleEnabled" BOOLEAN NOT NULL DEFAULT true,
    "scheduleHour" INTEGER NOT NULL DEFAULT 7,
    "scheduleTz" TEXT NOT NULL DEFAULT 'UTC',
    "scheduleNextAt" TIMESTAMP(3),
    "scheduleLastAt" TIMESTAMP(3),
    "scheduleLastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReportView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Distributor_email_key" ON "Distributor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "DistributorCoupon_code_key" ON "DistributorCoupon"("code");

-- CreateIndex
CREATE INDEX "DistributorCoupon_distributorId_isActive_idx" ON "DistributorCoupon"("distributorId", "isActive");

-- CreateIndex
CREATE INDEX "DistributorPayout_distributorId_status_createdAt_idx" ON "DistributorPayout"("distributorId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "DistributorAuditLog_distributorId_createdAt_idx" ON "DistributorAuditLog"("distributorId", "createdAt");

-- CreateIndex
CREATE INDEX "DistributorAuditLog_createdAt_idx" ON "DistributorAuditLog"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistributorAttribution_workspaceId_key" ON "DistributorAttribution"("workspaceId");

-- CreateIndex
CREATE INDEX "DistributorAttribution_distributorId_appliedAt_idx" ON "DistributorAttribution"("distributorId", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DistributorCommission_billingTransactionId_key" ON "DistributorCommission"("billingTransactionId");

-- CreateIndex
CREATE INDEX "DistributorCommission_distributorId_createdAt_idx" ON "DistributorCommission"("distributorId", "createdAt");

-- CreateIndex
CREATE INDEX "DistributorCommission_workspaceId_createdAt_idx" ON "DistributorCommission"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "DistributorCommission_status_distributorId_idx" ON "DistributorCommission"("status", "distributorId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_distributorPartnerId_idx" ON "User"("distributorPartnerId");

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnCredential_credentialID_key" ON "WebAuthnCredential"("credentialID");

-- CreateIndex
CREATE INDEX "WebAuthnCredential_userId_idx" ON "WebAuthnCredential"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnChallenge_challenge_key" ON "WebAuthnChallenge"("challenge");

-- CreateIndex
CREATE UNIQUE INDEX "WebAuthnChallenge_tokenHash_key" ON "WebAuthnChallenge"("tokenHash");

-- CreateIndex
CREATE INDEX "WebAuthnChallenge_userId_type_idx" ON "WebAuthnChallenge"("userId", "type");

-- CreateIndex
CREATE INDEX "WebAuthnChallenge_expiresAt_idx" ON "WebAuthnChallenge"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserOnboarding_userId_key" ON "UserOnboarding"("userId");

-- CreateIndex
CREATE INDEX "UserOnboarding_isFirstLogin_idx" ON "UserOnboarding"("isFirstLogin");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordResetToken_userId_idx" ON "PasswordResetToken"("userId");

-- CreateIndex
CREATE INDEX "PasswordResetToken_expiresAt_idx" ON "PasswordResetToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- CreateIndex
CREATE INDEX "Workspace_isDemo_idx" ON "Workspace"("isDemo");

-- CreateIndex
CREATE INDEX "Workspace_demoExpiresAt_idx" ON "Workspace"("demoExpiresAt");

-- CreateIndex
CREATE INDEX "Workspace_demoTemplateKey_idx" ON "Workspace"("demoTemplateKey");

-- CreateIndex
CREATE INDEX "CompanyGroup_billingWorkspaceId_idx" ON "CompanyGroup"("billingWorkspaceId");

-- CreateIndex
CREATE INDEX "CompanyGroupWorkspace_workspaceId_isActive_idx" ON "CompanyGroupWorkspace"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "CompanyGroupWorkspace_companyGroupId_isPrimary_idx" ON "CompanyGroupWorkspace"("companyGroupId", "isPrimary");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGroupWorkspace_companyGroupId_workspaceId_key" ON "CompanyGroupWorkspace"("companyGroupId", "workspaceId");

-- CreateIndex
CREATE INDEX "CompanyGroupMember_userId_idx" ON "CompanyGroupMember"("userId");

-- CreateIndex
CREATE INDEX "CompanyGroupMember_companyGroupId_isActive_idx" ON "CompanyGroupMember"("companyGroupId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGroupMember_companyGroupId_userId_key" ON "CompanyGroupMember"("companyGroupId", "userId");

-- CreateIndex
CREATE INDEX "CompanyGroupMemberWorkspaceAccess_workspaceId_isActive_idx" ON "CompanyGroupMemberWorkspaceAccess"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGroupMemberWorkspaceAccess_companyGroupMemberId_work_key" ON "CompanyGroupMemberWorkspaceAccess"("companyGroupMemberId", "workspaceId");

-- CreateIndex
CREATE INDEX "CompanyGroupModule_companyGroupId_isEnabled_idx" ON "CompanyGroupModule"("companyGroupId", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyGroupModule_companyGroupId_moduleKey_key" ON "CompanyGroupModule"("companyGroupId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerAccount_email_key" ON "ResellerAccount"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerCoupon_code_key" ON "ResellerCoupon"("code");

-- CreateIndex
CREATE INDEX "ResellerCoupon_resellerId_isActive_idx" ON "ResellerCoupon"("resellerId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ResellerLead_workspaceId_key" ON "ResellerLead"("workspaceId");

-- CreateIndex
CREATE INDEX "ResellerLead_resellerId_stage_createdAt_idx" ON "ResellerLead"("resellerId", "stage", "createdAt");

-- CreateIndex
CREATE INDEX "ResellerPublicQuery_status_createdAt_idx" ON "ResellerPublicQuery"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ResellerPublicQuery_email_createdAt_idx" ON "ResellerPublicQuery"("email", "createdAt");

-- CreateIndex
CREATE INDEX "ResellerCommission_resellerId_status_createdAt_idx" ON "ResellerCommission"("resellerId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "ResellerPayout_resellerId_status_createdAt_idx" ON "ResellerPayout"("resellerId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReferralProfile_userId_key" ON "CustomerReferralProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReferralProfile_code_key" ON "CustomerReferralProfile"("code");

-- CreateIndex
CREATE INDEX "CustomerReferralProfile_workspaceId_isActive_idx" ON "CustomerReferralProfile"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerReferralRedemption_referredWorkspaceId_key" ON "CustomerReferralRedemption"("referredWorkspaceId");

-- CreateIndex
CREATE INDEX "CustomerReferralRedemption_profileId_createdAt_idx" ON "CustomerReferralRedemption"("profileId", "createdAt");

-- CreateIndex
CREATE INDEX "CustomerReferralReward_referrerWorkspaceId_rewardStatus_cre_idx" ON "CustomerReferralReward"("referrerWorkspaceId", "rewardStatus", "createdAt");

-- CreateIndex
CREATE INDEX "DemoProvisionAttempt_createdAt_idx" ON "DemoProvisionAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "DemoProvisionAttempt_ip_createdAt_idx" ON "DemoProvisionAttempt"("ip", "createdAt");

-- CreateIndex
CREATE INDEX "DemoProvisionAttempt_fingerprint_createdAt_idx" ON "DemoProvisionAttempt"("fingerprint", "createdAt");

-- CreateIndex
CREATE INDEX "DemoProvisionAttempt_templateKey_createdAt_idx" ON "DemoProvisionAttempt"("templateKey", "createdAt");

-- CreateIndex
CREATE INDEX "AppActivityLog_createdAt_idx" ON "AppActivityLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AppActivityLog_workspaceId_createdAt_idx" ON "AppActivityLog"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AppActivityLog_action_createdAt_idx" ON "AppActivityLog"("action", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AppActivityLog_actorUserId_createdAt_idx" ON "AppActivityLog"("actorUserId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PlayPurchase_purchaseToken_key" ON "PlayPurchase"("purchaseToken");

-- CreateIndex
CREATE INDEX "PlayPurchase_workspaceId_idx" ON "PlayPurchase"("workspaceId");

-- CreateIndex
CREATE INDEX "BillingTransaction_workspaceId_transactionDate_idx" ON "BillingTransaction"("workspaceId", "transactionDate");

-- CreateIndex
CREATE INDEX "BillingTransaction_distributorCouponId_idx" ON "BillingTransaction"("distributorCouponId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingTransaction_workspaceId_providerReference_key" ON "BillingTransaction"("workspaceId", "providerReference");

-- CreateIndex
CREATE INDEX "FinancialOperationIdempotency_workspaceId_operation_expires_idx" ON "FinancialOperationIdempotency"("workspaceId", "operation", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialOperationIdempotency_workspaceId_operation_idempot_key" ON "FinancialOperationIdempotency"("workspaceId", "operation", "idempotencyKey");

-- CreateIndex
CREATE INDEX "ProcessedWebhookEvent_provider_createdAt_idx" ON "ProcessedWebhookEvent"("provider", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessedWebhookEvent_provider_status_createdAt_idx" ON "ProcessedWebhookEvent"("provider", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProcessedWebhookEvent_provider_eventId_key" ON "ProcessedWebhookEvent"("provider", "eventId");

-- CreateIndex
CREATE INDEX "AccountingTransaction_workspaceId_eventType_postedAt_idx" ON "AccountingTransaction"("workspaceId", "eventType", "postedAt");

-- CreateIndex
CREATE INDEX "AccountingTransaction_workspaceId_sourceTable_sourceId_idx" ON "AccountingTransaction"("workspaceId", "sourceTable", "sourceId");

-- CreateIndex
CREATE INDEX "AccountingTransaction_requestId_idx" ON "AccountingTransaction"("requestId");

-- CreateIndex
CREATE INDEX "AccountingTransaction_jobId_idx" ON "AccountingTransaction"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingTransaction_workspaceId_sourceTable_sourceId_even_key" ON "AccountingTransaction"("workspaceId", "sourceTable", "sourceId", "eventType");

-- CreateIndex
CREATE INDEX "AccountingEntry_workspaceId_accountCode_postedAt_idx" ON "AccountingEntry"("workspaceId", "accountCode", "postedAt");

-- CreateIndex
CREATE INDEX "AccountingEntry_workspaceId_transactionId_idx" ON "AccountingEntry"("workspaceId", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntry_transactionId_lineNumber_key" ON "AccountingEntry"("transactionId", "lineNumber");

-- CreateIndex
CREATE INDEX "AccountingIntegrityRun_workspaceId_startedAt_idx" ON "AccountingIntegrityRun"("workspaceId", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "AccountingViolationReport_workspaceId_detectedAt_idx" ON "AccountingViolationReport"("workspaceId", "detectedAt" DESC);

-- CreateIndex
CREATE INDEX "AccountingViolationReport_runId_invariantCode_idx" ON "AccountingViolationReport"("runId", "invariantCode");

-- CreateIndex
CREATE INDEX "WorkspaceUser_workspaceId_isActive_idx" ON "WorkspaceUser"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "WorkspaceUser_workspaceId_businessRole_idx" ON "WorkspaceUser"("workspaceId", "businessRole");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceUser_userId_workspaceId_key" ON "WorkspaceUser"("userId", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ReportShare_token_key" ON "ReportShare"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ReportShare_tokenHash_key" ON "ReportShare"("tokenHash");

-- CreateIndex
CREATE INDEX "ReportShare_scope_audience_status_idx" ON "ReportShare"("scope", "audience", "status");

-- CreateIndex
CREATE INDEX "ReportShare_workspaceId_status_idx" ON "ReportShare"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ReportShare_companyGroupId_status_idx" ON "ReportShare"("companyGroupId", "status");

-- CreateIndex
CREATE INDEX "ReportShare_createdByUserId_idx" ON "ReportShare"("createdByUserId");

-- CreateIndex
CREATE INDEX "ReportShare_expiresAt_idx" ON "ReportShare"("expiresAt");

-- CreateIndex
CREATE INDEX "ReportShareSnapshot_reportShareId_createdAt_idx" ON "ReportShareSnapshot"("reportShareId", "createdAt");

-- CreateIndex
CREATE INDEX "ReportShareSnapshot_workspaceId_idx" ON "ReportShareSnapshot"("workspaceId");

-- CreateIndex
CREATE INDEX "ReportShareSnapshot_companyGroupId_idx" ON "ReportShareSnapshot"("companyGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_token_key" ON "WorkspaceInvite"("token");

-- CreateIndex
CREATE INDEX "WorkspaceInvite_workspaceId_expiresAt_idx" ON "WorkspaceInvite"("workspaceId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceInvite_workspaceId_email_key" ON "WorkspaceInvite"("workspaceId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_workspaceId_key" ON "BusinessProfile"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessProfile_shopSlug_key" ON "BusinessProfile"("shopSlug");

-- CreateIndex
CREATE INDEX "BusinessProfile_primaryBankAccountId_idx" ON "BusinessProfile"("primaryBankAccountId");

-- CreateIndex
CREATE INDEX "Client_workspaceId_idx" ON "Client"("workspaceId");

-- CreateIndex
CREATE INDEX "Client_workspaceId_archivedAt_idx" ON "Client"("workspaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Client_name_workspaceId_key" ON "Client"("name", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientPaymentBehavior_clientId_key" ON "ClientPaymentBehavior"("clientId");

-- CreateIndex
CREATE INDEX "ClientPaymentBehavior_workspaceId_lastComputedAt_idx" ON "ClientPaymentBehavior"("workspaceId", "lastComputedAt" DESC);

-- CreateIndex
CREATE INDEX "Invoice_financialYear_idx" ON "Invoice"("financialYear");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_idx" ON "Invoice"("workspaceId");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_status_dueDate_idx" ON "Invoice"("workspaceId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_financialYear_status_idx" ON "Invoice"("workspaceId", "financialYear", "status");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_clientId_idx" ON "Invoice"("workspaceId", "clientId");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_invoiceDate_idx" ON "Invoice"("workspaceId", "invoiceDate");

-- CreateIndex
CREATE INDEX "Invoice_workspaceId_retainerId_idx" ON "Invoice"("workspaceId", "retainerId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_invoiceNumber_workspaceId_key" ON "Invoice"("invoiceNumber", "workspaceId");

-- CreateIndex
CREATE INDEX "InvoicePayment_invoiceId_idx" ON "InvoicePayment"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoicePayment_workspaceId_receivedAt_idx" ON "InvoicePayment"("workspaceId", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoicePayment_workspaceId_idempotencyKey_key" ON "InvoicePayment"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent"("invoiceId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditNote_invoiceId_idx" ON "CreditNote"("invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "CreditNote_workspaceId_creditNoteNumber_key" ON "CreditNote"("workspaceId", "creditNoteNumber");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceTaxPreference_workspaceId_key" ON "WorkspaceTaxPreference"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceTaxOverride_workspaceId_isActive_effectiveFrom_eff_idx" ON "WorkspaceTaxOverride"("workspaceId", "isActive", "effectiveFrom", "effectiveTo");

-- CreateIndex
CREATE INDEX "WorkspaceTaxOverride_workspaceId_scopeType_scopeKey_priorit_idx" ON "WorkspaceTaxOverride"("workspaceId", "scopeType", "scopeKey", "priority");

-- CreateIndex
CREATE INDEX "TaxDecisionAuditLog_workspaceId_idx" ON "TaxDecisionAuditLog"("workspaceId");

-- CreateIndex
CREATE INDEX "TaxDecisionAuditLog_invoiceId_idx" ON "TaxDecisionAuditLog"("invoiceId");

-- CreateIndex
CREATE INDEX "TaxableEvent_workspaceId_sourceEntityKind_sourceEntityId_idx" ON "TaxableEvent"("workspaceId", "sourceEntityKind", "sourceEntityId");

-- CreateIndex
CREATE INDEX "TaxableEvent_workspaceId_occurredAt_idx" ON "TaxableEvent"("workspaceId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxDetermination_taxableEventId_key" ON "TaxDetermination"("taxableEventId");

-- CreateIndex
CREATE INDEX "TaxDetermination_workspaceId_idx" ON "TaxDetermination"("workspaceId");

-- CreateIndex
CREATE INDEX "TaxComponentLine_workspaceId_taxDeterminationId_idx" ON "TaxComponentLine"("workspaceId", "taxDeterminationId");

-- CreateIndex
CREATE INDEX "TaxAuditEvent_workspaceId_createdAt_idx" ON "TaxAuditEvent"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TaxAuditEvent_workspaceId_correlationId_idx" ON "TaxAuditEvent"("workspaceId", "correlationId");

-- CreateIndex
CREATE INDEX "TaxAuditEvent_workspaceId_eventType_createdAt_idx" ON "TaxAuditEvent"("workspaceId", "eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TaxOperationIdempotency_workspaceId_expiresAt_idx" ON "TaxOperationIdempotency"("workspaceId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "TaxOperationIdempotency_workspaceId_operation_idempotencyKe_key" ON "TaxOperationIdempotency"("workspaceId", "operation", "idempotencyKey");

-- CreateIndex
CREATE INDEX "TaxReferenceEntry_workspaceId_entryType_idx" ON "TaxReferenceEntry"("workspaceId", "entryType");

-- CreateIndex
CREATE INDEX "TaxReferenceEntry_countryCode_entryType_idx" ON "TaxReferenceEntry"("countryCode", "entryType");

-- CreateIndex
CREATE UNIQUE INDEX "TaxReferenceEntry_entryType_countryCode_code_key" ON "TaxReferenceEntry"("entryType", "countryCode", "code");

-- CreateIndex
CREATE INDEX "TaxPeriod_workspaceId_startDate_endDate_idx" ON "TaxPeriod"("workspaceId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "TaxPeriod_workspaceId_periodCode_key" ON "TaxPeriod"("workspaceId", "periodCode");

-- CreateIndex
CREATE INDEX "TaxForm_workspaceId_countryCode_returnFamily_isActive_idx" ON "TaxForm"("workspaceId", "countryCode", "returnFamily", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TaxForm_workspaceId_formCode_version_key" ON "TaxForm"("workspaceId", "formCode", "version");

-- CreateIndex
CREATE INDEX "TaxReturn_workspaceId_status_idx" ON "TaxReturn"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "TaxReturn_workspaceId_lastReadinessCheckedAt_idx" ON "TaxReturn"("workspaceId", "lastReadinessCheckedAt");

-- CreateIndex
CREATE INDEX "TaxReturn_workspaceId_updatedAt_idx" ON "TaxReturn"("workspaceId", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TaxReturn_workspaceId_taxPeriodId_taxFormId_key" ON "TaxReturn"("workspaceId", "taxPeriodId", "taxFormId");

-- CreateIndex
CREATE INDEX "TaxReturnFieldValue_workspaceId_taxReturnId_idx" ON "TaxReturnFieldValue"("workspaceId", "taxReturnId");

-- CreateIndex
CREATE UNIQUE INDEX "TaxReturnFieldValue_taxReturnId_fieldKey_key" ON "TaxReturnFieldValue"("taxReturnId", "fieldKey");

-- CreateIndex
CREATE INDEX "TaxReadinessCheck_workspaceId_returnFamily_isActive_idx" ON "TaxReadinessCheck"("workspaceId", "returnFamily", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TaxReadinessCheck_workspaceId_returnFamily_checkCode_key" ON "TaxReadinessCheck"("workspaceId", "returnFamily", "checkCode");

-- CreateIndex
CREATE INDEX "TaxReadinessBlocker_workspaceId_status_severity_idx" ON "TaxReadinessBlocker"("workspaceId", "status", "severity");

-- CreateIndex
CREATE INDEX "TaxReadinessBlocker_workspaceId_taxReturnId_idx" ON "TaxReadinessBlocker"("workspaceId", "taxReturnId");

-- CreateIndex
CREATE INDEX "TaxReadinessBlocker_workspaceId_status_severity_updatedAt_idx" ON "TaxReadinessBlocker"("workspaceId", "status", "severity", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TaxReadinessBlocker_taxReturnId_blockerCode_key" ON "TaxReadinessBlocker"("taxReturnId", "blockerCode");

-- CreateIndex
CREATE INDEX "InvoiceIdempotency_workspaceId_expiresAt_idx" ON "InvoiceIdempotency"("workspaceId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceIdempotency_workspaceId_idempotencyKey_key" ON "InvoiceIdempotency"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "InvoiceGenerationDraft_workspaceId_createdByUserId_status_idx" ON "InvoiceGenerationDraft"("workspaceId", "createdByUserId", "status");

-- CreateIndex
CREATE INDEX "InvoiceGenerationDraft_workspaceId_expiresAt_idx" ON "InvoiceGenerationDraft"("workspaceId", "expiresAt");

-- CreateIndex
CREATE INDEX "Expense_date_idx" ON "Expense"("date");

-- CreateIndex
CREATE INDEX "Expense_category_idx" ON "Expense"("category");

-- CreateIndex
CREATE INDEX "Expense_workspaceId_idx" ON "Expense"("workspaceId");

-- CreateIndex
CREATE INDEX "Expense_workspaceId_date_idx" ON "Expense"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "Expense_workspaceId_approvalStatus_idx" ON "Expense"("workspaceId", "approvalStatus");

-- CreateIndex
CREATE INDEX "Expense_workspaceId_paymentStatus_dueDate_idx" ON "Expense"("workspaceId", "paymentStatus", "dueDate");

-- CreateIndex
CREATE INDEX "Expense_vendorId_idx" ON "Expense"("vendorId");

-- CreateIndex
CREATE INDEX "Expense_clientId_billable_idx" ON "Expense"("clientId", "billable");

-- CreateIndex
CREATE INDEX "Expense_purchaseOrderId_idx" ON "Expense"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "Vendor_workspaceId_archivedAt_idx" ON "Vendor"("workspaceId", "archivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_workspaceId_nameKey_key" ON "Vendor"("workspaceId", "nameKey");

-- CreateIndex
CREATE INDEX "RecurringExpense_workspaceId_status_nextRunDate_idx" ON "RecurringExpense"("workspaceId", "status", "nextRunDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseBudget_workspaceId_category_key" ON "ExpenseBudget"("workspaceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseSettings_inboxToken_key" ON "ExpenseSettings"("inboxToken");

-- CreateIndex
CREATE INDEX "WithholdingEvent_workspaceId_deductedAt_idx" ON "WithholdingEvent"("workspaceId", "deductedAt");

-- CreateIndex
CREATE INDEX "WithholdingEvent_workspaceId_returnPeriodKey_idx" ON "WithholdingEvent"("workspaceId", "returnPeriodKey");

-- CreateIndex
CREATE INDEX "WithholdingEvent_workspaceId_sourceType_sourceId_idx" ON "WithholdingEvent"("workspaceId", "sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "TaxCreditEvent_workspaceId_returnPeriodKey_idx" ON "TaxCreditEvent"("workspaceId", "returnPeriodKey");

-- CreateIndex
CREATE INDEX "TaxCreditEvent_workspaceId_periodStart_periodEnd_idx" ON "TaxCreditEvent"("workspaceId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "TaxCreditEvent_workspaceId_documentId_idx" ON "TaxCreditEvent"("workspaceId", "documentId");

-- CreateIndex
CREATE INDEX "TaxCreditLedgerEntry_workspaceId_entryDate_idx" ON "TaxCreditLedgerEntry"("workspaceId", "entryDate");

-- CreateIndex
CREATE INDEX "TaxCreditLedgerEntry_workspaceId_returnPeriodKey_idx" ON "TaxCreditLedgerEntry"("workspaceId", "returnPeriodKey");

-- CreateIndex
CREATE INDEX "TaxCreditLedgerEntry_workspaceId_taxCreditEventId_idx" ON "TaxCreditLedgerEntry"("workspaceId", "taxCreditEventId");

-- CreateIndex
CREATE INDEX "TaxReturnPeriod_workspaceId_dueDate_idx" ON "TaxReturnPeriod"("workspaceId", "dueDate");

-- CreateIndex
CREATE INDEX "TaxReturnPeriod_workspaceId_periodStart_periodEnd_idx" ON "TaxReturnPeriod"("workspaceId", "periodStart", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "TaxReturnPeriod_workspaceId_periodKey_key" ON "TaxReturnPeriod"("workspaceId", "periodKey");

-- CreateIndex
CREATE INDEX "BankTransaction_workspaceId_idx" ON "BankTransaction"("workspaceId");

-- CreateIndex
CREATE INDEX "BankTransaction_accountId_idx" ON "BankTransaction"("accountId");

-- CreateIndex
CREATE INDEX "BankTransaction_date_idx" ON "BankTransaction"("date");

-- CreateIndex
CREATE INDEX "BankTransaction_workspaceId_isReconciled_date_idx" ON "BankTransaction"("workspaceId", "isReconciled", "date");

-- CreateIndex
CREATE INDEX "BankTransaction_workspaceId_isReconciled_ignoredAt_idx" ON "BankTransaction"("workspaceId", "isReconciled", "ignoredAt");

-- CreateIndex
CREATE INDEX "BankTransaction_importBatchId_idx" ON "BankTransaction"("importBatchId");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_workspaceId_accountId_sourceImportHash_key" ON "BankTransaction"("workspaceId", "accountId", "sourceImportHash");

-- CreateIndex
CREATE UNIQUE INDEX "BankTransaction_workspaceId_accountId_providerTransactionId_key" ON "BankTransaction"("workspaceId", "accountId", "providerTransactionId");

-- CreateIndex
CREATE INDEX "BankAccount_workspaceId_isPrimaryRemittance_idx" ON "BankAccount"("workspaceId", "isPrimaryRemittance");

-- CreateIndex
CREATE INDEX "BankAccount_workspaceId_idx" ON "BankAccount"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_workspaceId_name_key" ON "BankAccount"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "BankImportBatch_workspaceId_accountId_createdAt_idx" ON "BankImportBatch"("workspaceId", "accountId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "BankImportBatch_workspaceId_createdAt_idx" ON "BankImportBatch"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ExpenseReconciliationCategory_workspaceId_sortOrder_idx" ON "ExpenseReconciliationCategory"("workspaceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseReconciliationCategory_workspaceId_name_key" ON "ExpenseReconciliationCategory"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "BankReconciliationRule_workspaceId_isActive_priority_idx" ON "BankReconciliationRule"("workspaceId", "isActive", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceReconciliationSettings_workspaceId_key" ON "WorkspaceReconciliationSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "BankTransactionInvoiceSplit_bankTransactionId_idx" ON "BankTransactionInvoiceSplit"("bankTransactionId");

-- CreateIndex
CREATE INDEX "BankTransactionInvoiceSplit_invoiceId_idx" ON "BankTransactionInvoiceSplit"("invoiceId");

-- CreateIndex
CREATE INDEX "CashForecastSnapshot_workspaceId_horizonType_scenarioTag_ge_idx" ON "CashForecastSnapshot"("workspaceId", "horizonType", "scenarioTag", "generatedAt" DESC);

-- CreateIndex
CREATE INDEX "CashForecastSnapshot_workspaceId_startDate_endDate_idx" ON "CashForecastSnapshot"("workspaceId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "CashForecastPeriod_snapshotId_periodStart_idx" ON "CashForecastPeriod"("snapshotId", "periodStart");

-- CreateIndex
CREATE INDEX "CashForecastPeriod_snapshotId_riskLevel_idx" ON "CashForecastPeriod"("snapshotId", "riskLevel");

-- CreateIndex
CREATE INDEX "CashForecastLineItem_periodId_expectedDate_idx" ON "CashForecastLineItem"("periodId", "expectedDate");

-- CreateIndex
CREATE INDEX "CashForecastLineItem_sourceType_sourceId_idx" ON "CashForecastLineItem"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "CashForecastLineItem_classification_idx" ON "CashForecastLineItem"("classification");

-- CreateIndex
CREATE INDEX "CashForecastAssumption_workspaceId_isActive_key_idx" ON "CashForecastAssumption"("workspaceId", "isActive", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CashForecastAssumption_workspaceId_key_isActive_key" ON "CashForecastAssumption"("workspaceId", "key", "isActive");

-- CreateIndex
CREATE INDEX "CashForecastManualAdjustment_workspaceId_date_idx" ON "CashForecastManualAdjustment"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "CashForecastManualAdjustment_workspaceId_direction_idx" ON "CashForecastManualAdjustment"("workspaceId", "direction");

-- CreateIndex
CREATE INDEX "CashForecastLineItemPlan_workspaceId_horizonType_scenarioTa_idx" ON "CashForecastLineItemPlan"("workspaceId", "horizonType", "scenarioTag");

-- CreateIndex
CREATE UNIQUE INDEX "CashForecastLineItemPlan_workspaceId_horizonType_scenarioTa_key" ON "CashForecastLineItemPlan"("workspaceId", "horizonType", "scenarioTag", "planKey");

-- CreateIndex
CREATE UNIQUE INDEX "CashForecastAlertPreference_workspaceId_key" ON "CashForecastAlertPreference"("workspaceId");

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
CREATE INDEX "Proposal_workspaceId_status_idx" ON "Proposal"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Proposal_workspaceId_clientId_idx" ON "Proposal"("workspaceId", "clientId");

-- CreateIndex
CREATE INDEX "Proposal_workspaceId_dateCreated_idx" ON "Proposal"("workspaceId", "dateCreated");

-- CreateIndex
CREATE UNIQUE INDEX "Proposal_proposalNo_workspaceId_key" ON "Proposal"("proposalNo", "workspaceId");

-- CreateIndex
CREATE INDEX "ProposalEvent_proposalId_createdAt_idx" ON "ProposalEvent"("proposalId", "createdAt");

-- CreateIndex
CREATE INDEX "Retainer_workspaceId_status_idx" ON "Retainer"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Retainer_workspaceId_nextBillingDate_idx" ON "Retainer"("workspaceId", "nextBillingDate");

-- CreateIndex
CREATE INDEX "Retainer_workspaceId_clientId_idx" ON "Retainer"("workspaceId", "clientId");

-- CreateIndex
CREATE INDEX "RetainerPriceChange_retainerId_effectiveDate_idx" ON "RetainerPriceChange"("retainerId", "effectiveDate");

-- CreateIndex
CREATE INDEX "RetainerEvent_retainerId_createdAt_idx" ON "RetainerEvent"("retainerId", "createdAt");

-- CreateIndex
CREATE INDEX "Task_workspaceId_idx" ON "Task"("workspaceId");

-- CreateIndex
CREATE INDEX "WorkspaceTaxRegistration_workspaceId_isActive_idx" ON "WorkspaceTaxRegistration"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "WorkspaceTaxRegistration_workspaceId_taxType_jurisdictionCo_idx" ON "WorkspaceTaxRegistration"("workspaceId", "taxType", "jurisdictionCode");

-- CreateIndex
CREATE INDEX "FilingCalendarRule_workspaceId_taxRegistrationId_isActive_idx" ON "FilingCalendarRule"("workspaceId", "taxRegistrationId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TaxObligationPeriod_obligationId_key" ON "TaxObligationPeriod"("obligationId");

-- CreateIndex
CREATE INDEX "TaxObligationPeriod_workspaceId_periodStart_periodEnd_idx" ON "TaxObligationPeriod"("workspaceId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "TaxObligation_workspaceId_status_dueDate_idx" ON "TaxObligation"("workspaceId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "TaxObligation_workspaceId_taxRegistrationId_periodKey_key" ON "TaxObligation"("workspaceId", "taxRegistrationId", "periodKey");

-- CreateIndex
CREATE INDEX "ComplianceTask_workspaceId_status_dueDate_idx" ON "ComplianceTask"("workspaceId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceTask_workspaceId_obligationId_dueDate_key" ON "ComplianceTask"("workspaceId", "obligationId", "dueDate");

-- CreateIndex
CREATE INDEX "TaxRateOverride_workspaceId_scopeType_isActive_idx" ON "TaxRateOverride"("workspaceId", "scopeType", "isActive");

-- CreateIndex
CREATE INDEX "TaxRateOverride_workspaceId_effectiveFrom_idx" ON "TaxRateOverride"("workspaceId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "TaxRateOverrideAuditLog_workspaceId_createdAt_idx" ON "TaxRateOverrideAuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "TaxRateOverrideAuditLog_workspaceId_action_idx" ON "TaxRateOverrideAuditLog"("workspaceId", "action");

-- CreateIndex
CREATE INDEX "TaxRateOverrideAuditLog_workspaceId_scopeType_idx" ON "TaxRateOverrideAuditLog"("workspaceId", "scopeType");

-- CreateIndex
CREATE INDEX "FileImportAuditLog_workspaceId_createdAt_idx" ON "FileImportAuditLog"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "FileImportAuditLog_workspaceId_status_idx" ON "FileImportAuditLog"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "InAppNotification_userId_isRead_createdAt_idx" ON "InAppNotification"("userId", "isRead", "createdAt");

-- CreateIndex
CREATE INDEX "InAppNotification_userId_createdAt_idx" ON "InAppNotification"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "InAppNotification_workspaceId_idx" ON "InAppNotification"("workspaceId");

-- CreateIndex
CREATE INDEX "Product_workspaceId_idx" ON "Product"("workspaceId");

-- CreateIndex
CREATE INDEX "Product_workspaceId_showInShop_currentStock_idx" ON "Product"("workspaceId", "showInShop", "currentStock");

-- CreateIndex
CREATE UNIQUE INDEX "Product_sku_workspaceId_key" ON "Product"("sku", "workspaceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_invoiceId_idx" ON "InvoiceItem"("invoiceId");

-- CreateIndex
CREATE INDEX "InvoiceItem_productId_idx" ON "InvoiceItem"("productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_workspaceId_idx" ON "InventoryMovement"("workspaceId");

-- CreateIndex
CREATE INDEX "InventoryMovement_productId_idx" ON "InventoryMovement"("productId");

-- CreateIndex
CREATE INDEX "InventoryMovement_createdAt_idx" ON "InventoryMovement"("createdAt");

-- CreateIndex
CREATE INDEX "PurchaseOrder_workspaceId_idx" ON "PurchaseOrder"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_poNumber_workspaceId_key" ON "PurchaseOrder"("poNumber", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_razorpayOrderId_key" ON "ShopOrder"("razorpayOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopOrder_stripePaymentIntentId_key" ON "ShopOrder"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "ShopOrder_workspaceId_status_idx" ON "ShopOrder"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "ShopOrder_workspaceId_createdAt_idx" ON "ShopOrder"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ShopOrder_razorpayOrderId_idx" ON "ShopOrder"("razorpayOrderId");

-- CreateIndex
CREATE INDEX "ShopOrder_stripePaymentIntentId_idx" ON "ShopOrder"("stripePaymentIntentId");

-- CreateIndex
CREATE INDEX "ProposalConversion_workspaceId_proposalId_idx" ON "ProposalConversion"("workspaceId", "proposalId");

-- CreateIndex
CREATE INDEX "ProposalConversion_conversionType_idx" ON "ProposalConversion"("conversionType");

-- CreateIndex
CREATE INDEX "BillingMilestone_workspaceId_proposalId_idx" ON "BillingMilestone"("workspaceId", "proposalId");

-- CreateIndex
CREATE INDEX "HelpFeedback_docSlug_createdAt_idx" ON "HelpFeedback"("docSlug", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HelpFeedback_workspaceId_createdAt_idx" ON "HelpFeedback"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "HelpFeedback_userId_createdAt_idx" ON "HelpFeedback"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RbacAuditLog_workspaceId_createdAt_idx" ON "RbacAuditLog"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RbacAuditLog_workspaceId_eventType_createdAt_idx" ON "RbacAuditLog"("workspaceId", "eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RbacAuditLog_workspaceId_actorUserId_idx" ON "RbacAuditLog"("workspaceId", "actorUserId");

-- CreateIndex
CREATE INDEX "RbacAuditLog_workspaceId_targetUserId_idx" ON "RbacAuditLog"("workspaceId", "targetUserId");

-- CreateIndex
CREATE INDEX "MailBillingServer_workspaceId_status_idx" ON "MailBillingServer"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MailBillingServer_workspaceId_name_key" ON "MailBillingServer"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "MailBillingDomain_workspaceId_clientId_idx" ON "MailBillingDomain"("workspaceId", "clientId");

-- CreateIndex
CREATE INDEX "MailBillingDomain_workspaceId_retainerId_idx" ON "MailBillingDomain"("workspaceId", "retainerId");

-- CreateIndex
CREATE INDEX "MailBillingDomain_workspaceId_status_idx" ON "MailBillingDomain"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MailBillingDomain_workspaceId_serverId_domain_key" ON "MailBillingDomain"("workspaceId", "serverId", "domain");

-- CreateIndex
CREATE INDEX "MailBillingMailbox_workspaceId_domainId_idx" ON "MailBillingMailbox"("workspaceId", "domainId");

-- CreateIndex
CREATE INDEX "MailBillingMailbox_workspaceId_status_idx" ON "MailBillingMailbox"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MailBillingMailbox_workspaceId_serverId_email_key" ON "MailBillingMailbox"("workspaceId", "serverId", "email");

-- CreateIndex
CREATE INDEX "MailBillingSyncRun_workspaceId_startedAt_idx" ON "MailBillingSyncRun"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "MailBillingSyncRun_workspaceId_serverId_startedAt_idx" ON "MailBillingSyncRun"("workspaceId", "serverId", "startedAt");

-- CreateIndex
CREATE INDEX "MailBillingPlan_workspaceId_isActive_idx" ON "MailBillingPlan"("workspaceId", "isActive");

-- CreateIndex
CREATE INDEX "MailBillingPlan_workspaceId_sortOrder_idx" ON "MailBillingPlan"("workspaceId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "MailBillingPlan_workspaceId_name_key" ON "MailBillingPlan"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "MailBillingSubscription_workspaceId_clientId_idx" ON "MailBillingSubscription"("workspaceId", "clientId");

-- CreateIndex
CREATE INDEX "MailBillingSubscription_workspaceId_planId_idx" ON "MailBillingSubscription"("workspaceId", "planId");

-- CreateIndex
CREATE INDEX "MailBillingSubscription_workspaceId_retainerId_idx" ON "MailBillingSubscription"("workspaceId", "retainerId");

-- CreateIndex
CREATE INDEX "MailBillingSubscription_workspaceId_billingStatus_idx" ON "MailBillingSubscription"("workspaceId", "billingStatus");

-- CreateIndex
CREATE UNIQUE INDEX "MailBillingSubscription_workspaceId_domainId_key" ON "MailBillingSubscription"("workspaceId", "domainId");

-- CreateIndex
CREATE INDEX "MailBillingReviewItem_workspaceId_status_severity_idx" ON "MailBillingReviewItem"("workspaceId", "status", "severity");

-- CreateIndex
CREATE INDEX "MailBillingReviewItem_workspaceId_domainId_status_idx" ON "MailBillingReviewItem"("workspaceId", "domainId", "status");

-- CreateIndex
CREATE INDEX "MailBillingReviewItem_workspaceId_subscriptionId_idx" ON "MailBillingReviewItem"("workspaceId", "subscriptionId");

-- CreateIndex
CREATE INDEX "MailBillingReviewItem_workspaceId_serverId_idx" ON "MailBillingReviewItem"("workspaceId", "serverId");

-- CreateIndex
CREATE INDEX "MailBillingReviewItem_workspaceId_type_status_idx" ON "MailBillingReviewItem"("workspaceId", "type", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MailBillingSettings_workspaceId_key" ON "MailBillingSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "MailBillingSettings_workspaceId_defaultPlanId_idx" ON "MailBillingSettings"("workspaceId", "defaultPlanId");

-- CreateIndex
CREATE INDEX "WorkspaceModule_workspaceId_isEnabled_idx" ON "WorkspaceModule"("workspaceId", "isEnabled");

-- CreateIndex
CREATE INDEX "WorkspaceModule_workspaceId_moduleKey_idx" ON "WorkspaceModule"("workspaceId", "moduleKey");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceModule_workspaceId_moduleKey_key" ON "WorkspaceModule"("workspaceId", "moduleKey");

-- CreateIndex
CREATE INDEX "ImportRun_workspaceId_createdAt_idx" ON "ImportRun"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ImportRun_workspaceId_entityKey_status_idx" ON "ImportRun"("workspaceId", "entityKey", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ImportRun_workspaceId_idempotencyKey_key" ON "ImportRun"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "Document_workspaceId_createdAt_idx" ON "Document"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Document_workspaceId_status_createdAt_idx" ON "Document"("workspaceId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Document_workspaceId_category_createdAt_idx" ON "Document"("workspaceId", "category", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Document_workspaceId_scope_createdAt_idx" ON "Document"("workspaceId", "scope", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Document_workspaceId_isArchived_createdAt_idx" ON "Document"("workspaceId", "isArchived", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DocumentFile_workspaceId_createdAt_idx" ON "DocumentFile"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DocumentFile_workspaceId_documentId_idx" ON "DocumentFile"("workspaceId", "documentId");

-- CreateIndex
CREATE INDEX "DocumentFile_workspaceId_storedPath_idx" ON "DocumentFile"("workspaceId", "storedPath");

-- CreateIndex
CREATE INDEX "DocumentFile_documentId_isCurrent_idx" ON "DocumentFile"("documentId", "isCurrent");

-- CreateIndex
CREATE INDEX "DocumentOcrJob_workspaceId_status_queuedAt_idx" ON "DocumentOcrJob"("workspaceId", "status", "queuedAt" DESC);

-- CreateIndex
CREATE INDEX "DocumentOcrJob_workspaceId_documentId_idx" ON "DocumentOcrJob"("workspaceId", "documentId");

-- CreateIndex
CREATE INDEX "DocumentOcrJob_workspaceId_documentFileId_idx" ON "DocumentOcrJob"("workspaceId", "documentFileId");

-- CreateIndex
CREATE INDEX "DocumentExtractedField_workspaceId_documentId_fieldKey_crea_idx" ON "DocumentExtractedField"("workspaceId", "documentId", "fieldKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DocumentExtractedField_workspaceId_documentFileId_idx" ON "DocumentExtractedField"("workspaceId", "documentFileId");

-- CreateIndex
CREATE INDEX "DocumentLink_workspaceId_targetType_targetId_idx" ON "DocumentLink"("workspaceId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "DocumentLink_workspaceId_documentId_idx" ON "DocumentLink"("workspaceId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentLink_documentId_targetType_targetId_key" ON "DocumentLink"("documentId", "targetType", "targetId");

-- CreateIndex
CREATE INDEX "TaxDocumentLink_workspaceId_entityType_entityKey_createdAt_idx" ON "TaxDocumentLink"("workspaceId", "entityType", "entityKey", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TaxDocumentLink_workspaceId_documentId_createdAt_idx" ON "TaxDocumentLink"("workspaceId", "documentId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "TaxDocumentLink_workspaceId_documentId_entityType_entityKey_key" ON "TaxDocumentLink"("workspaceId", "documentId", "entityType", "entityKey");

-- CreateIndex
CREATE INDEX "TaxImportBatch_workspaceId_templateType_createdAt_idx" ON "TaxImportBatch"("workspaceId", "templateType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TaxImportBatch_workspaceId_status_createdAt_idx" ON "TaxImportBatch"("workspaceId", "status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "TaxImportRow_workspaceId_batchId_rowNumber_idx" ON "TaxImportRow"("workspaceId", "batchId", "rowNumber");

-- CreateIndex
CREATE INDEX "TaxImportRow_workspaceId_status_createdAt_idx" ON "TaxImportRow"("workspaceId", "status", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceDocumentStorage_workspaceId_key" ON "WorkspaceDocumentStorage"("workspaceId");

-- CreateIndex
CREATE INDEX "DocumentAuditEvent_workspaceId_createdAt_idx" ON "DocumentAuditEvent"("workspaceId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DocumentAuditEvent_workspaceId_eventType_createdAt_idx" ON "DocumentAuditEvent"("workspaceId", "eventType", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DocumentAuditEvent_workspaceId_documentId_idx" ON "DocumentAuditEvent"("workspaceId", "documentId");

-- CreateIndex
CREATE INDEX "Department_workspaceId_idx" ON "Department"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Department_workspaceId_name_key" ON "Department"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Designation_workspaceId_idx" ON "Designation"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Designation_workspaceId_title_key" ON "Designation"("workspaceId", "title");

-- CreateIndex
CREATE INDEX "Employee_workspaceId_status_idx" ON "Employee"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "Employee_workspaceId_departmentId_idx" ON "Employee"("workspaceId", "departmentId");

-- CreateIndex
CREATE INDEX "Employee_workspaceId_managerId_idx" ON "Employee"("workspaceId", "managerId");

-- CreateIndex
CREATE INDEX "Employee_userId_idx" ON "Employee"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee_workspaceId_employeeCode_key" ON "Employee"("workspaceId", "employeeCode");

-- CreateIndex
CREATE INDEX "AttendanceRecord_workspaceId_date_idx" ON "AttendanceRecord"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_workspaceId_employeeId_date_idx" ON "AttendanceRecord"("workspaceId", "employeeId", "date");

-- CreateIndex
CREATE INDEX "AttendanceRecord_workspaceId_status_idx" ON "AttendanceRecord"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");

-- CreateIndex
CREATE INDEX "LeaveType_workspaceId_isActive_idx" ON "LeaveType"("workspaceId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_workspaceId_code_key" ON "LeaveType"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "LeaveRequest_workspaceId_employeeId_status_idx" ON "LeaveRequest"("workspaceId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_workspaceId_startDate_endDate_idx" ON "LeaveRequest"("workspaceId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "LeaveRequest_workspaceId_status_idx" ON "LeaveRequest"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "LeaveRequest_workspaceId_leaveTypeId_idx" ON "LeaveRequest"("workspaceId", "leaveTypeId");

-- CreateIndex
CREATE INDEX "LeaveBalance_workspaceId_year_idx" ON "LeaveBalance"("workspaceId", "year");

-- CreateIndex
CREATE INDEX "LeaveBalance_workspaceId_employeeId_idx" ON "LeaveBalance"("workspaceId", "employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalance_employeeId_leaveTypeId_year_key" ON "LeaveBalance"("employeeId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "PayrollPeriod_workspaceId_status_startDate_endDate_idx" ON "PayrollPeriod"("workspaceId", "status", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPeriod_workspaceId_startDate_endDate_key" ON "PayrollPeriod"("workspaceId", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "PayrollRun_workspaceId_periodId_status_idx" ON "PayrollRun"("workspaceId", "periodId", "status");

-- CreateIndex
CREATE INDEX "PayrollRun_workspaceId_status_generatedAt_idx" ON "PayrollRun"("workspaceId", "status", "generatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRun_periodId_version_key" ON "PayrollRun"("periodId", "version");

-- CreateIndex
CREATE INDEX "PayrollEmployeeSnapshot_runId_employeeCode_idx" ON "PayrollEmployeeSnapshot"("runId", "employeeCode");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEmployeeSnapshot_runId_employeeId_key" ON "PayrollEmployeeSnapshot"("runId", "employeeId");

-- CreateIndex
CREATE INDEX "PayrollLineItem_runId_netPay_idx" ON "PayrollLineItem"("runId", "netPay");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollLineItem_runId_employeeSnapshotId_key" ON "PayrollLineItem"("runId", "employeeSnapshotId");

-- CreateIndex
CREATE INDEX "PayrollCostAllocation_lineItemId_idx" ON "PayrollCostAllocation"("lineItemId");

-- CreateIndex
CREATE INDEX "PayrollCostAllocation_departmentCode_projectCode_costCenter_idx" ON "PayrollCostAllocation"("departmentCode", "projectCode", "costCenterCode");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPosting_runId_key" ON "PayrollPosting"("runId");

-- CreateIndex
CREATE INDEX "PayrollPosting_workspaceId_postingStatus_createdAt_idx" ON "PayrollPosting"("workspaceId", "postingStatus", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPosting_workspaceId_idempotencyKey_key" ON "PayrollPosting"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "WorkforceHoliday_workspaceId_date_idx" ON "WorkforceHoliday"("workspaceId", "date");

-- CreateIndex
CREATE INDEX "WorkforceHoliday_workspaceId_year_idx" ON "WorkforceHoliday"("workspaceId", "year");

-- CreateIndex
CREATE UNIQUE INDEX "WorkSchedule_workspaceId_key" ON "WorkSchedule"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollSettings_workspaceId_key" ON "PayrollSettings"("workspaceId");

-- CreateIndex
CREATE INDEX "PayrollPayComponent_workspaceId_category_idx" ON "PayrollPayComponent"("workspaceId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollPayComponent_workspaceId_code_key" ON "PayrollPayComponent"("workspaceId", "code");

-- CreateIndex
CREATE INDEX "EmployeeCompensation_workspaceId_employeeId_effectiveFrom_idx" ON "EmployeeCompensation"("workspaceId", "employeeId", "effectiveFrom" DESC);

-- CreateIndex
CREATE INDEX "PayrollAdjustment_workspaceId_periodId_idx" ON "PayrollAdjustment"("workspaceId", "periodId");

-- CreateIndex
CREATE INDEX "PayrollAdjustment_periodId_employeeId_idx" ON "PayrollAdjustment"("periodId", "employeeId");

-- CreateIndex
CREATE INDEX "EmployeeLoan_workspaceId_employeeId_status_idx" ON "EmployeeLoan"("workspaceId", "employeeId", "status");

-- CreateIndex
CREATE INDEX "PayrollRemittance_workspaceId_status_dueDate_idx" ON "PayrollRemittance"("workspaceId", "status", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollRemittance_workspaceId_periodId_kind_key" ON "PayrollRemittance"("workspaceId", "periodId", "kind");

-- CreateIndex
CREATE INDEX "AiToolConfirmationNonce_workspaceId_userId_expiresAt_idx" ON "AiToolConfirmationNonce"("workspaceId", "userId", "expiresAt");

-- CreateIndex
CREATE INDEX "AiToolConfirmationNonce_expiresAt_idx" ON "AiToolConfirmationNonce"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SystemRemediation_errorLogId_key" ON "SystemRemediation"("errorLogId");

-- CreateIndex
CREATE INDEX "GstReturn_workspaceId_status_idx" ON "GstReturn"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GstReturn_workspaceId_returnType_periodKey_key" ON "GstReturn"("workspaceId", "returnType", "periodKey");

-- CreateIndex
CREATE INDEX "GstAdjustment_workspaceId_periodKey_idx" ON "GstAdjustment"("workspaceId", "periodKey");

-- CreateIndex
CREATE INDEX "Gstr2bEntry_workspaceId_periodKey_idx" ON "Gstr2bEntry"("workspaceId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "Gstr2bEntry_workspaceId_periodKey_supplierGstin_invoiceNumb_key" ON "Gstr2bEntry"("workspaceId", "periodKey", "supplierGstin", "invoiceNumber");

-- CreateIndex
CREATE INDEX "GstDebitNote_workspaceId_issuedAt_idx" ON "GstDebitNote"("workspaceId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "GstDebitNote_workspaceId_noteNumber_key" ON "GstDebitNote"("workspaceId", "noteNumber");

-- CreateIndex
CREATE INDEX "GstAmendment_workspaceId_periodKey_idx" ON "GstAmendment"("workspaceId", "periodKey");

-- CreateIndex
CREATE INDEX "GstAdvance_workspaceId_receivedAt_idx" ON "GstAdvance"("workspaceId", "receivedAt");

-- CreateIndex
CREATE INDEX "GstReturnComment_workspaceId_returnType_periodKey_idx" ON "GstReturnComment"("workspaceId", "returnType", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "GstReminderLog_workspaceId_key_channel_key" ON "GstReminderLog"("workspaceId", "key", "channel");

-- CreateIndex
CREATE INDEX "CaComplianceItem_workspaceId_fy_idx" ON "CaComplianceItem"("workspaceId", "fy");

-- CreateIndex
CREATE UNIQUE INDEX "CaComplianceItem_workspaceId_kind_periodKey_key" ON "CaComplianceItem"("workspaceId", "kind", "periodKey");

-- CreateIndex
CREATE INDEX "CaRequest_workspaceId_fy_status_idx" ON "CaRequest"("workspaceId", "fy", "status");

-- CreateIndex
CREATE INDEX "CaRequestMessage_requestId_createdAt_idx" ON "CaRequestMessage"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientContact_workspaceId_clientId_idx" ON "ClientContact"("workspaceId", "clientId");

-- CreateIndex
CREATE INDEX "ClientNote_workspaceId_clientId_createdAt_idx" ON "ClientNote"("workspaceId", "clientId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ReportView_workspaceId_createdByUserId_idx" ON "ReportView"("workspaceId", "createdByUserId");

-- CreateIndex
CREATE INDEX "ReportView_scheduleNextAt_idx" ON "ReportView"("scheduleNextAt");

-- AddForeignKey
ALTER TABLE "DistributorCoupon" ADD CONSTRAINT "DistributorCoupon_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorPayout" ADD CONSTRAINT "DistributorPayout_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorAuditLog" ADD CONSTRAINT "DistributorAuditLog_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorAttribution" ADD CONSTRAINT "DistributorAttribution_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "DistributorCoupon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorAttribution" ADD CONSTRAINT "DistributorAttribution_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorAttribution" ADD CONSTRAINT "DistributorAttribution_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorCommission" ADD CONSTRAINT "DistributorCommission_distributorId_fkey" FOREIGN KEY ("distributorId") REFERENCES "Distributor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorCommission" ADD CONSTRAINT "DistributorCommission_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "DistributorCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorCommission" ADD CONSTRAINT "DistributorCommission_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorCommission" ADD CONSTRAINT "DistributorCommission_billingTransactionId_fkey" FOREIGN KEY ("billingTransactionId") REFERENCES "BillingTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DistributorCommission" ADD CONSTRAINT "DistributorCommission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "DistributorPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_distributorPartnerId_fkey" FOREIGN KEY ("distributorPartnerId") REFERENCES "Distributor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnCredential" ADD CONSTRAINT "WebAuthnCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebAuthnChallenge" ADD CONSTRAINT "WebAuthnChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOnboarding" ADD CONSTRAINT "UserOnboarding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroup" ADD CONSTRAINT "CompanyGroup_billingWorkspaceId_fkey" FOREIGN KEY ("billingWorkspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroupWorkspace" ADD CONSTRAINT "CompanyGroupWorkspace_companyGroupId_fkey" FOREIGN KEY ("companyGroupId") REFERENCES "CompanyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroupWorkspace" ADD CONSTRAINT "CompanyGroupWorkspace_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroupMember" ADD CONSTRAINT "CompanyGroupMember_companyGroupId_fkey" FOREIGN KEY ("companyGroupId") REFERENCES "CompanyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroupMember" ADD CONSTRAINT "CompanyGroupMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroupMemberWorkspaceAccess" ADD CONSTRAINT "CompanyGroupMemberWorkspaceAccess_companyGroupMemberId_fkey" FOREIGN KEY ("companyGroupMemberId") REFERENCES "CompanyGroupMember"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroupMemberWorkspaceAccess" ADD CONSTRAINT "CompanyGroupMemberWorkspaceAccess_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyGroupModule" ADD CONSTRAINT "CompanyGroupModule_companyGroupId_fkey" FOREIGN KEY ("companyGroupId") REFERENCES "CompanyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerCoupon" ADD CONSTRAINT "ResellerCoupon_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "ResellerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerLead" ADD CONSTRAINT "ResellerLead_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "ResellerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerLead" ADD CONSTRAINT "ResellerLead_couponId_fkey" FOREIGN KEY ("couponId") REFERENCES "ResellerCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerLead" ADD CONSTRAINT "ResellerLead_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerCommission" ADD CONSTRAINT "ResellerCommission_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "ResellerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerCommission" ADD CONSTRAINT "ResellerCommission_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "ResellerLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerCommission" ADD CONSTRAINT "ResellerCommission_billingTransactionId_fkey" FOREIGN KEY ("billingTransactionId") REFERENCES "BillingTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerCommission" ADD CONSTRAINT "ResellerCommission_payoutId_fkey" FOREIGN KEY ("payoutId") REFERENCES "ResellerPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResellerPayout" ADD CONSTRAINT "ResellerPayout_resellerId_fkey" FOREIGN KEY ("resellerId") REFERENCES "ResellerAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReferralProfile" ADD CONSTRAINT "CustomerReferralProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReferralProfile" ADD CONSTRAINT "CustomerReferralProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReferralRedemption" ADD CONSTRAINT "CustomerReferralRedemption_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "CustomerReferralProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReferralRedemption" ADD CONSTRAINT "CustomerReferralRedemption_referredWorkspaceId_fkey" FOREIGN KEY ("referredWorkspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReferralReward" ADD CONSTRAINT "CustomerReferralReward_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "CustomerReferralRedemption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerReferralReward" ADD CONSTRAINT "CustomerReferralReward_referrerWorkspaceId_fkey" FOREIGN KEY ("referrerWorkspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppActivityLog" ADD CONSTRAINT "AppActivityLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppActivityLog" ADD CONSTRAINT "AppActivityLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlayPurchase" ADD CONSTRAINT "PlayPurchase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingTransaction" ADD CONSTRAINT "BillingTransaction_distributorCouponId_fkey" FOREIGN KEY ("distributorCouponId") REFERENCES "DistributorCoupon"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialOperationIdempotency" ADD CONSTRAINT "FinancialOperationIdempotency_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingTransaction" ADD CONSTRAINT "AccountingTransaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "AccountingTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingIntegrityRun" ADD CONSTRAINT "AccountingIntegrityRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingViolationReport" ADD CONSTRAINT "AccountingViolationReport_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingViolationReport" ADD CONSTRAINT "AccountingViolationReport_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AccountingIntegrityRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceUser" ADD CONSTRAINT "WorkspaceUser_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceUser" ADD CONSTRAINT "WorkspaceUser_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShare" ADD CONSTRAINT "ReportShare_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShare" ADD CONSTRAINT "ReportShare_companyGroupId_fkey" FOREIGN KEY ("companyGroupId") REFERENCES "CompanyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShare" ADD CONSTRAINT "ReportShare_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShareSnapshot" ADD CONSTRAINT "ReportShareSnapshot_reportShareId_fkey" FOREIGN KEY ("reportShareId") REFERENCES "ReportShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShareSnapshot" ADD CONSTRAINT "ReportShareSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportShareSnapshot" ADD CONSTRAINT "ReportShareSnapshot_companyGroupId_fkey" FOREIGN KEY ("companyGroupId") REFERENCES "CompanyGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BusinessProfile" ADD CONSTRAINT "BusinessProfile_primaryBankAccountId_fkey" FOREIGN KEY ("primaryBankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPaymentBehavior" ADD CONSTRAINT "ClientPaymentBehavior_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientPaymentBehavior" ADD CONSTRAINT "ClientPaymentBehavior_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoicePayment" ADD CONSTRAINT "InvoicePayment_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceEvent" ADD CONSTRAINT "InvoiceEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditNote" ADD CONSTRAINT "CreditNote_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceTaxPreference" ADD CONSTRAINT "WorkspaceTaxPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceTaxOverride" ADD CONSTRAINT "WorkspaceTaxOverride_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDecisionAuditLog" ADD CONSTRAINT "TaxDecisionAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDecisionAuditLog" ADD CONSTRAINT "TaxDecisionAuditLog_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxableEvent" ADD CONSTRAINT "TaxableEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxableEvent" ADD CONSTRAINT "TaxableEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxableEvent" ADD CONSTRAINT "TaxableEvent_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDetermination" ADD CONSTRAINT "TaxDetermination_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDetermination" ADD CONSTRAINT "TaxDetermination_taxableEventId_fkey" FOREIGN KEY ("taxableEventId") REFERENCES "TaxableEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxComponentLine" ADD CONSTRAINT "TaxComponentLine_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxComponentLine" ADD CONSTRAINT "TaxComponentLine_taxDeterminationId_fkey" FOREIGN KEY ("taxDeterminationId") REFERENCES "TaxDetermination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxAuditEvent" ADD CONSTRAINT "TaxAuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxOperationIdempotency" ADD CONSTRAINT "TaxOperationIdempotency_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReferenceEntry" ADD CONSTRAINT "TaxReferenceEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxPeriod" ADD CONSTRAINT "TaxPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxForm" ADD CONSTRAINT "TaxForm_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturn" ADD CONSTRAINT "TaxReturn_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturn" ADD CONSTRAINT "TaxReturn_taxPeriodId_fkey" FOREIGN KEY ("taxPeriodId") REFERENCES "TaxPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturn" ADD CONSTRAINT "TaxReturn_taxFormId_fkey" FOREIGN KEY ("taxFormId") REFERENCES "TaxForm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturnFieldValue" ADD CONSTRAINT "TaxReturnFieldValue_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturnFieldValue" ADD CONSTRAINT "TaxReturnFieldValue_taxReturnId_fkey" FOREIGN KEY ("taxReturnId") REFERENCES "TaxReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReadinessCheck" ADD CONSTRAINT "TaxReadinessCheck_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReadinessBlocker" ADD CONSTRAINT "TaxReadinessBlocker_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReadinessBlocker" ADD CONSTRAINT "TaxReadinessBlocker_taxReturnId_fkey" FOREIGN KEY ("taxReturnId") REFERENCES "TaxReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReadinessBlocker" ADD CONSTRAINT "TaxReadinessBlocker_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "TaxReadinessCheck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceIdempotency" ADD CONSTRAINT "InvoiceIdempotency_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceIdempotency" ADD CONSTRAINT "InvoiceIdempotency_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceGenerationDraft" ADD CONSTRAINT "InvoiceGenerationDraft_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceGenerationDraft" ADD CONSTRAINT "InvoiceGenerationDraft_finalizedInvoiceId_fkey" FOREIGN KEY ("finalizedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_recurringId_fkey" FOREIGN KEY ("recurringId") REFERENCES "RecurringExpense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringExpense" ADD CONSTRAINT "RecurringExpense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithholdingEvent" ADD CONSTRAINT "WithholdingEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithholdingEvent" ADD CONSTRAINT "WithholdingEvent_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WithholdingEvent" ADD CONSTRAINT "WithholdingEvent_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCreditEvent" ADD CONSTRAINT "TaxCreditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCreditEvent" ADD CONSTRAINT "TaxCreditEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCreditLedgerEntry" ADD CONSTRAINT "TaxCreditLedgerEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxCreditLedgerEntry" ADD CONSTRAINT "TaxCreditLedgerEntry_taxCreditEventId_fkey" FOREIGN KEY ("taxCreditEventId") REFERENCES "TaxCreditEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxReturnPeriod" ADD CONSTRAINT "TaxReturnPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransaction" ADD CONSTRAINT "BankTransaction_importBatchId_fkey" FOREIGN KEY ("importBatchId") REFERENCES "BankImportBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportBatch" ADD CONSTRAINT "BankImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankImportBatch" ADD CONSTRAINT "BankImportBatch_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseReconciliationCategory" ADD CONSTRAINT "ExpenseReconciliationCategory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationRule" ADD CONSTRAINT "BankReconciliationRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceReconciliationSettings" ADD CONSTRAINT "WorkspaceReconciliationSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionInvoiceSplit" ADD CONSTRAINT "BankTransactionInvoiceSplit_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankTransactionInvoiceSplit" ADD CONSTRAINT "BankTransactionInvoiceSplit_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastSnapshot" ADD CONSTRAINT "CashForecastSnapshot_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastPeriod" ADD CONSTRAINT "CashForecastPeriod_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "CashForecastSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastLineItem" ADD CONSTRAINT "CashForecastLineItem_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "CashForecastPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastAssumption" ADD CONSTRAINT "CashForecastAssumption_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastManualAdjustment" ADD CONSTRAINT "CashForecastManualAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastLineItemPlan" ADD CONSTRAINT "CashForecastLineItemPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashForecastAlertPreference" ADD CONSTRAINT "CashForecastAlertPreference_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Investment" ADD CONSTRAINT "Investment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTemplate" ADD CONSTRAINT "ServiceTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTemplate" ADD CONSTRAINT "ServiceTemplate_nicCodeId_fkey" FOREIGN KEY ("nicCodeId") REFERENCES "NICCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceTemplate" ADD CONSTRAINT "ServiceTemplate_sacCodeId_fkey" FOREIGN KEY ("sacCodeId") REFERENCES "SACCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalEvent" ADD CONSTRAINT "ProposalEvent_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalItem" ADD CONSTRAINT "ProposalItem_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retainer" ADD CONSTRAINT "Retainer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retainer" ADD CONSTRAINT "Retainer_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Retainer" ADD CONSTRAINT "Retainer_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerPriceChange" ADD CONSTRAINT "RetainerPriceChange_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerEvent" ADD CONSTRAINT "RetainerEvent_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerItem" ADD CONSTRAINT "RetainerItem_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerItem" ADD CONSTRAINT "RetainerItem_serviceTemplateId_fkey" FOREIGN KEY ("serviceTemplateId") REFERENCES "ServiceTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetainerItem" ADD CONSTRAINT "RetainerItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeteredUsage" ADD CONSTRAINT "MeteredUsage_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeteredUsage" ADD CONSTRAINT "MeteredUsage_billedInInvoiceId_fkey" FOREIGN KEY ("billedInInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceTaxRegistration" ADD CONSTRAINT "WorkspaceTaxRegistration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingCalendarRule" ADD CONSTRAINT "FilingCalendarRule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FilingCalendarRule" ADD CONSTRAINT "FilingCalendarRule_taxRegistrationId_fkey" FOREIGN KEY ("taxRegistrationId") REFERENCES "WorkspaceTaxRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxObligationPeriod" ADD CONSTRAINT "TaxObligationPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxObligationPeriod" ADD CONSTRAINT "TaxObligationPeriod_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "TaxObligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxObligation" ADD CONSTRAINT "TaxObligation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxObligation" ADD CONSTRAINT "TaxObligation_taxRegistrationId_fkey" FOREIGN KEY ("taxRegistrationId") REFERENCES "WorkspaceTaxRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxObligation" ADD CONSTRAINT "TaxObligation_filingRuleId_fkey" FOREIGN KEY ("filingRuleId") REFERENCES "FilingCalendarRule"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceTask" ADD CONSTRAINT "ComplianceTask_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceTask" ADD CONSTRAINT "ComplianceTask_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "TaxObligation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRateOverride" ADD CONSTRAINT "TaxRateOverride_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRateOverrideAuditLog" ADD CONSTRAINT "TaxRateOverrideAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRateOverrideAuditLog" ADD CONSTRAINT "TaxRateOverrideAuditLog_taxRateOverrideId_fkey" FOREIGN KEY ("taxRateOverrideId") REFERENCES "TaxRateOverride"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FileImportAuditLog" ADD CONSTRAINT "FileImportAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InAppNotification" ADD CONSTRAINT "InAppNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "InvoiceItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_poId_fkey" FOREIGN KEY ("poId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderItem" ADD CONSTRAINT "PurchaseOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_linkedInvoiceId_fkey" FOREIGN KEY ("linkedInvoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrder" ADD CONSTRAINT "ShopOrder_sourceProposalId_fkey" FOREIGN KEY ("sourceProposalId") REFERENCES "Proposal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderItem" ADD CONSTRAINT "ShopOrderItem_shopOrderId_fkey" FOREIGN KEY ("shopOrderId") REFERENCES "ShopOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShopOrderItem" ADD CONSTRAINT "ShopOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalConversion" ADD CONSTRAINT "ProposalConversion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalConversion" ADD CONSTRAINT "ProposalConversion_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalConversion" ADD CONSTRAINT "ProposalConversion_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalConversion" ADD CONSTRAINT "ProposalConversion_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProposalConversion" ADD CONSTRAINT "ProposalConversion_shopOrderId_fkey" FOREIGN KEY ("shopOrderId") REFERENCES "ShopOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingMilestone" ADD CONSTRAINT "BillingMilestone_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingMilestone" ADD CONSTRAINT "BillingMilestone_proposalId_fkey" FOREIGN KEY ("proposalId") REFERENCES "Proposal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingMilestone" ADD CONSTRAINT "BillingMilestone_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RbacAuditLog" ADD CONSTRAINT "RbacAuditLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingServer" ADD CONSTRAINT "MailBillingServer_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingDomain" ADD CONSTRAINT "MailBillingDomain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingDomain" ADD CONSTRAINT "MailBillingDomain_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MailBillingServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingDomain" ADD CONSTRAINT "MailBillingDomain_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingDomain" ADD CONSTRAINT "MailBillingDomain_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingMailbox" ADD CONSTRAINT "MailBillingMailbox_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingMailbox" ADD CONSTRAINT "MailBillingMailbox_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MailBillingServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingMailbox" ADD CONSTRAINT "MailBillingMailbox_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "MailBillingDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingSyncRun" ADD CONSTRAINT "MailBillingSyncRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingSyncRun" ADD CONSTRAINT "MailBillingSyncRun_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MailBillingServer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingPlan" ADD CONSTRAINT "MailBillingPlan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingSubscription" ADD CONSTRAINT "MailBillingSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingSubscription" ADD CONSTRAINT "MailBillingSubscription_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "MailBillingDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingSubscription" ADD CONSTRAINT "MailBillingSubscription_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingSubscription" ADD CONSTRAINT "MailBillingSubscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "MailBillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingSubscription" ADD CONSTRAINT "MailBillingSubscription_retainerId_fkey" FOREIGN KEY ("retainerId") REFERENCES "Retainer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingReviewItem" ADD CONSTRAINT "MailBillingReviewItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingReviewItem" ADD CONSTRAINT "MailBillingReviewItem_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "MailBillingDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingReviewItem" ADD CONSTRAINT "MailBillingReviewItem_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "MailBillingSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingReviewItem" ADD CONSTRAINT "MailBillingReviewItem_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "MailBillingServer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingSettings" ADD CONSTRAINT "MailBillingSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailBillingSettings" ADD CONSTRAINT "MailBillingSettings_defaultPlanId_fkey" FOREIGN KEY ("defaultPlanId") REFERENCES "MailBillingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceModule" ADD CONSTRAINT "WorkspaceModule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportRun" ADD CONSTRAINT "ImportRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentOcrJob" ADD CONSTRAINT "DocumentOcrJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentOcrJob" ADD CONSTRAINT "DocumentOcrJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentOcrJob" ADD CONSTRAINT "DocumentOcrJob_documentFileId_fkey" FOREIGN KEY ("documentFileId") REFERENCES "DocumentFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtractedField" ADD CONSTRAINT "DocumentExtractedField_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtractedField" ADD CONSTRAINT "DocumentExtractedField_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentExtractedField" ADD CONSTRAINT "DocumentExtractedField_documentFileId_fkey" FOREIGN KEY ("documentFileId") REFERENCES "DocumentFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentLink" ADD CONSTRAINT "DocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDocumentLink" ADD CONSTRAINT "TaxDocumentLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxDocumentLink" ADD CONSTRAINT "TaxDocumentLink_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxImportBatch" ADD CONSTRAINT "TaxImportBatch_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxImportRow" ADD CONSTRAINT "TaxImportRow_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxImportRow" ADD CONSTRAINT "TaxImportRow_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "TaxImportBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceDocumentStorage" ADD CONSTRAINT "WorkspaceDocumentStorage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAuditEvent" ADD CONSTRAINT "DocumentAuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAuditEvent" ADD CONSTRAINT "DocumentAuditEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentAuditEvent" ADD CONSTRAINT "DocumentAuditEvent_documentFileId_fkey" FOREIGN KEY ("documentFileId") REFERENCES "DocumentFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Department" ADD CONSTRAINT "Department_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Designation" ADD CONSTRAINT "Designation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_designationId_fkey" FOREIGN KEY ("designationId") REFERENCES "Designation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Employee" ADD CONSTRAINT "Employee_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalance" ADD CONSTRAINT "LeaveBalance_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPeriod" ADD CONSTRAINT "PayrollPeriod_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEmployeeSnapshot" ADD CONSTRAINT "PayrollEmployeeSnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollLineItem" ADD CONSTRAINT "PayrollLineItem_employeeSnapshotId_fkey" FOREIGN KEY ("employeeSnapshotId") REFERENCES "PayrollEmployeeSnapshot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollCostAllocation" ADD CONSTRAINT "PayrollCostAllocation_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "PayrollLineItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPosting" ADD CONSTRAINT "PayrollPosting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPosting" ADD CONSTRAINT "PayrollPosting_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceHoliday" ADD CONSTRAINT "WorkforceHoliday_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkSchedule" ADD CONSTRAINT "WorkSchedule_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollPayComponent" ADD CONSTRAINT "PayrollPayComponent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeCompensation" ADD CONSTRAINT "EmployeeCompensation_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollAdjustment" ADD CONSTRAINT "PayrollAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmployeeLoan" ADD CONSTRAINT "EmployeeLoan_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRemittance" ADD CONSTRAINT "PayrollRemittance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRemittance" ADD CONSTRAINT "PayrollRemittance_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PayrollPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollRemittance" ADD CONSTRAINT "PayrollRemittance_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayrollRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemRemediation" ADD CONSTRAINT "SystemRemediation_errorLogId_fkey" FOREIGN KEY ("errorLogId") REFERENCES "SystemErrorLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstReturn" ADD CONSTRAINT "GstReturn_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstAdjustment" ADD CONSTRAINT "GstAdjustment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gstr2bEntry" ADD CONSTRAINT "Gstr2bEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstDebitNote" ADD CONSTRAINT "GstDebitNote_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstAmendment" ADD CONSTRAINT "GstAmendment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstAdvance" ADD CONSTRAINT "GstAdvance_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstReturnComment" ADD CONSTRAINT "GstReturnComment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GstReminderLog" ADD CONSTRAINT "GstReminderLog_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaComplianceItem" ADD CONSTRAINT "CaComplianceItem_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaRequest" ADD CONSTRAINT "CaRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaRequestMessage" ADD CONSTRAINT "CaRequestMessage_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "CaRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientNote" ADD CONSTRAINT "ClientNote_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportView" ADD CONSTRAINT "ReportView_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

