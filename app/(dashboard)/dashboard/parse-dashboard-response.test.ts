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
