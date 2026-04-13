import test from "node:test";
import assert from "node:assert/strict";
import { parseDashboardResponse } from "./parse-dashboard-response";

const basePayload = {
  health: {
    setupCompletion: 80,
    onboardingProgress: 70,
    setupComplete: false,
    subscriptionState: "TRIALING",
    trialEndsAt: null,
    planTier: "PRO",
    integrationReadiness: {
      summary: { healthy: 2, partial: 1, missing: 1 },
      integrations: {
        groq: { configured: true, status: "healthy" },
        payment: { configured: false, status: "partial" },
        smtp: { configured: true, status: "healthy" },
        shop: { configured: false, status: "missing" },
      },
    },
    complianceWarnings: [],
  },
  attention: {
    totalUrgent: 4,
    overdueInvoices: 1,
    pendingInvoices: 2,
    unreconciledTransactions: 3,
    retainersDueSoon: 1,
    acceptedUninvoicedProposals: 1,
    urgentTasks: 0,
    criticalNotifications: 0,
    complianceIssues: 0,
    failedImports: 0,
    cards: [],
  },
  financialPulse: {
    billedRevenue: "1000.10",
    receivables: "300.20",
    expenses: "500.00",
    estimatedTax: "110.50",
    liquidAssets: "2000.20",
    recurringRevenue: "450.55",
    arr: "5406.60",
    reconciliationProgress: 50,
  },
  salesAndShop: {
    proposalFunnel: { draft: 1, sent: 1, viewed: 1, accepted: 1, invoiced: 0, declined: 0 },
    acceptedAwaitingInvoicing: 1,
    shopEnabled: true,
    publicShopOrders: { total: 3, paid: 2, pending: 1, failed: 0 },
    serviceOrderConversion: 66,
    shopRevenueThisMonth: "399.50",
    ordersLast30Days: 4,
    servicesReadyForShop: 2,
    topServices: [{ serviceName: "SEO", orderCount: 2, revenue: "1000.99" }],
    recentServiceOrders: [{ id: "s1", serviceName: "SEO", buyerName: "Alex", amount: "200.00", status: "PAID", createdAt: "2026-04-01" }],
  },
  operations: {
    hasOperationalData: true,
    lowStockCount: 1,
    openPurchaseOrders: 2,
    recentInventoryMovements: [],
    openTasks: 3,
    blockedTasks: 1,
  },
  trust: {
    integrityStatus: "PASSED",
    lastIntegrityRunAt: null,
    violationCount: 1,
    criticalViolations: 0,
    taxOverrideCount: 2,
    recentTaxAudits: [],
  },
  activity: [],
  charts: {
    revenueVsExpense: [{ name: "Jan", revenue: "100", expenses: "50" }],
    recurringRevenue: [{ name: "Jan", mrr: "10" }],
    receivablesAging: [{ bucket: "0-30", value: "30" }],
    reconciliation: [{ name: "Ledger", reconciled: 3, unreconciled: 2 }],
    proposalFunnel: [{ stage: "Accepted", value: 4 }],
    serviceOrderHealth: [{ status: "PAID", value: 2 }],
  },
  recentInvoices: [],
};

test("parses serialized money values from dashboard payload", () => {
  const parsed = parseDashboardResponse(basePayload) as any;

  assert.ok(parsed);
  assert.equal(parsed?.financialPulse.billedRevenue, 1000.1);
  assert.equal(parsed?.salesAndShop.shopRevenueThisMonth, 399.5);
  assert.equal(parsed?.salesAndShop.topServices[0].revenue, 1000.99);
  assert.equal(parsed?.charts.revenueVsExpense[0].revenue, 100);
});

test("preserves expanded dashboard response contract keys", () => {
  const parsed = parseDashboardResponse(basePayload) as any;

  assert.ok(parsed);
  assert.deepEqual(
    Object.keys(parsed ?? {}).sort(),
    ["activity", "attention", "charts", "financialPulse", "health", "operations", "recentInvoices", "salesAndShop", "trust"].sort(),
  );
});
