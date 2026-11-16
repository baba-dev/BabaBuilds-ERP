import { parseApiMoney } from "@/lib/money-client";
import type { DashboardData } from "./types";

type UnknownRecord = Record<string, unknown>;

const asRecord = (value: unknown): UnknownRecord | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as UnknownRecord) : null;

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const asNumber = (value: unknown, fallback = 0) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

const asNullableNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

const asString = (value: unknown, fallback = "") => (typeof value === "string" ? value : fallback);

const money = (value: unknown) => parseApiMoney(value as string | number | null | undefined);

/** Parses each row that is an object and drops anything else, so one malformed row cannot break a list. */
const mapRows = <T>(rows: unknown, map: (row: UnknownRecord) => T): T[] =>
  asArray(rows).flatMap((row) => {
    const record = asRecord(row);
    return record ? [map(record)] : [];
  });

/**
 * Turns the `/api/dashboard` JSON into typed data: money strings become numbers
 * and anything missing gets a safe default. Returns `null` only when the
 * response is not a dashboard payload at all.
 */
export const parseDashboardResponse = (payload: unknown): DashboardData | null => {
  const obj = asRecord(payload);
  if (!obj) return null;

  const health = asRecord(obj.health);
  const attention = asRecord(obj.attention);
  const pulse = asRecord(obj.financialPulse);
  const sales = asRecord(obj.salesAndShop);
  const operations = asRecord(obj.operations);
  const trust = asRecord(obj.trust);
  const charts = asRecord(obj.charts);
  const permissions = asRecord(obj.permissions);

  if (!health || !attention || !pulse || !sales || !operations || !trust || !charts || !permissions || !Array.isArray(obj.recentInvoices)) {
    return null;
  }

  const receivables = asRecord(obj.receivables) ?? {};
  const workspace = asRecord(obj.workspace) ?? {};
  const readiness = asRecord(health.integrationReadiness) ?? {};
  const funnel = asRecord(sales.proposalFunnel) ?? {};
  const orders = asRecord(sales.publicShopOrders) ?? {};

  return {
    permissions: {
      canViewAccounting: permissions.canViewAccounting === true,
      canViewOperations: permissions.canViewOperations === true,
      canViewSales: permissions.canViewSales === true,
      canViewCharts: permissions.canViewCharts === true,
      canViewRecentLedger: permissions.canViewRecentLedger === true,
      canViewTrust: permissions.canViewTrust === true,
      canRunIntegrityScan: permissions.canRunIntegrityScan === true,
      canManageBilling: permissions.canManageBilling === true,
    },
    workspace: {
      name: asString(workspace.name),
      baseCurrency: asString(workspace.baseCurrency, "INR"),
    },
    optionalModules: mapRows(obj.optionalModules, (row) => ({
      moduleKey: asString(row.moduleKey),
      label: asString(row.label),
      description: asString(row.description),
      href: asString(row.href),
    })),
    health: {
      setupCompletion: asNumber(health.setupCompletion),
      setupComplete: health.setupComplete === true,
      setupSteps: mapRows(health.setupSteps, (row) => ({
        id: asString(row.id) as DashboardData["health"]["setupSteps"][number]["id"],
        done: row.done === true,
      })),
      subscriptionState: asString(health.subscriptionState, "FREE"),
      trialEndsAt: typeof health.trialEndsAt === "string" ? health.trialEndsAt : null,
      planTier: asString(health.planTier, "FREE"),
      integrationReadiness: {
        summary: (asRecord(readiness.summary) ?? { healthy: 0, partial: 0, missing: 0 }) as DashboardData["health"]["integrationReadiness"]["summary"],
        integrations: (asRecord(readiness.integrations) ?? {}) as DashboardData["health"]["integrationReadiness"]["integrations"],
      },
    },
    attention: {
      totalUrgent: asNumber(attention.totalUrgent),
      overdueReceivables: asNumber(attention.overdueReceivables),
      outstandingReceivables: asNumber(attention.outstandingReceivables),
      dueSoonReceivables: asNumber(attention.dueSoonReceivables),
      unreconciledTransactions: asNumber(attention.unreconciledTransactions),
      retainersDueSoon: asNumber(attention.retainersDueSoon),
      acceptedUninvoicedProposals: asNumber(attention.acceptedUninvoicedProposals),
      urgentTasks: asNumber(attention.urgentTasks),
      criticalNotifications: asNumber(attention.criticalNotifications),
      criticalViolations: asNumber(attention.criticalViolations),
      complianceIssues: asNumber(attention.complianceIssues),
      failedImports: asNumber(attention.failedImports),
      lowStock: asNumber(attention.lowStock),
    },
    receivables: {
      outstandingAmount: money(receivables.outstandingAmount),
      overdueAmount: money(receivables.overdueAmount),
      aging: mapRows(receivables.aging, (row) => ({
        bucket: asString(row.bucket) as DashboardData["receivables"]["aging"][number]["bucket"],
        value: money(row.value),
      })),
      watchlist: mapRows(receivables.watchlist, (row) => ({
        id: asString(row.id),
        invoiceNumber: asString(row.invoiceNumber),
        clientName: asString(row.clientName),
        outstanding: money(row.outstanding),
        dueDate: asString(row.dueDate),
        daysOverdue: asNumber(row.daysOverdue),
      })),
    },
    financialPulse: {
      billedRevenue: money(pulse.billedRevenue),
      collected: money(pulse.collected),
      receivables: money(pulse.receivables),
      expenses: money(pulse.expenses),
      netIncome: money(pulse.netIncome),
      estimatedTax: money(pulse.estimatedTax),
      liquidAssets: money(pulse.liquidAssets),
      recurringRevenue: money(pulse.recurringRevenue),
      arr: money(pulse.arr),
      reconciliationProgress: asNumber(pulse.reconciliationProgress),
      bankTransactions: asNumber(pulse.bankTransactions),
    },
    salesAndShop: {
      proposalFunnel: {
        draft: asNumber(funnel.draft),
        sent: asNumber(funnel.sent),
        viewed: asNumber(funnel.viewed),
        accepted: asNumber(funnel.accepted),
        invoiced: asNumber(funnel.invoiced),
        declined: asNumber(funnel.declined),
      },
      acceptedAwaitingInvoicing: asNumber(sales.acceptedAwaitingInvoicing),
      shopEnabled: sales.shopEnabled === true,
      publicShopOrders: {
        total: asNumber(orders.total),
        paid: asNumber(orders.paid),
        pending: asNumber(orders.pending),
        failed: asNumber(orders.failed),
      },
      shopOrderConversion: asNumber(sales.shopOrderConversion),
      shopRevenueThisMonth: money(sales.shopRevenueThisMonth),
      shopRevenuePreviousMonth: money(sales.shopRevenuePreviousMonth),
      revenueChangeVsPriorMonthPct: asNullableNumber(sales.revenueChangeVsPriorMonthPct),
      ordersLast30Days: asNumber(sales.ordersLast30Days),
      ordersPrior30Days: asNumber(sales.ordersPrior30Days),
      orderChangeVsPrior30DaysPct: asNullableNumber(sales.orderChangeVsPrior30DaysPct),
      publishedProducts: asNumber(sales.publishedProducts),
      topProducts: mapRows(sales.topProducts, (row) => ({
        productName: asString(row.productName),
        orderCount: asNumber(row.orderCount),
        revenue: money(row.revenue),
      })),
      recentShopOrders: mapRows(sales.recentShopOrders, (row) => ({
        id: asString(row.id),
        itemSummary: asString(row.itemSummary),
        buyerName: asString(row.buyerName),
        amount: money(row.amount),
        status: asString(row.status),
        createdAt: asString(row.createdAt),
      })),
    },
    operations: {
      hasOperationalData: operations.hasOperationalData === true,
      lowStockCount: asNumber(operations.lowStockCount),
      openPurchaseOrders: asNumber(operations.openPurchaseOrders),
      recentInventoryMovements: mapRows(operations.recentInventoryMovements, (row) => ({
        id: asString(row.id),
        productName: asString(row.productName),
        quantity: asNumber(row.quantity),
        type: asString(row.type),
        createdAt: asString(row.createdAt),
      })),
      openTasks: asNumber(operations.openTasks),
      blockedTasks: asNumber(operations.blockedTasks),
    },
    trust: {
      integrityStatus: asString(trust.integrityStatus, "NOT_RUN"),
      lastIntegrityRunAt: typeof trust.lastIntegrityRunAt === "string" ? trust.lastIntegrityRunAt : null,
      violationCount: asNumber(trust.violationCount),
      criticalViolations: asNumber(trust.criticalViolations),
      taxOverrideCount: asNumber(trust.taxOverrideCount),
      taxOpenBlockers: asNumber(trust.taxOpenBlockers),
      taxCriticalBlockers: asNumber(trust.taxCriticalBlockers),
    },
    upcoming: mapRows(obj.upcoming, (row) => ({
      kind: asString(row.kind) as DashboardData["upcoming"][number]["kind"],
      id: asString(row.id),
      title: asString(row.title),
      reference: asString(row.reference),
      date: asString(row.date),
      amount: row.amount == null ? null : money(row.amount),
      href: asString(row.href, "/dashboard"),
    })),
    activity: mapRows(obj.activity, (row) => ({
      id: asString(row.id),
      action: asString(row.action),
      entityType: typeof row.entityType === "string" ? row.entityType : null,
      status: asString(row.status),
      createdAt: asString(row.createdAt),
      actor: typeof row.actor === "string" ? row.actor : null,
    })),
    charts: {
      bucketTimeZone: asString(charts.bucketTimeZone, "Asia/Kolkata") || "Asia/Kolkata",
      currentMonthId: asString(charts.currentMonthId),
      revenueVsExpense: mapRows(charts.revenueVsExpense, (row) => ({
        monthId: asString(row.monthId),
        name: asString(row.name),
        revenue: money(row.revenue),
        expenses: money(row.expenses),
      })),
      recurringRevenue: mapRows(charts.recurringRevenue, (row) => ({
        monthId: asString(row.monthId),
        name: asString(row.name),
        mrr: money(row.mrr),
      })),
      proposalFunnel: mapRows(charts.proposalFunnel, (row) => ({
        stage: asString(row.stage),
        value: asNumber(row.value),
      })),
      shopOrderHealth: mapRows(charts.shopOrderHealth, (row) => ({
        status: asString(row.status),
        value: asNumber(row.value),
      })),
    },
    recentInvoices: mapRows(obj.recentInvoices, (row) => ({
      id: asString(row.id),
      invoiceDate: asString(row.invoiceDate),
      dueDate: typeof row.dueDate === "string" ? row.dueDate : null,
      invoiceNumber: asString(row.invoiceNumber),
      clientName: asString(row.clientName),
      clientId: typeof row.clientId === "string" ? row.clientId : null,
      status: asString(row.status, "PENDING"),
      currency: asString(row.currency, "INR"),
      totalAmount: money(row.totalAmount),
      amountReceived: money(row.amountReceived),
      pdfPath: asString(row.pdfPath),
    })),
    countryCode: asString(obj.countryCode, "IN") || "IN",
  };
};
