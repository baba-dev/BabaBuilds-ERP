import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { INVOICE_STATUS } from "@/lib/invoice-status";
import { serializeMoney, toDecimal } from "@/lib/money";
import { summarizeReceivablesForAttention } from "@/lib/dashboard/attention-receivables";
import { getInvoiceBilledAmount, sumInvoiceBilledAmount } from "@/lib/invoice/totals";
import { estimateTax } from "@/lib/tax/engine";
import { getCurrentFinancialYear } from "@/lib/financial-year";
import { getTaxReadinessSummary } from "@/lib/tax/return-prep";
import { checkPermissionsSilent, checkPermissionSilent } from "@/lib/rbac";
import { getEnabledModules, MODULE_DESCRIPTIONS, MODULE_LABELS, type ModuleKey } from "@/lib/modules";
import { buildMonthlyChartBuckets, resolveMonthlyBucketTimeZone } from "./monthly-series";
import { describeKpiPeriod, getFyDateRange } from "./sales-shop-kpi-periods";
import {
  buildDashboardCacheKey,
  getDashboardCacheEntry,
  getDashboardCacheMeta,
  isDashboardCacheEnabled,
  noteDashboardCacheIncident,
  setDashboardCacheEntry,
} from "@/lib/dashboard-cache";

const normalizeInvoiceStatus = (status: unknown) => String(status).toUpperCase();
const LOCALE_CURRENCY_AFFECTS_PAYLOAD = false;
const CRITICAL_NOTIFICATION_TYPES = ["TAX_ALERT", "DEADLINE_ALERT", "PAYMENT_REMINDER"] as const;

type IntegrationStatus = "healthy" | "partial" | "missing";
type SessionWithWorkspace = {
  workspaceId?: string | null;
  user?: { id?: string | null } | null;
};
type IntegrationReadiness = { configured: boolean; status: IntegrationStatus };

const getIntegrationReadiness = (keys: Array<string | null | undefined>): IntegrationReadiness => {
  const presentKeys = keys.filter((value) => Boolean(value && value.trim())).length;
  if (presentKeys === keys.length) return { configured: true, status: "healthy" };
  if (presentKeys > 0) return { configured: false, status: "partial" };
  return { configured: false, status: "missing" };
};

const asPct = (num: number, den: number) =>
  den <= 0 ? 0 : Math.min(100, Math.round((num / den) * 100));

async function buildDashboardPayload(
  workspaceId: string,
  userId: string | null,
  fy: string,
  options: { canViewFinance?: boolean; segment?: string | null } = {}
) {
  const queryTimingsMs: Record<string, number> = {};

  const timed = async <T,>(label: string, op: () => Promise<T>): Promise<T> => {
    const startedAt = performance.now();
    try {
      return await op();
    } finally {
      queryTimingsMs[label] = Number((performance.now() - startedAt).toFixed(2));
    }
  };

  const now = new Date();
  const attentionStart = new Date(now);
  attentionStart.setDate(now.getDate() - 365); // Bound attention work to last year for scale.
  const thirtyDaysBack = new Date(now);
  thirtyDaysBack.setDate(now.getDate() - 30);

  const sevenDaysOut = new Date(now);
  sevenDaysOut.setDate(now.getDate() + 7);

  const sixtyDaysBack = new Date(now);
  sixtyDaysBack.setDate(now.getDate() - 60);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const fyRange = getFyDateRange(fy);

  const { canViewFinance = true } = options;

  const canViewTaxReadiness =
    Boolean(userId) && (await checkPermissionSilent(userId!, workspaceId, "tax.readiness.view"));
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
    taxOverrides,
    taxAudits,
    fileImportFailures,
    activities,
    notifications,
    pendingOrderAgingBuckets,
    taxReadinessSummary,
  ] = await Promise.all([
    timed("workspace.core", () =>
      prisma.workspace.findUnique({
        where: { id: workspaceId },
      })
    ),

    timed("workspace.owner", () =>
      prisma.workspaceUser.findFirst({
        where: { workspaceId, role: "OWNER" },
        select: { user: { select: { timeZone: true } } },
      })
    ),

    userId
      ? timed("user.current", () =>
          prisma.user.findUnique({
            where: { id: userId },
            select: { timeZone: true },
          })
        )
      : Promise.resolve(null),

    timed("profile.business", () =>
      prisma.businessProfile.findUnique({
        where: { workspaceId },
        select: {
          groqApiKey: true,
          razorpayKeyId: true,
          razorpayKeySecret: true,
          stripePublishableKey: true,
          stripeSecretKey: true,
          smtpHost: true,
          smtpPort: true,
          smtpUser: true,
          smtpPassword: true,
          smtpFromEmail: true,
          shopEnabled: true,
        },
      })
    ),

    timed("invoices.fy", () =>
      prisma.invoice.findMany({
        where: {
          workspaceId,
          ...(fyRange ? { invoiceDate: { gte: fyRange.start, lt: fyRange.endExclusive } } : { financialYear: fy }),
        },
        select: {
          status: true,
          invoiceDate: true,
          totalAmount: true,
          grandTotal: true,
          amountReceived: true,
        },
        orderBy: { invoiceDate: "asc" },
      })
    ),

    timed("invoices.attention_buckets", async () => {
      // Avoid pulling all invoices into memory at realistic scale.
      // We only need aging buckets and counts for OPEN invoices.
      // Approximate "outstanding invoice count" as open invoice count (matches previous semantics for dashboard).
      const openInvoices = await prisma.invoice.findMany({
        where: {
          workspaceId,
          status: { not: "PAID" },
          invoiceDate: { gte: attentionStart },
        },
        select: {
          invoiceDate: true,
          totalAmount: true,
          grandTotal: true,
          amountReceived: true,
        },
      });

      const buckets = {
        current: new Prisma.Decimal(0),
        mid: new Prisma.Decimal(0),
        late: new Prisma.Decimal(0),
      };

      for (const invoice of openInvoices) {
        const outstanding = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          getInvoiceBilledAmount(invoice).minus(new Prisma.Decimal(Number(invoice.amountReceived ?? 0)))
        );
        if (outstanding.equals(0)) continue;
        const ageDays = Math.max(
          0,
          Math.floor((now.getTime() - new Date(invoice.invoiceDate).getTime()) / (1000 * 60 * 60 * 24))
        );
        if (ageDays <= 30) buckets.current = buckets.current.plus(outstanding);
        else if (ageDays <= 60) buckets.mid = buckets.mid.plus(outstanding);
        else buckets.late = buckets.late.plus(outstanding);
      }

      // Counts for attention cards: overdue = >30 days old, outstanding = any open with balance.
      // Keep the same function signature expectations by returning a minimal "rows" array.
      // We do NOT return invoices; we return computed buckets + counts.
      const outstandingReceivables = openInvoices.reduce((count, inv) => {
        const outstanding = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          getInvoiceBilledAmount(inv).minus(new Prisma.Decimal(Number(inv.amountReceived ?? 0)))
        );
        return outstanding.equals(0) ? count : count + 1;
      }, 0);
      const overdueReceivables = openInvoices.reduce((count, inv) => {
        const outstanding = Prisma.Decimal.max(
          new Prisma.Decimal(0),
          getInvoiceBilledAmount(inv).minus(new Prisma.Decimal(Number(inv.amountReceived ?? 0)))
        );
        if (outstanding.equals(0)) return count;
        const dueDate = new Date(inv.invoiceDate);
        dueDate.setDate(dueDate.getDate() + 30);
        return dueDate < now ? count + 1 : count;
      }, 0);

      return { buckets, overdueReceivables, outstandingReceivables };
    }),

    timed("invoices.recent", () =>
      prisma.invoice.findMany({
        where: { workspaceId },
        orderBy: { invoiceDate: "desc" },
        take: 6,
        include: { client: true },
      })
    ),

    timed("investments.sum", () =>
      prisma.investment.aggregate({
        where: { workspaceId },
        _sum: { amount: true },
      })
    ),

    timed("expenses.fy", () =>
      prisma.expense.findMany({
        where: {
          workspaceId,
          ...(fyRange ? { date: { gte: fyRange.start, lt: fyRange.endExclusive } } : {}),
        },
        select: { date: true, amount: true },
      })
    ),

    timed("bank.grouped", () =>
      prisma.bankTransaction.groupBy({
        where: { workspaceId },
        by: ["isReconciled"],
        _count: { _all: true },
      })
    ),

    timed("retainers.active", () =>
      prisma.retainer.findMany({
        where: { workspaceId, status: "ACTIVE" },
        select: { amount: true, nextBillingDate: true, createdAt: true },
      })
    ),

    timed("proposals.grouped", () =>
      prisma.proposal.groupBy({
        where: { 
          workspaceId,
          ...(fyRange ? { dateCreated: { gte: fyRange.start, lt: fyRange.endExclusive } } : {}),
        },
        by: ["status"],
        _count: { _all: true },
      })
    ),

    timed("tasks.total", () =>
      prisma.task.count({
        where: { workspaceId },
      })
    ),

    timed("tasks.open", () =>
      prisma.task.count({
        where: { workspaceId, status: { not: "DONE" } },
      })
    ),

    timed("tasks.urgent", () =>
      prisma.task.count({
        where: {
          workspaceId,
          status: { not: "DONE" },
          OR: [{ dueDate: { lte: sevenDaysOut } }, { status: { contains: "URGENT" } }],
        },
      })
    ),

    timed("tasks.blocked", () =>
      prisma.task.count({
        where: { workspaceId, status: { contains: "BLOCK" } },
      })
    ),

    timed("products.published", () =>
      prisma.product.count({
        where: { workspaceId, showInShop: true },
      })
    ),

    timed("products.low_stock", () =>
      prisma.product.count({
        where: {
          workspaceId,
          OR: [{ status: "LOW_STOCK" }, { currentStock: { lte: 5 } }],
        },
      })
    ),

    timed("purchase_orders.open", () =>
      prisma.purchaseOrder.count({
        where: { workspaceId, status: { in: ["DRAFT", "SENT"] } },
      })
    ),

    timed("inventory.recent", () =>
      prisma.inventoryMovement.findMany({
        where: { workspaceId },
        include: { product: { select: { name: true } } },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    ),

    timed("orders.status_group", () =>
      prisma.shopOrder.groupBy({
        where: { 
          workspaceId,
          ...(fyRange ? { createdAt: { gte: fyRange.start, lt: fyRange.endExclusive } } : {}),
        },
        by: ["status"],
        _count: { _all: true },
      })
    ),

    timed("orders.revenue_month", () =>
      prisma.shopOrder.aggregate({
        where: {
          workspaceId,
          status: "PAID",
          createdAt: { gte: monthStart, lt: nextMonthStart },
        },
        _sum: { amount: true },
      })
    ),

    timed("orders.revenue_prev_month", () =>
      prisma.shopOrder.aggregate({
        where: {
          workspaceId,
          status: "PAID",
          createdAt: { gte: previousMonthStart, lt: monthStart },
        },
        _sum: { amount: true },
      })
    ),

    timed("orders.last_30d", () =>
      prisma.shopOrder.count({
        where: { workspaceId, createdAt: { gte: thirtyDaysBack } },
      })
    ),

    timed("orders.prior_30d", () =>
      prisma.shopOrder.count({
        where: {
          workspaceId,
          createdAt: { gte: sixtyDaysBack, lt: thirtyDaysBack },
        },
      })
    ),

    timed("orders.top_products", () =>
      prisma.shopOrderItem.groupBy({
        where: {
          shopOrder: {
            workspaceId,
            ...(fyRange ? { createdAt: { gte: fyRange.start, lt: fyRange.endExclusive } } : {}),
          },
        },
        by: ["productId", "productName"],
        _count: { _all: true },
        _sum: { lineTotal: true },
      })
    ),

    timed("orders.recent", () =>
      prisma.shopOrder.findMany({
        where: { workspaceId },
        include: { items: { select: { productName: true }, take: 1 } },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    ),

    timed("integrity.last_run", () =>
      prisma.accountingIntegrityRun.findMany({
        where: { workspaceId },
        orderBy: { startedAt: "desc" },
        take: 1,
      })
    ),

    timed("integrity.violations_total", () =>
      prisma.accountingViolationReport.count({
        where: { workspaceId },
      })
    ),

    timed("integrity.violations_critical", () =>
      prisma.accountingViolationReport.count({
        where: { workspaceId, severity: "CRITICAL" },
      })
    ),

    timed("tax.overrides", () =>
      prisma.taxRateOverride.count({
        where: { workspaceId, isActive: true },
      })
    ),

    timed("tax.audits_recent", () =>
      prisma.taxDecisionAuditLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 5,
      })
    ),

    timed("imports.failed", () =>
      prisma.fileImportAuditLog.count({
        where: { workspaceId, status: { in: ["FAILED", "ERROR"] } },
      })
    ),

    timed("activity.recent", () =>
      prisma.appActivityLog.findMany({
        where: { workspaceId },
        orderBy: { createdAt: "desc" },
        take: 8,
      })
    ),

    userId
      ? timed("notifications.critical_unread", () =>
          prisma.inAppNotification.count({
            where: {
              userId,
              workspaceId,
              isRead: false,
              eventType: { in: CRITICAL_NOTIFICATION_TYPES as unknown as string[] },
            },
          })
        )
      : Promise.resolve(0),
    timed("orders.pending_buckets", async () => {
      // Avoid pulling all orders into memory; we only need pending/failed aging buckets.
      const pendingOrders = await prisma.shopOrder.findMany({
        where: {
          workspaceId,
          status: { in: ["PENDING", "FAILED"] },
          createdAt: { gte: attentionStart },
        },
        select: { amount: true, createdAt: true },
      });

      const buckets = {
        current: new Prisma.Decimal(0),
        mid: new Prisma.Decimal(0),
        late: new Prisma.Decimal(0),
      };

      for (const order of pendingOrders) {
        const ageDays = Math.max(
          0,
          Math.floor((now.getTime() - new Date(order.createdAt).getTime()) / (1000 * 60 * 60 * 24))
        );
        const outstanding = toDecimal(order.amount);
        if (ageDays <= 30) buckets.current = buckets.current.plus(outstanding);
        else if (ageDays <= 60) buckets.mid = buckets.mid.plus(outstanding);
        else buckets.late = buckets.late.plus(outstanding);
      }

      return buckets;
    }),
    timed("tax.readiness_summary", () =>
      getTaxReadinessSummary(workspaceId, { includeSummary: canViewTaxReadiness }),
    ),
  ]);

  const billedRevenue = canViewFinance ? sumInvoiceBilledAmount(invoices) : new Prisma.Decimal(0);

  const expensesTotal = expenses.reduce(
    (sum, row) => sum.plus(toDecimal(row.amount)),
    new Prisma.Decimal(0)
  );

  const liquidAssets = canViewFinance
    ? toDecimal(investmentAggregate._sum.amount ?? 0)
    : new Prisma.Decimal(0);

  const shopOrderByStatus = shopOrderStatusGroups.reduce<Record<string, number>>(
    (acc, group) => {
      const status = String(group.status || "PENDING").toUpperCase();
      acc[status] = group._count._all;
      return acc;
    },
    {}
  );

  const paidOrders = shopOrderByStatus.PAID ?? 0;
  const pendingOrders = shopOrderByStatus.PENDING ?? 0;
  const failedOrders = shopOrderByStatus.FAILED ?? 0;
  const pendingOrdersCount = pendingOrders + failedOrders;

  const receivables = (canViewFinance
    ? invoices.reduce((sum, inv) => {
        const billed = getInvoiceBilledAmount(inv);
        const received = new Prisma.Decimal(Number(inv.amountReceived ?? 0));
        return sum.plus(Prisma.Decimal.max(new Prisma.Decimal(0), billed.minus(received)));
      }, new Prisma.Decimal(0))
    : new Prisma.Decimal(0)
  ).plus(
    pendingOrdersCount > 0
      ? toDecimal(0)
      : new Prisma.Decimal(0)
  );

  const presumptiveIncome = billedRevenue.mul(0.5);
  const taxEstimate = canViewFinance
    ? estimateTax({
        countryCode: workspace?.countryCode ?? "IN",
        revenue: presumptiveIncome,
        deductions: new Prisma.Decimal(0),
        serviceScope: "dashboard_summary",
        customerScope: "workspace",
        asOfDate: now,
      })
    : { amount: serializeMoney(0) };

  const recurringRevenue = retainers.reduce(
    (sum, ret) => sum.plus(toDecimal(ret.amount)),
    new Prisma.Decimal(0)
  );
  const arr = recurringRevenue.mul(12);

  const totalBankTransactions = bankTransactionGroups.reduce(
    (sum, row) => sum + row._count._all,
    0
  );
  const unreconciledTransactions = bankTransactionGroups
    .filter((row) => !row.isReconciled)
    .reduce((sum, row) => sum + row._count._all, 0);
  const reconciliationProgress = asPct(
    totalBankTransactions - unreconciledTransactions,
    totalBankTransactions
  );

  const { overdueReceivables, outstandingReceivables } = openInvoiceAgingBuckets;

  const retainersDueSoon = retainers.filter(
    (ret) => ret.nextBillingDate >= now && ret.nextBillingDate <= sevenDaysOut
  ).length;

  const proposalCounts = proposalStatusGroups.reduce<Record<string, number>>((acc, group) => {
    acc[String(group.status || "DRAFT").toUpperCase()] = group._count._all;
    return acc;
  }, {});

  const acceptedUninvoicedProposals = proposalCounts.ACCEPTED ?? 0;
  const urgentTasks = urgentTaskCount;
  const blockedTasks = blockedTaskCount;

  const criticalViolations = criticalViolationCount;
  const complianceIssues = violationCount + (criticalViolations > 0 ? 1 : 0);

  const funnel = {
    draft: proposalCounts.DRAFT ?? 0,
    sent: proposalCounts.SENT ?? 0,
    viewed: proposalCounts.VIEWED ?? 0,
    accepted: acceptedUninvoicedProposals,
    invoiced: proposalCounts.INVOICED ?? 0,
    declined: proposalCounts.DECLINED ?? 0,
  };

  const conversion = asPct(paidOrders, Math.max(1, paidOrders + pendingOrders + failedOrders));

  const topProductIds = topProductOrderGroups
    .filter((group) => Boolean(group.productId))
    .sort((a, b) => Number((b._count as { _all?: number } | undefined)?._all ?? 0) - Number((a._count as { _all?: number } | undefined)?._all ?? 0))
    .slice(0, 4)
    .map((group) => group.productId as string);

  const topProductsData = topProductIds.length
    ? await timed("orders.top_product_names", () =>
        prisma.product.findMany({
          where: { id: { in: topProductIds } },
          select: { id: true, name: true },
        })
      )
    : [];

  const topProductNameById = new Map(topProductsData.map((row) => [row.id, row.name]));

  const topProducts = topProductOrderGroups
    .sort((a, b) => Number((b._count as { _all?: number } | undefined)?._all ?? 0) - Number((a._count as { _all?: number } | undefined)?._all ?? 0))
    .slice(0, 4)
    .map((group) => ({
      productName:
        (group.productId && topProductNameById.get(group.productId)) ??
        "Unknown product",
      orderCount: Number((group._count as { _all?: number } | undefined)?._all ?? 0),
      revenue: serializeMoney(toDecimal((group._sum as { lineTotal?: number | string | Prisma.Decimal | null } | undefined)?.lineTotal ?? 0)),
    }));

  const bucketTimeZone = resolveMonthlyBucketTimeZone(
    workspaceOwner?.user?.timeZone ?? currentUser?.timeZone ?? null
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
    if (!fyRange || !ret.createdAt) return [{ date: now, value: ret.amount }];
    const activeMonths = [];
    for (let i = 0; i < 12; i++) {
      const d = new Date(fyRange.start);
      d.setMonth(fyRange.start.getMonth() + i);
      const isStartMonth = d.getFullYear() === new Date(ret.createdAt).getFullYear() && d.getMonth() === new Date(ret.createdAt).getMonth();
      if (isStartMonth || new Date(ret.createdAt) < fyRange.start) {
        activeMonths.push({ date: d, value: ret.amount });
      }
    }
    return activeMonths;
  });

  const monthlySeries = buildMonthlyChartBuckets({
    revenueRows: invoices.map((inv) => ({
      date: new Date(inv.invoiceDate),
      value: getInvoiceBilledAmount(inv),
    })),
    expenseRows: expenses.map((expense) => ({
      date: new Date(expense.date),
      value: expense.amount,
    })),
    mrrRows: [...ensure12Months, ...generatedMrrRows],
    bucketTimeZone,
  });

  const integrationReadiness = {
    groq: getIntegrationReadiness([profile?.groqApiKey]),
    payment:
      getIntegrationReadiness([profile?.razorpayKeyId, profile?.razorpayKeySecret]).status ===
        "healthy" ||
      getIntegrationReadiness([profile?.stripePublishableKey, profile?.stripeSecretKey]).status ===
        "healthy"
        ? { configured: true, status: "healthy" as IntegrationStatus }
        : getIntegrationReadiness([
            profile?.razorpayKeyId,
            profile?.razorpayKeySecret,
            profile?.stripePublishableKey,
            profile?.stripeSecretKey,
          ]),
    smtp: getIntegrationReadiness([
      profile?.smtpHost,
      profile?.smtpPort ? String(profile.smtpPort) : null,
      profile?.smtpUser,
      profile?.smtpPassword,
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
    { healthy: 0, partial: 0, missing: 0 }
  );

  const setupSignals = [
    workspace?.isSetupComplete,
    integrationSummary.healthy >= 2,
    invoices.length > 0,
    profile?.shopEnabled,
    taxOverrides > 0 || taxAudits.length > 0,
  ].filter(Boolean).length;

  const setupCompletion = asPct(setupSignals, 5);

  const attentionCards = [
    {
      id: "overdue",
      title: "Overdue receivables",
      value: overdueReceivables,
      tone: "critical",
      href: "/income",
      helper: "Follow up on overdue balances to protect cash flow.",
    },
    {
      id: "bank",
      title: "Unreconciled transactions",
      value: unreconciledTransactions,
      tone: "warning",
      href: "/reconciliation",
      helper: "Match transactions to keep books accurate.",
    },
    {
      id: "proposals",
      title: "Accepted, awaiting invoice",
      value: acceptedUninvoicedProposals,
      tone: "warning",
      href: "/proposals",
      helper: "Convert accepted proposals into billable invoices.",
    },
    {
      id: "tasks",
      title: "Urgent tasks",
      value: urgentTasks,
      tone: "info",
      href: "/admin",
      helper: "Handle due tasks to avoid operational blockers.",
    },
  ] as const;

  const receivablesAgingBuckets = {
    current: openInvoiceAgingBuckets.buckets.current.plus(pendingOrderAgingBuckets.current),
    mid: openInvoiceAgingBuckets.buckets.mid.plus(pendingOrderAgingBuckets.mid),
    late: openInvoiceAgingBuckets.buckets.late.plus(pendingOrderAgingBuckets.late),
  };

  const receivablesAging = [
    { bucket: "0-30d", value: serializeMoney(receivablesAgingBuckets.current) },
    { bucket: "31-60d", value: serializeMoney(receivablesAgingBuckets.mid) },
    { bucket: "61+d", value: serializeMoney(receivablesAgingBuckets.late) },
  ];

  const healthWarnings = [
    ...(integrationSummary.missing > 0
      ? [{ label: "Missing integrations", severity: "warning" as const }]
      : []),
    ...(criticalViolations > 0
      ? [{ label: "Critical accounting violations", severity: "critical" as const }]
      : []),
    ...(fileImportFailures > 0
      ? [{ label: "Failed imports require review", severity: "warning" as const }]
      : []),
  ];

  const lastRun = integrityRuns[0];
  const shopRevenueThisMonth = toDecimal(paidOrderRevenueThisMonth._sum.amount ?? 0);
  const shopRevenuePreviousMonth = toDecimal(paidOrderRevenuePreviousMonth._sum.amount ?? 0);

  const revenueDeltaPct = shopRevenuePreviousMonth.gt(0)
    ? Number(
        shopRevenueThisMonth
          .minus(shopRevenuePreviousMonth)
          .div(shopRevenuePreviousMonth)
          .mul(100)
          .toFixed(1)
      )
    : null;

  const orderDeltaPct =
    ordersPrior30Days > 0
      ? Number((((ordersLast30Days - ordersPrior30Days) / ordersPrior30Days) * 100).toFixed(1))
      : null;

  const salesAndShopKpiPeriods = {
    proposalFunnel: describeKpiPeriod({ type: "FY", now, fy, fyRange }),
    acceptedAwaitingInvoicing: describeKpiPeriod({ type: "FY", now, fy, fyRange }),
    publicShopOrders: describeKpiPeriod({ type: "ALL_TIME", now, fy, fyRange }),
    shopOrderConversion: describeKpiPeriod({ type: "ALL_TIME", now, fy, fyRange }),
    topProducts: describeKpiPeriod({ type: "ALL_TIME", now, fy, fyRange }),
    shopRevenueThisMonth: describeKpiPeriod({ type: "FY", now, fy, fyRange }),
    ordersLast30Days: describeKpiPeriod({ type: "ROLLING_30D", now, fy, fyRange }),
  };
  const optionalModuleRouteMap: Record<ModuleKey, string> = {
    WORKFORCE: "/workforce",
    PAYROLL: "/payroll",
    DOCUMENTS: "/documents",
    REVENUE_PIPELINE: "/proposals",
    CASH_FLOW: "/cash-flow",
    AR_COLLECTIONS: "/ar-collections",
    TAX_ADVANCED: "/tax",
    REPORTING_CENTER: "/reporting",
    IMPORT_MANAGER: "/inbox/import",
    SHOP: "/shop",
  };
  const optionalModules = Array.from(enabledModules).map((moduleKey) => ({
    moduleKey,
    label: MODULE_LABELS[moduleKey],
    description: MODULE_DESCRIPTIONS[moduleKey],
    href: optionalModuleRouteMap[moduleKey] ?? "/settings",
  }));

  return {
    health: {
      setupCompletion,
      onboardingProgress: setupCompletion,
      setupComplete: Boolean(workspace?.isSetupComplete),
      subscriptionStatus: workspace?.subscriptionStatus ?? "FREE",
      trialEndsAt: workspace?.subscriptionEndsAt?.toISOString() ?? null,
      planTier: workspace?.planTier ?? "FREE",
      integrationReadiness: {
        integrations: integrationReadiness,
        summary: integrationSummary,
      },
      complianceWarnings: healthWarnings,
    },

    attention: {
      totalUrgent:
        attentionCards.reduce((sum, card) => sum + card.value, 0) +
        criticalViolations +
        notifications,
      overdueInvoices: overdueReceivables,
      pendingInvoices: outstandingReceivables,
      overdueReceivables,
      outstandingReceivables,
      unreconciledTransactions,
      retainersDueSoon,
      acceptedUninvoicedProposals,
      urgentTasks,
      criticalNotifications: notifications,
      complianceIssues,
      failedImports: fileImportFailures,
      cards: attentionCards,
    },

    financialPulse: {
      billedRevenue: serializeMoney(billedRevenue),
      receivables: serializeMoney(receivables),
      expenses: serializeMoney(expensesTotal),
      estimatedTax: taxEstimate.amount,
      liquidAssets: serializeMoney(liquidAssets),
      recurringRevenue: serializeMoney(recurringRevenue),
      arr: serializeMoney(arr),
      reconciliationProgress,
    },

    salesAndShop: {
      proposalFunnel: funnel,
      acceptedAwaitingInvoicing: acceptedUninvoicedProposals,
      shopEnabled: Boolean(profile?.shopEnabled),
      publicShopOrders: {
        total: Object.values(shopOrderByStatus).reduce((sum, value) => sum + value, 0),
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
        productName: order.items[0]?.productName ?? "Unknown product",
        buyerName: order.buyerName,
        amount: serializeMoney(order.amount),
        status: order.status,
        createdAt: order.createdAt,
      })),
    },

    operations: {
      hasOperationalData: lowStockProducts > 0 || openPurchaseOrders > 0 || taskCount > 0,
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
      taxReadiness: taxReadinessSummary,
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
      taxReadiness: taxReadinessSummary,
    },

    activity: activities.map((item) => ({
      id: item.id,
      action: item.action,
      status: item.status,
      createdAt: item.createdAt,
      actor: item.actorEmail ?? null,
    })),

    charts: {
      bucketTimeZone,
      revenueVsExpense: monthlySeries.map((row) => ({
        name: row.label,
        revenue: canViewFinance ? serializeMoney(row.revenue) : 0,
        expenses: serializeMoney(row.expenses),
      })),
      recurringRevenue: monthlySeries.map((row) => ({
        name: row.label,
        mrr: canViewFinance ? serializeMoney(row.mrr) : 0,
      })),
      receivablesAging,
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
      orderHealth: [
        { status: "Paid", value: paidOrders },
        { status: "Pending", value: pendingOrders },
        { status: "Failed", value: failedOrders },
      ],
    },

    recentInvoices: recentInvoices.map((invoice) => ({
      ...invoice,
      status: invoice.status || INVOICE_STATUS.PENDING,
    })),
    permissions: {
      canViewFinance: canViewAccounting,
      canViewOperations,
      canViewSalesShop: canViewSales,
      canViewCharts: canViewAccounting,
      canViewRecentLedger: canViewAccounting,
      canViewTrust: canViewAccounting,
      canRunIntegrityScan: canRunTaxReadiness,
      canManageBilling,
    },
    optionalModules,

    telemetry: {
      queryTimingsMs,
    },

    countryCode: workspace?.countryCode ?? "IN",
  };
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    const workspaceId = (session as SessionWithWorkspace | null)?.workspaceId;
    const userId = (session as SessionWithWorkspace | null)?.user?.id ?? null;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "Unauthorized", code: "AUTH_UNAUTHORIZED" },
        { status: 401 }
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
          canViewFinance: true,
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
      canViewFinance: true,
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
      { status: 500 }
    );
  }
}
