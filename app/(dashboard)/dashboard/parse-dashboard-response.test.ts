import test from "node:test";
import assert from "node:assert/strict";
import { parseDashboardResponse } from "./parse-dashboard-response";

test("parses serialized money values from dashboard payload", () => {
  const parsed = parseDashboardResponse({
    kpis: {
      totalRevenue: "1000.10",
      totalWealth: "2000.20",
      estimatedTax: "300.30",
      activeClients: 3,
    },
    mrr: {
      total: "4500.55",
      retainers: [{ clientName: "ACME", amount: "1500.15", health: "good" }],
    },
    charts: {
      revenue: [{ name: "Apr", revenue: "1000.10" }],
      wealth: [{ name: "MF", value: "2000.20", color: "#fff" }],
    },
    recentInvoices: [],
  });

  assert.ok(parsed);
  assert.equal(parsed?.kpis.totalRevenue, 1000.1);
  assert.equal(parsed?.mrr.total, 4500.55);
  assert.equal((parsed?.charts.revenue as Array<{ revenue: number }>)[0].revenue, 1000.1);
});

test("preserves dashboard response contract keys", () => {
  const parsed = parseDashboardResponse({
    kpis: {
      totalRevenue: "1000.10",
      totalWealth: "2000.20",
      estimatedTax: "300.30",
      activeClients: 3,
    },
    mrr: {
      total: "4500.55",
      retainers: [{ clientName: "ACME", serviceName: "SEO", amount: "1500.15", health: "good" }],
    },
    charts: {
      revenue: [{ name: "Apr", revenue: "1000.10" }],
      wealth: [{ name: "MF", value: "2000.20", color: "#fff" }],
    },
    readiness: {
      integrations: {
        groq: { configured: false, status: "missing" },
        payment: { configured: false, status: "missing" },
        smtp: { configured: false, status: "missing" },
      },
      summary: { healthy: 0, partial: 0, missing: 3 },
    },
    recentInvoices: [
      {
        id: "inv_1",
        invoiceDate: "2026-04-01T00:00:00.000Z",
        invoiceNumber: "INV-001",
        clientName: "ACME",
        billingMonth: "April",
        status: "PENDING",
        totalAmount: "500.00",
        amountReceived: 0,
        pdfPath: "/invoices/INV-001.pdf",
      },
    ],
  });

  assert.ok(parsed);
  assert.deepEqual(Object.keys(parsed ?? {}).sort(), ["charts", "kpis", "mrr", "readiness", "recentInvoices"].sort());
});
