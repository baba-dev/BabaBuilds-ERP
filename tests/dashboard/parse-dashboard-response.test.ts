import { describe, expect, it } from "vitest";
import { parseDashboardResponse } from "@/app/(dashboard)/dashboard/parse-dashboard-response";

const minimal = () => ({
  health: {},
  attention: {},
  financialPulse: {},
  salesAndShop: {},
  operations: {},
  trust: {},
  charts: {},
  permissions: {},
  recentInvoices: [],
});

describe("parseDashboardResponse", () => {
  it("rejects anything that is not a dashboard payload", () => {
    expect(parseDashboardResponse(null)).toBeNull();
    expect(parseDashboardResponse({ error: "Unauthorized" })).toBeNull();
    expect(parseDashboardResponse({ ...minimal(), recentInvoices: undefined })).toBeNull();
  });

  it("fills safe defaults for a sparse payload instead of crashing the page", () => {
    const parsed = parseDashboardResponse(minimal());
    expect(parsed).not.toBeNull();
    expect(parsed!.financialPulse.billedRevenue).toBe(0);
    expect(parsed!.receivables.watchlist).toEqual([]);
    expect(parsed!.upcoming).toEqual([]);
    expect(parsed!.health.setupSteps).toEqual([]);
    expect(parsed!.permissions.canViewAccounting).toBe(false);
    expect(parsed!.charts.bucketTimeZone).toBe("Asia/Kolkata");
    expect(parsed!.countryCode).toBe("IN");
  });

  it("turns money strings into numbers everywhere they appear", () => {
    const parsed = parseDashboardResponse({
      ...minimal(),
      financialPulse: { billedRevenue: "385000.00", collected: "290000.50", netIncome: "-1200.25", reconciliationProgress: 80, bankTransactions: 12 },
      receivables: {
        outstandingAmount: "95000.00",
        overdueAmount: "80000.00",
        aging: [{ bucket: "1_30", value: "80000.00" }],
        watchlist: [{ id: "i1", invoiceNumber: "INV-1", clientName: "Acme", outstanding: "45000.00", dueDate: "2026-11-10T00:00:00.000Z", daysOverdue: 6 }],
      },
      salesAndShop: { shopRevenueThisMonth: "99.99", shopRevenuePreviousMonth: "70.00", revenueChangeVsPriorMonthPct: 42.8, orderChangeVsPrior30DaysPct: null, topProducts: [{ productName: "Widget", orderCount: 2, revenue: "10.50" }] },
      charts: { currentMonthId: "2026-11", revenueVsExpense: [{ monthId: "2026-11", name: "Nov", revenue: "100.10", expenses: "40" }] },
      upcoming: [{ kind: "retainer_billing", id: "r1", title: "Acme", reference: "SEO", date: "2026-11-21T00:00:00.000Z", amount: "35000.00", href: "/retainers?retainer=r1" }, { kind: "tax_return", id: "t1", title: "GSTR-3B", reference: "2026-10", date: "2026-11-20T00:00:00.000Z", amount: null, href: "/tax" }],
      recentInvoices: [{ id: "i1", invoiceNumber: "INV-1", invoiceDate: "2026-11-01T00:00:00.000Z", dueDate: null, clientName: "Acme", clientId: null, status: "PENDING", currency: "USD", totalAmount: "1200.00", amountReceived: "200.00", pdfPath: "/invoices/i1.pdf" }],
    })!;

    expect(parsed.financialPulse).toMatchObject({ billedRevenue: 385000, collected: 290000.5, netIncome: -1200.25, bankTransactions: 12 });
    expect(parsed.receivables.aging).toEqual([{ bucket: "1_30", value: 80000 }]);
    expect(parsed.receivables.watchlist[0].outstanding).toBe(45000);
    expect(parsed.salesAndShop.shopRevenuePreviousMonth).toBe(70);
    expect(parsed.salesAndShop.revenueChangeVsPriorMonthPct).toBe(42.8);
    expect(parsed.salesAndShop.orderChangeVsPrior30DaysPct).toBeNull();
    expect(parsed.salesAndShop.topProducts[0].revenue).toBe(10.5);
    expect(parsed.charts.revenueVsExpense[0]).toEqual({ monthId: "2026-11", name: "Nov", revenue: 100.1, expenses: 40 });
    expect(parsed.upcoming.map((u) => u.amount)).toEqual([35000, null]);
    expect(parsed.recentInvoices[0]).toMatchObject({ currency: "USD", totalAmount: 1200, amountReceived: 200 });
  });

  it("drops malformed rows rather than passing them to the UI", () => {
    const parsed = parseDashboardResponse({ ...minimal(), recentInvoices: [null, "x", { id: "ok" }], activity: [42, { id: "a1", action: "invoice.created", status: "SUCCESS", createdAt: "2026-11-01" }] })!;
    expect(parsed.recentInvoices).toHaveLength(1);
    expect(parsed.activity).toHaveLength(1);
  });
});
