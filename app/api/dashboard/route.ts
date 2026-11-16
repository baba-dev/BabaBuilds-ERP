import { moduleHref } from "@/lib/module-registry";
import { NextResponse } from "next/server";
import { monthlyEquivalent } from '@/lib/retainers/schedule';
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { INVOICE_STATUS } from "@/lib/invoice-status";
import { serializeMoney, toDecimal } from "@/lib/money";
import { billedInBase } from "@/lib/invoices/summary";
import { effectiveTotal } from "@/lib/invoices/serialize";
import { buildReceivablesSnapshot } from "@/lib/dashboard/attention-receivables";
import { countUrgentItems, redactDashboardPayload } from "@/lib/dashboard/permissions";
import { estimateTax } from "@/lib/tax/engine";
import { getCurrentFinancialYear } from "@/lib/financial-year";
import { getTaxReadinessSummary } from "@/lib/tax/return-prep";
import { checkPermissionsSilent, checkPermissionSilent } from "@/lib/rbac";
import {
  getEnabledModules,
  MODULE_DESCRIPTIONS,
  MODULE_LABELS,
} from "@/lib/modules";
import {
  buildMonthlyChartBuckets,
  resolveMonthlyBucketTimeZone,
} from "./monthly-series";
import { describeKpiPeriod, getFyDateRange } from "./sales-shop-kpi-periods";
import {
  buildDashboardCacheKey,
  getDashboardCacheEntry,
  getDashboardCacheMeta,
  isDashboardCacheEnabled,
  noteDashboardCacheIncident,
  setDashboardCacheEntry,
} from "@/lib/dashboard-cache";


const LOCALE_CURRENCY_AFFECTS_PAYLOAD = false;
const CRITICAL_NOTIFICATION_TYPES = [
  "TAX_ALERT",
  "DEADLINE_ALERT",
  "PAYMENT_REMINDER",
] as const;

type IntegrationStatus = "healthy" | "partial" | "missing";
type SessionWithWorkspace = {
  workspaceId?: string | null;
  user?: { id?: string | null } | null;
};
type IntegrationReadiness = { configured: boolean; status: IntegrationStatus };

const getIntegrationReadiness = (
  keys: Array<string | null | undefined>,
): IntegrationReadiness => {
  const presentKeys = keys.filter((value) =>
    Boolean(value && value.trim()),
  ).length;
  if (presentKeys === keys.length)
    return { configured: true, status: "healthy" };
  if (presentKeys > 0) return { configured: false, status: "partial" };
  return { configured: false, status: "missing" };
};

const asPct = (num: number, den: number) =>
  den <= 0 ? 0 : Math.min(100, Math.round((num / den) * 100));

async function buildDashboardPayload(
  workspaceId: string,
  userId: string | null,
  fy: string,
  _options: { segment?: string | null } = {},
) {
  const queryTimingsMs: Record<string, number> = {};

  const safeTimed = async <T>(
    label: string,
    fallback: T,
    op: () => Promise<T>,
  ): Promise<T> => {
    const startedAt = performance.now();
    try {
      return await op();
    } catch (err) {
      console.warn(
        `[Dashboard] Safe query failed ${label}:`,
        err instanceof Error ? err.message : String(err),
      );
      return fallback;
    } finally {
      queryTimingsMs[label] = Number(
        (performance.now() - startedAt).toFixed(2),
      );
    }
  };
  const timed = async <T,>(label: string, op: () => Promise<T>): Promise<T> => {
    const startedAt = performance.now();
    try {
      return await op();
    } finally {
      queryTimingsMs[label] = Number(
        (performance.now() - startedAt).toFixed(2),
      );
    }
  };

  const now = new Date();
  const thirtyDaysBack = new Date(now);
  thirtyDaysBack.setDate(now.getDate() - 30);

  const sevenDaysOut = new Date(now);
  sevenDaysOut.setDate(now.getDate() + 7);
  const fourteenDaysOut = new Date(now);
  fourteenDaysOut.setDate(now.getDate() + 14);

  const sixtyDaysBack = new Date(now);
  sixtyDaysBack.setDate(now.getDate() - 60);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fyRange = getFyDateRange(fy);

  const canViewTaxReadiness =
    Boolean(userId) &&
    (await checkPermissionSilent(userId!, workspaceId, "tax.readiness.view"));
  const capabilityGrants = userId
    ? await checkPermissionsSilent(userId, workspaceId, [
        "accounting.view",
        "inventory.view",
        "proposals.view",
        "billing.manage",
        "tax.readiness.run",
      ])
    : null;
  const canViewAccounting = capabilityGrants?.["accounting.view"] ?? false;
  const canViewOperations = capabilityGrants?.["inventory.view"] ?? false;
  const canViewSales = capabilityGrants?.["proposals.view"] ?? false;
  const canManageBilling = capabilityGrants?.["billing.manage"] ?? false;
  const canRunTaxReadiness = capabilityGrants?.["tax.readiness.run"] ?? false;
  const enabledModules = await getEnabledModules(workspaceId);

  const [
    workspace,
    workspaceOwner,
    currentUser,
    profile,
    invoices,
    openInvoiceAgingBuckets,
    recentInvoices,
    investmentAggregate,
    expenses,
    bankTransactionGroups,
    clientCount,
  ] = await Promise.all([
    timed("workspace.core", () =>
      prisma.workspace.findUnique({
        where: { id: workspaceId },
      }),
    ),

    timed("workspace.owner", () =>
      prisma.workspaceUser.findFirst({
        where: { workspaceId, role: "OWNER" },
        select: { user: { select: { timeZone: true } } },
      }),
    ),

    userId
      ? timed("user.current", () =>
          prisma.user.findUnique({
            where: { id: userId },
            select: { timeZone: true },
          }),
        )
      : Promise.resolve(null),

    timed("profile.business", async () => {
      const [profilePublic, secretFlagsRows] = await Promise.all([
        prisma.businessProfile.findUnique({
          where: { workspaceId },
          select: {
            companyName: true,
            razorpayKeyId: true,
            stripePublishableKey: true,
            smtpHost: true,
            smtpPort: true,
            smtpUser: true,
            smtpFromEmail: true,
            shopEnabled: true,
          },
        }),
        prisma.$queryRaw<
          Array<{
            hasGroqApiKey: number;
            hasRazorpayKeySecret: number;
            hasStripeSecretKey: number;
            hasSmtpPassword: number;
          }>
        >`
          SELECT
            CASE WHEN "groqApiKey" IS NOT NULL AND "groqApiKey" != '' THEN 1 ELSE 0 END AS "hasGroqApiKey",
            CASE WHEN "razorpayKeySecret" IS NOT NULL AND "razorpayKeySecret" != '' THEN 1 ELSE 0 END AS "hasRazorpayKeySecret",
            CASE WHEN "stripeSecretKey" IS NOT NULL AND "stripeSecretKey" != '' THEN 1 ELSE 0 END AS "hasStripeSecretKey",
            CASE WHEN "smtpPassword" IS NOT NULL AND "smtpPassword" != '' THEN 1 ELSE 0 END AS "hasSmtpPassword"
          FROM "BusinessProfile"
          WHERE "workspaceId" = ${workspaceId}
          LIMIT 1
        `,
      ]);
      const secretFlags = secretFlagsRows[0];
      return {
        ...profilePublic,
        hasGroqApiKey: Boolean(secretFlags?.hasGroqApiKey),
        hasRazorpayKeySecret: Boolean(secretFlags?.hasRazorpayKeySecret),
        hasStripeSecretKey: Boolean(secretFlags?.hasStripeSecretKey),
        hasSmtpPassword: Boolean(secretFlags?.hasSmtpPassword),
      };
    }),

    timed("invoices.fy", () =>
      prisma.invoice.findMany({
        where: {
          workspaceId,
          status: { not: "VOID" },
          ...(fyRange
            ? { invoiceDate: { gte: fyRange.start, lt: fyRange.endExclusive } }
            : { financialYear: fy }),
        },
        select: {
          status: true,
          invoiceDate: true,
          totalAmount: true,
          grandTotal: true,
          baseGrandTotal: true,
          exchangeRate: true,
          amountReceived: true,
        },
        orderBy: { invoiceDate: "asc" },
      }),
    ),

    timed("invoices.attention_buckets", async () => {
      // Every open invoice, whatever its financial year: money owed does not expire with the FY.
      const openInvoices = await prisma.invoice.findMany({
        where: { workspaceId, status: { notIn: ["PAID", "VOID"] } },
        select: {
          id: true,
          invoiceNumber: true,
          clientName: true,
          invoiceDate: true,
          dueDate: true,
          totalAmount: true,
          grandTotal: true,
          amountReceived: true,
          exchangeRate: true,
        },
        orderBy: { invoiceDate: "desc" },
        take: 5000,
      });

      return buildReceivablesSnapshot(openInvoices, now);
    }),

    safeTimed("invoices.recent", [], () =>
      prisma.invoice.findMany({
        where: { workspaceId },
        orderBy: { invoiceDate: "desc" },
        take: 6,
        select: {
          id: true,
          invoiceNumber: true,
          invoiceDate: true,
          dueDate: true,
          clientName: true,
          clientId: true,
          status: true,
          currency: true,
          totalAmount: true,
          grandTotal: true,
          amountReceived: true,
          pdfPath: true,
        },
      }),
    ),

    timed("investments.sum", () =>
      prisma.investment.aggregate({
        where: { workspaceId },
        _sum: { amount: true },
      }),
    ),

    timed("expenses.fy", () =>
      prisma.expense.findMany({
        where: {
          workspaceId,
          approvalStatus: "APPROVED",
          ...(fyRange
            ? { date: { gte: fyRange.start, lt: fyRange.endExclusive } }
            : {}),
        },
        select: { date: true, amount: true },
      }),
    ),

    timed("bank.grouped", () =>
      prisma.bankTransaction.groupBy({
        where: { workspaceId },
        by: ["isReconciled"],
        _count: { _all: true },
      }),
    ),

    timed("clients.count", () =>
      prisma.client.count({
        where: { workspaceId, isWalkIn: false, archivedAt: null },
      }),
    ),
  ]);

  const [
    retainers,
    proposalStatusGroups,
    taskCount,
    openTaskCount,
    urgentTaskCount,
    blockedTaskCount,
    publishedProducts,
    lowStockProducts,
    openPurchaseOrders,
    inventoryMovements,
  ] = await Promise.all([
    timed("retainers.active", () =>
      prisma.retainer.findMany({
        where: { workspaceId, status: "ACTIVE" },
        select: {
          id: true,
          name: true,
          serviceName: true,
          client: { select: { name: true } },
          items: { select: { quantity: true, unitPrice: true } },
          frequency: true,
          exchangeRate: true,
          nextBillingDate: true,
          createdAt: true,
        },
      }),
    ),

    timed("proposals.grouped", () =>
      prisma.proposal.groupBy({
        where: {
          workspaceId,
          ...(fyRange
            ? { dateCreated: { gte: fyRange.start, lt: fyRange.endExclusive } }
            : {}),
        },
        by: ["status"],
        _count: { _all: true },
      }),
    ),

    timed("tasks.total", () =>
      prisma.task.count({
        where: { workspaceId },
      }),
    ),

    timed("tasks.open", () =>
      prisma.task.count({
        where: { workspaceId, status: { not: "DONE" } },
      }),
    ),

    timed("tasks.urgent", () =>
      prisma.task.count({
        where: {
          workspaceId,
          status: { not: "DONE" },
          OR: [
            { dueDate: { lte: sevenDaysOut } },
            { status: { contains: "URGENT" } },
          ],
        },
      }),
    ),

    timed("tasks.blocked", () =>
      prisma.task.count({
        where: { workspaceId, status: { contains: "BLOCK" } },
      }),
    ),

    timed("products.published", () =>
      prisma.product.count({
        where: { workspaceId, showInShop: true },
      }),
    ),

    timed("products.low_stock", () =>
      prisma.product.count({
        // Same rule as the Inventory Hub: at or below the product's own safety stock.
        where: {
          workspaceId,
          archivedAt: null,
          currentStock: { lte: prisma.product.fields.safetyStock },
        },
      }),
    ),

    timed("purchase_orders.open", () =>
      prisma.purchaseOrder.count({
        where: { workspaceId, status: { in: ["DRAFT", "SENT"] } },
      }),
    ),

    timed("inventory.recent", () =>
      prisma.inventoryMovement.findMany({
        where: { workspaceId },
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ),
  ]);

  const [
    shopOrderStatusGroups,
    paidOrderRevenueThisMonth,
    paidOrderRevenuePreviousMonth,
    ordersLast30Days,
    ordersPrior30Days,
    topProductOrderGroups,
    recentShopOrders,
    integrityRuns,
    violationCount,
    criticalViolationCount,
  ] = await Promise.all([
    timed("orders.status_group", () =>
      prisma.shopOrder.groupBy({
        where: {
          workspaceId,
          ...(fyRange
            ? { createdAt: { gte: fyRange.start, lt: fyRange.endExclusive } }
            : {}),
        },
        by: ["status"],
        _count: { _all: true },
      }),
    ),

    timed("orders.revenue_month", () =>
      prisma.shopOrder.aggregate({
        where: {
          workspaceId,
          status: { in: ["PAID", "SHIPPED", "FULFILLED"] },
          createdAt: { gte: monthStart, lt: nextMonthStart },
        },
        _sum: { amount: true },
      }),
    ),

    timed("orders.revenue_prev_month", () =>
      prisma.shopOrder.aggregate({
        where: {
          workspaceId,
          status: { in: ["PAID", "SHIPPED", "FULFILLED"] },
          createdAt: { gte: previousMonthStart, lt: monthStart },
        },
        _sum: { amount: true },
      }),
    ),

    timed("orders.last_30d", () =>
      prisma.shopOrder.count({
        where: { workspaceId, createdAt: { gte: thirtyDaysBack } },
      }),
    ),

    timed("orders.prior_30d", () =>
      prisma.shopOrder.count({
        where: {
          workspaceId,
          createdAt: { gte: sixtyDaysBack, lt: thirtyDaysBack },
        },
      }),
    ),

    timed("orders.top_products", () =>
      prisma.shopOrderItem.groupBy({
        where: {
          shopOrder: {
            workspaceId,
            ...(fyRange
              ? { createdAt: { gte: fyRange.start, lt: fyRange.endExclusive } }
              : {}),
          },
        },
        by: ["productId", "productName"],
        _count: { _all: true },
        _sum: { lineTotal: true },
      }),
    ),

    timed("orders.recent", () =>
      prisma.shopOrder.findMany({
        where: { workspaceId },
        include: { items: { select: { productName: true }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ),

    timed("integrity.last_run", () =>
      prisma.accountingIntegrityRun.findMany({
        where: { workspaceId },
        orderBy: { startedAt: "desc" },
        take: 1,
      }),
    ),

    timed("integrity.violations_total", () =>
      prisma.accountingViolationReport.count({
        where: { workspaceId },
      }),
    ),

    timed("integrity.violations_critical", () =>
      prisma.accountingViolationReport.count({
        where: { workspaceId, severity: "CRITICAL" },
      }),
    ),
  ]);

  const [
    taxOverrides,
    taxAudits,
    fileImportFailures,
    activities,
    notifications,
    taxReadinessSummary,
  ] = await Promise.all([
    timed("tax.overrides", () =>
      prisma.taxRateOverride.count({
        where: { workspaceId, isActive: true },
      }),
    ),

    safeTimed("tax.audits_recent", [], () =>
      prisma.taxDecisionAuditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
    ),

    safeTimed("imports.failed", 0, () =>
      prisma.fileImportAuditLog.count({
        where: { workspaceId, status: { in: ["FAILED", "ERROR"] } },
      }),
    ),

    safeTimed("activity.recent", [], () =>
      prisma.appActivityLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
    ),

    userId
      ? timed("notifications.critical_unread", () =>
          prisma.inAppNotification.count({
            where: {
              userId,
              workspaceId,
              isRead: false,
              eventType: {
                in: CRITICAL_NOTIFICATION_TYPES as unknown as string[],
              },
            },
          }),
        )
      : Promise.resolve(0),

    safeTimed(
      "tax.readiness_summary",
      {
        hasReturns: false,
        totalOpenBlockers: 0,
        openBlockersBySeverity: { INFO: 0, WARNING: 0, CRITICAL: 0 },
        nextReturn: null,
        recentReturns: [],
      },
      () =>
        getTaxReadinessSummary(workspaceId, {
          includeSummary: canViewTaxReadiness,
        }),
    ),
  ]);

  // Invoices can be raised in any currency; every figure below is in the workspace base currency.
  const billedRevenue = invoices.reduce(
    (sum, inv) => sum.plus(billedInBase(inv)),
    new Prisma.Decimal(0),
  );

  const expensesTotal = expenses.reduce(
    (sum, row) => sum.plus(toDecimal(row.amount)),
    new Prisma.Decimal(0),
  );

  const liquidAssets = toDecimal(investmentAggregate._sum.amount ?? 0);

  const shopOrderByStatus = shopOrderStatusGroups.reduce<
    Record<string, number>
  >((acc, group) => {
    const status = String(group.status || "PENDING").toUpperCase();
    acc[status] = group._count._all;
    return acc;
  }, {});

  const paidOrders = (shopOrderByStatus.PAID ?? 0) + (shopOrderByStatus.SHIPPED ?? 0) + (shopOrderByStatus.FULFILLED ?? 0);
  const pendingOrders = shopOrderByStatus.PENDING ?? 0;
  const failedOrders = shopOrderByStatus.FAILED ?? 0;

  const collected = invoices.reduce(
    (sum, inv) =>
      sum.plus(
        Prisma.Decimal.min(effectiveTotal(inv), toDecimal(inv.amountReceived ?? 0)).mul(
          toDecimal(inv.exchangeRate),
        ),
      ),
    new Prisma.Decimal(0),
  );
  const receivables = invoices.reduce(
    (sum, inv) =>
      sum.plus(
        Prisma.Decimal.max(
          new Prisma.Decimal(0),
          effectiveTotal(inv).minus(toDecimal(inv.amountReceived ?? 0)),
        ).mul(toDecimal(inv.exchangeRate)),
      ),
    new Prisma.Decimal(0),
  );

  const presumptiveIncome = billedRevenue.mul(0.5);
  const taxEstimate = estimateTax({
    countryCode: workspace?.countryCode ?? "IN",
    revenue: presumptiveIncome,
    deductions: new Prisma.Decimal(0),
    serviceScope: "dashboard_summary",
    customerScope: "workspace",
    asOfDate: now,
  });

  // Monthly recurring revenue: per-cycle amount normalised to a month and converted to the base currency.
  const retainerMonthly = (ret: (typeof retainers)[number]) =>
    monthlyEquivalent(
      ret.items?.reduce((acc: number, i) => acc + i.quantity * Number(i.unitPrice), 0) || 0,
      ret.frequency,
    ) * Number(ret.exchangeRate);
  const recurringRevenue = retainers.reduce(
    (sum, ret) => sum.plus(toDecimal(retainerMonthly(ret))),
    new Prisma.Decimal(0),
  );
  const arr = recurringRevenue.mul(12);

  const totalBankTransactions = bankTransactionGroups.reduce(
    (sum, row) => sum + row._count._all,
    0,
  );
  const unreconciledTransactions = bankTransactionGroups
    .filter((row) => !row.isReconciled)
    .reduce((sum, row) => sum + row._count._all, 0);
  const reconciliationProgress = asPct(
    totalBankTransactions - unreconciledTransactions,
    totalBankTransactions,
  );

  const receivablesSnapshot = openInvoiceAgingBuckets;
  const { overdueReceivables, outstandingReceivables } = receivablesSnapshot;

  const retainersDueSoon = retainers.filter(
    (ret) => ret.nextBillingDate >= now && ret.nextBillingDate <= sevenDaysOut,
  ).length;

  const proposalCounts = proposalStatusGroups.reduce<Record<string, number>>(
    (acc, group) => {
      acc[String(group.status || "DRAFT").toUpperCase()] = group._count._all;
      return acc;
    },
    {},
  );

  const acceptedUninvoicedProposals = proposalCounts.ACCEPTED ?? 0;
  const urgentTasks = urgentTaskCount;
  const blockedTasks = blockedTaskCount;

  const criticalViolations = criticalViolationCount;

  const funnel = {
    draft: proposalCounts.DRAFT ?? 0,
    sent: proposalCounts.SENT ?? 0,
    viewed: proposalCounts.VIEWED ?? 0,
    accepted: acceptedUninvoicedProposals,
    invoiced: proposalCounts.INVOICED ?? 0,
    declined: proposalCounts.DECLINED ?? 0,
  };

  const conversion = asPct(
    paidOrders,
    Math.max(1, paidOrders + pendingOrders + failedOrders),
  );

  const topProductIds = topProductOrderGroups
    .filter((group) => Boolean(group.productId))
    .sort(
      (a, b) =>
        Number((b._count as { _all?: number } | undefined)?._all ?? 0) -
        Number((a._count as { _all?: number } | undefined)?._all ?? 0),
    )
    .slice(0, 4)
    .map((group) => group.productId as string);

  const topProductsData = topProductIds.length
    ? await timed("orders.top_product_names", () =>
        prisma.product.findMany({
          where: { id: { in: topProductIds } },
          select: { id: true, name: true },
        }),
      )
    : [];

  const topProductNameById = new Map(
    topProductsData.map((row) => [row.id, row.name]),
  );

  const topProducts = topProductOrderGroups
    .sort(
      (a, b) =>
        Number((b._count as { _all?: number } | undefined)?._all ?? 0) -
        Number((a._count as { _all?: number } | undefined)?._all ?? 0),
    )
    .slice(0, 4)
    .map((group) => ({
      productName:
        (group.productId && topProductNameById.get(group.productId)) ??
        "Unknown product",
      orderCount: Number(
        (group._count as { _all?: number } | undefined)?._all ?? 0,
      ),
      revenue: serializeMoney(
        toDecimal(
          (
            group._sum as
              | { lineTotal?: number | string | Prisma.Decimal | null }
              | undefined
          )?.lineTotal ?? 0,
        ),
      ),
    }));

  const bucketTimeZone = resolveMonthlyBucketTimeZone(
    workspaceOwner?.user?.timeZone ?? currentUser?.timeZone ?? null,
  );

  const ensure12Months: { date: Date; value: number }[] = [];
  if (fyRange) {
    for (let i = 0; i < 12; i++) {
      const d = new Date(fyRange.start);
      d.setMonth(d.getMonth() + i);
      ensure12Months.push({ date: d, value: 0 });
    }
  }

  const generatedMrrRows = retainers.flatMap((ret) => {
    const amount = retainerMonthly(ret);
    if (!fyRange || !ret.createdAt) return [{ date: now, value: amount }];
    const activeMonths = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(fyRange.start);
      d.setMonth(fyRange.start.getMonth() + i);
      const isStartMonth =
        d.getFullYear() === new Date(ret.createdAt).getFullYear() &&
        d.getMonth() === new Date(ret.createdAt).getMonth();
      if (isStartMonth || new Date(ret.createdAt) < fyRange.start) {
        activeMonths.push({ date: d, value: amount });
      }
    }
    return activeMonths;
  });

  const monthlySeries = buildMonthlyChartBuckets({
    revenueRows: invoices.map((inv) => ({
      date: new Date(inv.invoiceDate),
      value: billedInBase(inv),
    })),
    expenseRows: expenses.map((expense) => ({
      date: new Date(expense.date),
      value: expense.amount,
    })),
    mrrRows: [...ensure12Months, ...generatedMrrRows],
    bucketTimeZone,
  });

  const integrationReadiness = {
    groq: getIntegrationReadiness([profile?.hasGroqApiKey ? "SET" : null]),
    payment:
      getIntegrationReadiness([
        profile?.razorpayKeyId,
        profile?.hasRazorpayKeySecret ? "SET" : null,
      ]).status === "healthy" ||
      getIntegrationReadiness([
        profile?.stripePublishableKey,
        profile?.hasStripeSecretKey ? "SET" : null,
      ]).status === "healthy"
        ? { configured: true, status: "healthy" as IntegrationStatus }
        : getIntegrationReadiness([
            profile?.razorpayKeyId,
            profile?.hasRazorpayKeySecret ? "SET" : null,
            profile?.stripePublishableKey,
            profile?.hasStripeSecretKey ? "SET" : null,
          ]),
    smtp: getIntegrationReadiness([
      profile?.smtpHost,
      profile?.smtpPort ? String(profile.smtpPort) : null,
      profile?.smtpUser,
      profile?.hasSmtpPassword ? "SET" : null,
      profile?.smtpFromEmail,
    ]),
    shop: profile?.shopEnabled
      ? { configured: true, status: "healthy" as IntegrationStatus }
      : { configured: false, status: "missing" as IntegrationStatus },
  };

  const integrationSummary = Object.values(integrationReadiness).reduce(
    (acc, item) => {
      acc[item.status] += 1;
      return acc;
    },
    { healthy: 0, partial: 0, missing: 0 },
  );

  // One checklist drives both the progress figure and the "what is left" list, so they can never disagree.
  const setupSteps = [
    { id: "profile", done: Boolean(workspace?.isSetupComplete && profile?.companyName) },
    { id: "client", done: clientCount > 0 },
    { id: "invoice", done: recentInvoices.length > 0 },
    { id: "payments", done: integrationReadiness.payment.status === "healthy" },
    { id: "email", done: integrationReadiness.smtp.status === "healthy" },
  ];
  const setupCompletion = asPct(
    setupSteps.filter((step) => step.done).length,
    setupSteps.length,
  );

  const receivablesAging = [
    { bucket: "not_due", value: serializeMoney(receivablesSnapshot.aging.notDue) },
    { bucket: "1_30", value: serializeMoney(receivablesSnapshot.aging.days1to30) },
    { bucket: "31_60", value: serializeMoney(receivablesSnapshot.aging.days31to60) },
    { bucket: "61_plus", value: serializeMoney(receivablesSnapshot.aging.days61plus) },
  ];

  const retainerCycleAmount = (ret: (typeof retainers)[number]) =>
    (ret.items?.reduce((acc: number, i) => acc + i.quantity * Number(i.unitPrice), 0) || 0) *
    Number(ret.exchangeRate);

  const nextTaxReturn = taxReadinessSummary.nextReturn as
    | { id: string; formCode: string; periodCode: string; dueDate: Date | string | null; status: string }
    | null;
  const nextTaxDue = nextTaxReturn?.dueDate ? new Date(nextTaxReturn.dueDate) : null;

  // What is coming in the next two weeks, across modules, soonest first.
  const upcoming = [
    ...receivablesSnapshot.dueSoon.map((item) => ({
      kind: "invoice_due" as const,
      id: item.id,
      title: item.clientName,
      reference: item.invoiceNumber,
      date: item.dueDate.toISOString(),
      amount: serializeMoney(item.outstanding),
      href: `/income?invoice=${item.id}`,
    })),
    ...retainers
      .filter((ret) => ret.nextBillingDate >= now && ret.nextBillingDate <= fourteenDaysOut)
      .map((ret) => ({
        kind: "retainer_billing" as const,
        id: ret.id,
        title: ret.client?.name ?? "",
        reference: ret.name ?? ret.serviceName ?? "",
        date: ret.nextBillingDate.toISOString(),
        amount: serializeMoney(retainerCycleAmount(ret)),
        href: `/retainers?retainer=${ret.id}`,
      })),
    ...(nextTaxReturn && nextTaxDue && nextTaxDue >= now && nextTaxReturn.status !== "FILED"
      ? [
          {
            kind: "tax_return" as const,
            id: nextTaxReturn.id,
            title: nextTaxReturn.formCode,
            reference: nextTaxReturn.periodCode,
            date: nextTaxDue.toISOString(),
            amount: null,
            href: "/tax",
          },
        ]
      : []),
  ]
    .sort((x, y) => x.date.localeCompare(y.date))
    .slice(0, 6);

  const healthWarnings = [
    ...(integrationSummary.missing > 0
      ? [{ label: "Missing integrations", severity: "warning" as const }]
      : []),
    ...(criticalViolations > 0
      ? [
          {
            label: "Critical accounting violations",
            severity: "critical" as const,
          },
        ]
      : []),
    ...(fileImportFailures > 0
      ? [
          {
            label: "Failed imports require review",
            severity: "warning" as const,
          },
        ]
      : []),
  ];

  const lastRun = integrityRuns[0];
  const shopRevenueThisMonth = toDecimal(
    paidOrderRevenueThisMonth._sum.amount ?? 0,
  );
  const shopRevenuePreviousMonth = toDecimal(
    paidOrderRevenuePreviousMonth._sum.amount ?? 0,
  );

  const revenueDeltaPct = shopRevenuePreviousMonth.gt(0)
    ? Number(
        shopRevenueThisMonth
          .minus(shopRevenuePreviousMonth)
          .div(shopRevenuePreviousMonth)
          .mul(100)
          .toFixed(1),
      )
    : null;

  const orderDeltaPct =
    ordersPrior30Days > 0
      ? Number(
          (
            ((ordersLast30Days - ordersPrior30Days) / ordersPrior30Days) *
            100
          ).toFixed(1),
        )
      : null;

  const salesAndShopKpiPeriods = {
    proposalFunnel: describeKpiPeriod({ type: "FY", now, fy, fyRange }),
    acceptedAwaitingInvoicing: describeKpiPeriod({
      type: "FY",
      now,
      fy,
      fyRange,
    }),
    publicShopOrders: describeKpiPeriod({ type: "ALL_TIME", now, fy, fyRange }),
    shopOrderConversion: describeKpiPeriod({
      type: "ALL_TIME",
      now,
      fy,
      fyRange,
    }),
    topProducts: describeKpiPeriod({ type: "ALL_TIME", now, fy, fyRange }),
    shopRevenueThisMonth: describeKpiPeriod({ type: "FY", now, fy, fyRange }),
    ordersLast30Days: describeKpiPeriod({
      type: "ROLLING_30D",
      now,
      fy,
      fyRange,
    }),
  };
  const optionalModules = Array.from(enabledModules).map((moduleKey) => ({
    moduleKey,
    label: MODULE_LABELS[moduleKey],
    description: MODULE_DESCRIPTIONS[moduleKey],
    href: moduleHref(moduleKey),
  }));

  const attentionCounts = {
    overdueReceivables,
    unreconciledTransactions,
    acceptedUninvoicedProposals,
    urgentTasks,
    criticalNotifications: notifications,
    criticalViolations,
    failedImports: fileImportFailures,
    lowStock: lowStockProducts,
  };

  const currentMonthId = new Intl.DateTimeFormat("en-CA", {
    timeZone: bucketTimeZone,
    year: "numeric",
    month: "2-digit",
  }).format(now);

  const payload = {
    health: {
      setupCompletion,
      setupComplete: setupSteps.every((step) => step.done),
      setupSteps,
      subscriptionState: workspace?.subscriptionStatus ?? "FREE",
      trialEndsAt: workspace?.subscriptionEndsAt?.toISOString() ?? null,
      planTier: workspace?.planTier ?? "FREE",
      integrationReadiness: {
        integrations: integrationReadiness,
        summary: integrationSummary,
      },
      complianceWarnings: healthWarnings,
    },

    attention: {
      totalUrgent: countUrgentItems(attentionCounts),
      ...attentionCounts,
      outstandingReceivables,
      dueSoonReceivables: receivablesSnapshot.dueSoonReceivables,
      retainersDueSoon,
      complianceIssues: violationCount,
    },

    receivables: {
      outstandingAmount: serializeMoney(receivablesSnapshot.outstandingAmount),
      overdueAmount: serializeMoney(receivablesSnapshot.overdueAmount),
      aging: receivablesAging,
      watchlist: receivablesSnapshot.watchlist.map((item) => ({
        id: item.id,
        invoiceNumber: item.invoiceNumber,
        clientName: item.clientName,
        outstanding: serializeMoney(item.outstanding),
        dueDate: item.dueDate.toISOString(),
        daysOverdue: item.daysOverdue,
      })),
    },

    financialPulse: {
      billedRevenue: serializeMoney(billedRevenue),
      collected: serializeMoney(collected),
      receivables: serializeMoney(receivables),
      expenses: serializeMoney(expensesTotal),
      netIncome: serializeMoney(billedRevenue.minus(expensesTotal)),
      estimatedTax: taxEstimate.amount,
      liquidAssets: serializeMoney(liquidAssets),
      recurringRevenue: serializeMoney(recurringRevenue),
      arr: serializeMoney(arr),
      reconciliationProgress,
      bankTransactions: totalBankTransactions,
    },

    salesAndShop: {
      proposalFunnel: funnel,
      acceptedAwaitingInvoicing: acceptedUninvoicedProposals,
      shopEnabled: Boolean(profile?.shopEnabled),
      publicShopOrders: {
        total: Object.values(shopOrderByStatus).reduce(
          (sum, value) => sum + value,
          0,
        ),
        paid: paidOrders,
        pending: pendingOrders,
        failed: failedOrders,
      },
      shopOrderConversion: conversion,
      shopRevenueThisMonth: serializeMoney(shopRevenueThisMonth),
      shopRevenuePreviousMonth: serializeMoney(shopRevenuePreviousMonth),
      revenueChangeVsPriorMonthPct: revenueDeltaPct,
      ordersLast30Days,
      ordersPrior30Days,
      orderChangeVsPrior30DaysPct: orderDeltaPct,
      publishedProducts,
      topProducts,
      kpiPeriods: salesAndShopKpiPeriods,
      recentShopOrders: recentShopOrders.map((order) => ({
        id: order.id,
        itemSummary: order.items[0]?.productName ?? "",
        buyerName: order.buyerName,
        amount: serializeMoney(order.amount),
        status: order.status,
        createdAt: order.createdAt,
      })),
    },

    operations: {
      hasOperationalData:
        lowStockProducts > 0 || openPurchaseOrders > 0 || taskCount > 0,
      lowStockCount: lowStockProducts,
      openPurchaseOrders,
      recentInventoryMovements: inventoryMovements.map((movement) => ({
        id: movement.id,
        productName: movement.product.name,
        quantity: movement.quantity,
        type: movement.type,
        createdAt: movement.createdAt,
      })),
      openTasks: openTaskCount,
      blockedTasks,
    },

    trust: {
      integrityStatus: lastRun?.status ?? "NOT_RUN",
      lastIntegrityRunAt: lastRun?.completedAt ?? lastRun?.startedAt ?? null,
      violationCount,
      criticalViolations,
      taxOverrideCount: taxOverrides,
      recentTaxAudits: taxAudits.map((audit) => ({
        id: audit.id,
        source: audit.resolutionSource,
        createdAt: audit.createdAt,
      })),
      taxOpenBlockers: taxReadinessSummary.totalOpenBlockers,
      taxCriticalBlockers: taxReadinessSummary.openBlockersBySeverity.CRITICAL ?? 0,
    },

    upcoming,

    activity: activities.map((item) => ({
      id: item.id,
      action: item.action,
      entityType: item.entityType ?? null,
      status: item.status,
      createdAt: item.createdAt,
      actor: item.actorEmail ?? null,
    })),

    charts: {
      bucketTimeZone,
      currentMonthId,
      revenueVsExpense: monthlySeries.map((row) => ({
        monthId: row.monthId,
        name: row.label,
        revenue: serializeMoney(row.revenue),
        expenses: serializeMoney(row.expenses),
      })),
      recurringRevenue: monthlySeries.map((row) => ({
        monthId: row.monthId,
        name: row.label,
        mrr: serializeMoney(row.mrr),
      })),
      reconciliation: [
        {
          name: "Bank feed",
          reconciled: totalBankTransactions - unreconciledTransactions,
          unreconciled: unreconciledTransactions,
        },
      ],
      proposalFunnel: [
        { stage: "Draft", value: funnel.draft },
        { stage: "Sent", value: funnel.sent },
        { stage: "Viewed", value: funnel.viewed },
        { stage: "Accepted", value: funnel.accepted },
        { stage: "Invoiced", value: funnel.invoiced },
        { stage: "Declined", value: funnel.declined },
      ],
      shopOrderHealth: [
        { status: "Paid", value: paidOrders },
        { status: "Pending", value: pendingOrders },
        { status: "Failed", value: failedOrders },
      ],
    },

    recentInvoices: recentInvoices.map((invoice) => ({
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate.toISOString(),
      dueDate: invoice.dueDate ? invoice.dueDate.toISOString() : null,
      clientName: invoice.clientName,
      clientId: invoice.clientId,
      status: invoice.status || INVOICE_STATUS.PENDING,
      currency: invoice.currency,
      totalAmount: serializeMoney(effectiveTotal(invoice)),
      amountReceived: serializeMoney(invoice.amountReceived ?? 0),
      pdfPath: invoice.pdfPath,
    })),
    permissions: {
      canViewAccounting,
      canViewOperations,
      canViewSales,
      canViewCharts: canViewAccounting,
      canViewRecentLedger: canViewAccounting,
      canViewTrust: canViewAccounting,
      canRunIntegrityScan: canRunTaxReadiness,
      canManageBilling,
    },
    workspace: {
      name: profile?.companyName || workspace?.name || "",
      baseCurrency: workspace?.baseCurrency ?? "INR",
    },
    optionalModules,

    telemetry: {
      queryTimingsMs,
    },

    countryCode: workspace?.countryCode ?? "IN",
  };

  return redactDashboardPayload(payload, {
    canViewAccounting,
    canViewSales,
    canViewOperations,
  });
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as SessionWithWorkspace | null)?.workspaceId;
    const userId = (session as SessionWithWorkspace | null)?.user?.id ?? null;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_UNAUTHORIZED" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    let fy = searchParams.get("fy") || getCurrentFinancialYear();

    if (!getFyDateRange(fy)) {
      fy = getCurrentFinancialYear();
    }

    const locale = searchParams.get("locale");
    const currency = searchParams.get("currency");
    const segment = searchParams.get("segment");

    const cacheKey = buildDashboardCacheKey({
      workspaceId,
      userId,
      fy,
      locale,
      currency,
      segment: segment || "full",
      localeCurrencyAffectsPayload: LOCALE_CURRENCY_AFFECTS_PAYLOAD,
    });

    // Client pages currently use `cache: "no-store"` so Next-level caching is bypassed.
    // Use the in-process dashboard cache to avoid repeated recomputation under concurrent staff traffic.
    if (isDashboardCacheEnabled()) {
      try {
        const cached = getDashboardCacheEntry(cacheKey);

        if (cached) {
          const cacheMeta = getDashboardCacheMeta(cached);
          return NextResponse.json(cached.payload, {
            headers: {
              "X-Dashboard-Cache": "HIT",
              "X-Dashboard-Cache-Age": String(cacheMeta.ageSeconds),
              "X-Dashboard-Cache-TTL": String(cacheMeta.ttlSeconds),
              "Cache-Control": "private, max-age=0, must-revalidate",
            },
          });
        }

        const payload = await buildDashboardPayload(workspaceId, userId, fy, {
          segment,
        });

        const entry = setDashboardCacheEntry(cacheKey, payload);
        const cacheMeta = getDashboardCacheMeta(entry);

        return NextResponse.json(payload, {
          headers: {
            "X-Dashboard-Cache": "MISS",
            "X-Dashboard-Cache-Age": String(cacheMeta.ageSeconds),
            "X-Dashboard-Cache-TTL": String(cacheMeta.ttlSeconds),
            "Cache-Control": "private, max-age=0, must-revalidate",
          },
        });
      } catch (cacheError) {
        noteDashboardCacheIncident("cacheErrors", {
          workspaceId,
          fy,
          cacheKey,
          error: String(cacheError),
        });
        console.error("Dashboard cache error:", cacheError);
      }
    }

    const payload = await buildDashboardPayload(workspaceId, userId, fy, {
      segment,
    });

    return NextResponse.json(payload, {
      headers: {
        "X-Dashboard-Cache": "BYPASS",
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (error) {
    console.error("Dashboard Data Error:", error);
    return NextResponse.json(
      {
        error: "Failed to aggregate dashboard data",
        code: "DASHBOARD_AGGREGATION_FAILED",
      },
      { status: 500 },
    );
  }
}
