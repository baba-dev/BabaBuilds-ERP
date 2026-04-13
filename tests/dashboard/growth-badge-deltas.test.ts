import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseDashboardResponse } from "@/app/(dashboard)/dashboard/parse-dashboard-response";

describe("dashboard growth deltas", () => {
  it("parses explicit order and revenue delta fields", () => {
    const parsed = parseDashboardResponse({
      health: {},
      attention: {},
      financialPulse: {
        billedRevenue: "0",
        receivables: "0",
        expenses: "0",
        estimatedTax: "0",
        liquidAssets: "0",
        recurringRevenue: "0",
        arr: "0",
        reconciliationProgress: 0,
      },
      salesAndShop: {
        proposalFunnel: { draft: 0, sent: 0, viewed: 0, accepted: 0, invoiced: 0, declined: 0 },
        acceptedAwaitingInvoicing: 0,
        shopEnabled: true,
        publicShopOrders: { total: 0, paid: 0, pending: 0, failed: 0 },
        serviceOrderConversion: 0,
        shopRevenueThisMonth: "99.99",
        shopRevenuePreviousMonth: "70.00",
        revenueChangeVsPriorMonthPct: 42.8,
        ordersLast30Days: 5,
        ordersPrior30Days: 4,
        orderChangeVsPrior30DaysPct: 25,
        publishedServices: 0,
        topServices: [],
        recentServiceOrders: [],
      },
      operations: {},
      trust: {},
      activity: [],
      charts: {
        revenueVsExpense: [],
        recurringRevenue: [],
        receivablesAging: [],
        reconciliation: [],
        proposalFunnel: [],
        serviceOrderHealth: [],
      },
      recentInvoices: [],
      countryCode: "IN",
    }) as any;

    expect(parsed?.salesAndShop.shopRevenuePreviousMonth).toBe(70);
    expect(parsed?.salesAndShop.revenueChangeVsPriorMonthPct).toBe(42.8);
    expect(parsed?.salesAndShop.ordersPrior30Days).toBe(4);
    expect(parsed?.salesAndShop.orderChangeVsPrior30DaysPct).toBe(25);
  });

  it("prevents hardcoded static growth badge literals from reappearing", () => {
    const source = readFileSync(join(process.cwd(), "app/(dashboard)/dashboard/dashboard-sales-shop-panel.tsx"), "utf8");

    expect(source).not.toContain("12%");
    expect(source).not.toContain("8%");
    expect(source).toContain("No baseline yet");
  });
});
