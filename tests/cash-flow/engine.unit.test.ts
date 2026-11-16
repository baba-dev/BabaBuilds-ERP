import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { runForecast } from "@/lib/cash-flow/forecast-engine";
import { mergeAssumptions, sanitizeAssumptions } from "@/lib/cash-flow/assumptions";
import { normalizeAdjustment } from "@/lib/cash-flow/adjustments";
import { invoiceToForecastLines, projectPayroll } from "@/lib/cash-flow/sources";
import type { ForecastSourceData } from "@/lib/cash-flow/types";

const D = (n: number) => new Prisma.Decimal(n);
const now = new Date("2026-03-10T10:00:00");
const empty = (over: Partial<ForecastSourceData> = {}): ForecastSourceData => ({
  openingCash: D(1000), bankTransactions: [], invoices: [], clientPaymentBehavior: {}, retainers: [], purchaseOrders: [], manualAdjustments: [],
  workspaceDefaults: { invoicePaymentTermsDays: 30, minimumCashThreshold: 0 }, ...over,
});
const inv = (over: Record<string, unknown> = {}) => ({ id: "i1", invoiceNumber: "1", clientName: "A", invoiceDate: new Date("2026-02-01T00:00:00"), dueDate: new Date("2026-03-20T00:00:00"), expectedPaymentDate: null, paymentTermsDays: 30, clientId: "c1", status: "PENDING" as const, totalAmount: D(500), amountReceived: 0, ...over });
const run = (sources: ForecastSourceData, tag: "BASE" | "BEST_CASE" | "WORST_CASE" = "BASE", a = mergeAssumptions(tag, undefined)) => runForecast({ sources, horizonType: "DAILY_30", scenarioTag: tag, startDate: now, assumptions: a, now });

describe("forecast engine", () => {
  it("keeps overdue receivables in the forecast instead of dropping them", () => {
    const r = run(empty({ invoices: [inv({ dueDate: new Date("2026-02-01T00:00:00"), invoiceDate: new Date("2026-01-01T00:00:00") })] }));
    const line = r.lineItems.find((l) => l.sourceType === "INVOICE");
    expect(line).toBeTruthy();
    expect(new Date(line!.expectedDate).getTime()).toBeGreaterThanOrEqual(new Date("2026-03-10T00:00:00").getTime());
    expect(Number(r.closingCash.toString())).toBe(1500);
  });

  it("converts foreign invoices at their rate", () => {
    const [l] = invoiceToForecastLines({ invoice: { ...inv({ exchangeRate: 80 }) }, workspaceDefaults: { paymentTermsDays: 30 }, scenarioTag: "BASE", collectionsDelayDays: 0, inflowHaircutPercent: 0 });
    expect(Number(l!.amount.toString())).toBe(40000);
  });

  it("uses the saved assumptions: late collections move receipts, bank actuals never move", () => {
    const sources = empty({ invoices: [inv({ dueDate: new Date("2026-03-12T00:00:00") })], bankTransactions: [{ id: "b", date: new Date("2026-03-10T00:00:00"), description: "x", amount: D(-100), accountId: null }] });
    const base = run(sources);
    const slow = run(sources, "BASE", { ...mergeAssumptions("BASE", undefined), collectionsDelayDays: 10 });
    const d = (r: typeof base, t: string) => new Date(r.lineItems.find((l) => l.sourceType === t)!.expectedDate).toISOString().slice(0, 10);
    expect(d(slow, "INVOICE")).not.toBe(d(base, "INVOICE"));
    expect(d(slow, "BANK_TRANSACTION")).toBe(d(base, "BANK_TRANSACTION"));
  });

  it("does not delay supplier payments by the customer delay", () => {
    const sources = empty({ payables: [{ id: "p", vendor: "V", dueDate: new Date("2026-03-15T00:00:00"), amount: D(100), overdue: false, invoiceNo: null, msme: false }] });
    const r = run(sources, "BASE", { ...mergeAssumptions("BASE", undefined), collectionsDelayDays: 20 });
    expect(new Date(r.lineItems[0]!.expectedDate).toISOString().slice(0, 10)).toBe(new Date("2026-03-15T00:00:00").toISOString().slice(0, 10));
  });

  it("reports the dip inside a period and flags the crunch", () => {
    const sources = empty({ openingCash: D(100), manualAdjustments: [{ id: "a", date: new Date("2026-03-12T00:00:00"), amount: D(500), direction: "OUTFLOW", reason: "r", category: null }, { id: "b", date: new Date("2026-03-12T00:00:00"), amount: D(500), direction: "INFLOW", reason: "r", category: null }] });
    const r = runForecast({ sources, horizonType: "WEEKLY_13", scenarioTag: "BASE", startDate: now, assumptions: mergeAssumptions("BASE", undefined), now });
    expect(Number(r.lowestCash.toString())).toBe(-400);
    expect(r.crunchDate).not.toBeNull();
    expect(r.periods[0]!.riskLevel).toBe("CRITICAL");
  });

  it("skips orders that already have a bill and projects payroll", () => {
    const po = { id: "po", poNumber: "1", supplier: "S", status: "SENT", expectedDate: new Date("2026-03-20T00:00:00"), expectedPaymentDate: null, totalAmount: D(300) };
    expect(run(empty({ purchaseOrders: [po] })).lineItems).toHaveLength(1);
    expect(run(empty({ purchaseOrders: [po], purchaseOrdersWithBills: ["po"] })).lineItems).toHaveLength(0);
    const p = projectPayroll([{ runId: "r", postedAt: new Date("2026-02-28T00:00:00"), amount: D(1000) }], new Date("2026-03-10T00:00:00"), new Date("2026-05-10T00:00:00"), []);
    expect(p.length).toBeGreaterThanOrEqual(1);
    expect(projectPayroll([{ runId: "r", postedAt: new Date("2025-10-01T00:00:00"), amount: D(1000) }], new Date("2026-03-10T00:00:00"), new Date("2026-05-10T00:00:00"), [])).toHaveLength(0);
  });
});

describe("assumptions", () => {
  it("clamps wild values and drops unknown keys", () => {
    const c = sanitizeAssumptions({ inflowHaircutPercent: 500, collectionsDelayDays: -999, junk: 1, recurringOutflows: [{ title: "Rent", amount: 100, dayOfMonth: 40 }, { title: "", amount: 5, dayOfMonth: 1 }] });
    expect(c.inflowHaircutPercent).toBe(100);
    expect(c.collectionsDelayDays).toBe(-30);
    expect(c).not.toHaveProperty("junk");
    expect(c.recurringOutflows).toEqual([{ title: "Rent", amount: 100, dayOfMonth: 31, category: undefined }]);
  });
  it("shares the base cushion across scenarios", () => {
    expect(mergeAssumptions("WORST_CASE", undefined, { minimumCashThreshold: 5000 }).minimumCashThreshold).toBe(5000);
  });
});

describe("manual adjustments", () => {
  const at = new Date("2026-03-10T00:00:00Z");
  it("requires a positive amount, a sane date and a reason", () => {
    const bad = normalizeAdjustment({ date: "nope", amount: -5, direction: "X", reason: "" }, { partial: false, now: at });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.fields.map((f) => f.field).sort()).toEqual(["amount", "date", "direction", "reason"]);
    expect(normalizeAdjustment({ date: "2031-01-01", amount: 5, direction: "INFLOW", reason: "loan" }, { partial: false, now: at }).ok).toBe(false);
  });
  it("accepts a valid one and a partial update", () => {
    expect(normalizeAdjustment({ date: "2026-04-01", amount: 12.345, direction: "OUTFLOW", reason: "Equipment" }, { partial: false, now: at })).toMatchObject({ ok: true, data: { amount: 12.35 } });
    expect(normalizeAdjustment({ amount: 9 }, { partial: true, now: at })).toMatchObject({ ok: true, data: { amount: 9 } });
  });
});
