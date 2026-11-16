import { describe, expect, it } from "vitest";
import { blankValues, countUrgentItems, redactDashboardPayload } from "@/lib/dashboard/permissions";

const makePayload = () => {
  const attention = {
    overdueReceivables: 2,
    unreconciledTransactions: 5,
    acceptedUninvoicedProposals: 1,
    urgentTasks: 3,
    criticalNotifications: 4,
    criticalViolations: 1,
    failedImports: 2,
    lowStock: 6,
    outstandingReceivables: 7,
    dueSoonReceivables: 1,
    retainersDueSoon: 1,
    complianceIssues: 4,
  };
  return {
    attention: { ...attention, totalUrgent: countUrgentItems(attention) },
    financialPulse: { billedRevenue: "385000.00", netIncome: "-120.50", reconciliationProgress: 80 },
    receivables: {
      outstandingAmount: "95000.00",
      aging: [{ bucket: "not_due", value: "15000.00" }],
      watchlist: [{ id: "inv_1", clientName: "Acme", outstanding: "45000.00" }],
    },
    salesAndShop: {
      shopEnabled: true,
      kpiPeriods: { proposalFunnel: { type: "FY" } },
      proposalFunnel: { draft: 1, sent: 2 },
      shopRevenueThisMonth: "999.00",
      topProducts: [{ productName: "Widget", revenue: "10.00" }],
    },
    operations: { hasOperationalData: true, lowStockCount: 6, recentInventoryMovements: [{ id: "m1" }] },
    trust: { integrityStatus: "FAILED", lastIntegrityRunAt: "2026-01-01", violationCount: 9 },
    charts: {
      revenueVsExpense: [{ monthId: "2026-04", revenue: "100.00" }],
      recurringRevenue: [{ monthId: "2026-04", mrr: "50.00" }],
      proposalFunnel: [{ stage: "Draft", value: 1 }],
      shopOrderHealth: [{ status: "Paid", value: 3 }],
    },
    upcoming: [{ kind: "invoice_due" }, { kind: "retainer_billing" }, { kind: "tax_return" }],
    activity: [{ id: "a1" }],
    recentInvoices: [{ id: "inv_1" }],
  };
};

const everything = { canViewAccounting: true, canViewSales: true, canViewOperations: true };

describe("redactDashboardPayload", () => {
  it("returns the payload untouched for a member who can see everything", () => {
    const payload = makePayload();
    expect(redactDashboardPayload(payload, everything)).toEqual(payload);
  });

  it("removes every financial figure without accounting access", () => {
    const redacted = redactDashboardPayload(makePayload(), { ...everything, canViewAccounting: false });
    const text = JSON.stringify(redacted);

    expect(redacted.financialPulse).toEqual({ billedRevenue: "0.00", netIncome: "0.00", reconciliationProgress: 0 });
    expect(redacted.receivables).toEqual({ outstandingAmount: "0.00", aging: [], watchlist: [] });
    expect(redacted.recentInvoices).toEqual([]);
    expect(redacted.activity).toEqual([]);
    expect(redacted.upcoming).toEqual([]);
    expect(redacted.charts.revenueVsExpense).toEqual([]);
    expect(redacted.charts.recurringRevenue).toEqual([]);
    expect(redacted.trust.integrityStatus).toBe("RESTRICTED");
    expect(redacted.trust.violationCount).toBe(0);
    expect(text).not.toContain("385000");
    expect(text).not.toContain("Acme");

    // What they may still see is left alone.
    expect(redacted.salesAndShop.proposalFunnel).toEqual({ draft: 1, sent: 2 });
    expect(redacted.operations.lowStockCount).toBe(6);
  });

  it("removes proposal and shop figures without sales access", () => {
    const redacted = redactDashboardPayload(makePayload(), { ...everything, canViewSales: false });
    expect(redacted.salesAndShop.proposalFunnel).toEqual({ draft: 0, sent: 0 });
    expect(redacted.salesAndShop.shopRevenueThisMonth).toBe("0.00");
    expect(redacted.salesAndShop.topProducts).toEqual([]);
    expect(redacted.salesAndShop.shopEnabled).toBe(true);
    expect(redacted.charts.proposalFunnel).toEqual([]);
    expect(redacted.attention.acceptedUninvoicedProposals).toBe(0);
    expect(redacted.financialPulse.billedRevenue).toBe("385000.00");
  });

  it("removes stock figures without inventory access", () => {
    const redacted = redactDashboardPayload(makePayload(), { ...everything, canViewOperations: false });
    expect(redacted.operations).toEqual({ hasOperationalData: true, lowStockCount: 0, recentInventoryMovements: [] });
    expect(redacted.attention.lowStock).toBe(0);
  });

  it("recounts urgent items from what the member is still allowed to see", () => {
    const redacted = redactDashboardPayload(makePayload(), { canViewAccounting: false, canViewSales: false, canViewOperations: false });
    expect(redacted.attention.totalUrgent).toBe(3); // only the follow-up tasks remain
    expect(redacted.attention.overdueReceivables).toBe(0);
    expect(redacted.attention.complianceIssues).toBe(0);
  });

  it("does not mutate the payload it was given (it may be cached)", () => {
    const payload = makePayload();
    redactDashboardPayload(payload, { canViewAccounting: false, canViewSales: false, canViewOperations: false });
    expect(payload).toEqual(makePayload());
  });
});

describe("countUrgentItems", () => {
  it("counts only items the dashboard lists with a link", () => {
    const base = { overdueReceivables: 0, unreconciledTransactions: 0, acceptedUninvoicedProposals: 0, urgentTasks: 0, criticalNotifications: 9, criticalViolations: 0, failedImports: 0, lowStock: 0 };
    expect(countUrgentItems(base)).toBe(0);
    expect(countUrgentItems({ ...base, overdueReceivables: 2, lowStock: 1 })).toBe(3);
  });
});

describe("blankValues", () => {
  it("keeps the shape and non-numeric text", () => {
    expect(blankValues({ a: 5, b: "12.50", c: "PAID", d: [1, 2], e: null, f: true })).toEqual({ a: 0, b: "0.00", c: "PAID", d: [], e: null, f: true });
  });
});
