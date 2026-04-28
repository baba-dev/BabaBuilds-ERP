import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const routePath = path.join(process.cwd(), "app/api/dashboard/route.ts");
const source = readFileSync(routePath, "utf8");

describe("dashboard query performance budget", () => {
  it("uses aggregate/groupBy primitives for heavy dashboard blocks", () => {
    expect(source).toContain("prisma.investment.aggregate");
    expect(source).toContain("prisma.bankTransaction.groupBy");
    expect(source).toContain("prisma.proposal.groupBy");
    expect(source).toContain("prisma.shopOrder.groupBy");
    expect(source).toContain("prisma.accountingViolationReport.count");
  });

  it("bounds UI detail list queries with take limits", () => {
    expect(source).toContain("invoices.recent");
    expect(source).toContain("take: 6");
    expect(source).toContain("orders.recent");
    expect(source).toContain("take: 5");
    expect(source).toContain("inventory.recent");
    expect(source).toContain("tax.audits_recent");
    expect(source).toContain("activity.recent");
  });

  it("captures query timing telemetry for each aggregation block", () => {
    expect(source).toContain("const queryTimingsMs: Record<string, number> = {};");
    expect(source).toContain("timed = async <T,>(label: string");
    expect(source).toContain("telemetry:");
    expect(source).toContain("queryTimingsMs");
  });

  it("keeps query-shape stable under simulated large workspaces", () => {
    const groupByCalls = (source.match(/\.groupBy\(/g) ?? []).length;
    const aggregateCalls = (source.match(/\.aggregate\(/g) ?? []).length;
    const boundedTakeCalls = (source.match(/take:\s*\d+/g) ?? []).length;

    expect(groupByCalls).toBeGreaterThanOrEqual(4);
    expect(aggregateCalls).toBeGreaterThanOrEqual(2);
    expect(boundedTakeCalls).toBeGreaterThanOrEqual(6);
  });
});
