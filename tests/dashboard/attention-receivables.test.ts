import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { buildReceivablesSnapshot, summarizeReceivablesForAttention } from "@/lib/dashboard/attention-receivables";

const makeRow = (overrides: Partial<Parameters<typeof summarizeReceivablesForAttention>[0][number]> = {}) => ({
  invoiceDate: new Date("2026-01-01T00:00:00.000Z"),
  totalAmount: new Prisma.Decimal(1000),
  grandTotal: new Prisma.Decimal(1000),
  amountReceived: 0,
  ...overrides,
});

describe("summarizeReceivablesForAttention", () => {
  const now = new Date("2026-04-13T00:00:00.000Z");

  it("counts invoice-only unpaid state", () => {
    const result = summarizeReceivablesForAttention([makeRow()], now);
    expect(result).toEqual({ overdueReceivables: 1, outstandingReceivables: 1 });
  });

  it("counts receipt-only unpaid state (partial receipt)", () => {
    const result = summarizeReceivablesForAttention([
      makeRow({ amountReceived: 300 }),
    ], now);
    expect(result).toEqual({ overdueReceivables: 1, outstandingReceivables: 1 });
  });

  it("counts mixed invoice + receipt unpaid state", () => {
    const result = summarizeReceivablesForAttention([
      makeRow({ amountReceived: 0 }),
      makeRow({ amountReceived: 250, invoiceDate: new Date("2026-03-20T00:00:00.000Z") }),
    ], now);
    expect(result).toEqual({ overdueReceivables: 1, outstandingReceivables: 2 });
  });

  it("does not count paid receipts", () => {
    const result = summarizeReceivablesForAttention([
      makeRow({ amountReceived: 1000 }),
      makeRow({ amountReceived: 1200 }),
    ], now);
    expect(result).toEqual({ overdueReceivables: 0, outstandingReceivables: 0 });
  });

  it("keeps attention independent from FY slice", () => {
    const result = summarizeReceivablesForAttention([
      makeRow({ invoiceDate: new Date("2024-02-01T00:00:00.000Z"), amountReceived: 0 }),
    ], now);
    expect(result).toEqual({ overdueReceivables: 1, outstandingReceivables: 1 });
  });
});

describe("buildReceivablesSnapshot", () => {
  const now = new Date("2026-04-13T00:00:00.000Z");
  const row = (overrides: Record<string, unknown> = {}) => ({
    id: "inv",
    invoiceNumber: "INV-1",
    clientName: "Acme",
    invoiceDate: new Date("2026-04-01T00:00:00.000Z"),
    dueDate: null as Date | null,
    totalAmount: new Prisma.Decimal(1000),
    grandTotal: new Prisma.Decimal(1000),
    amountReceived: 0,
    ...overrides,
  });

  it("uses the invoice's own due date when it has one", () => {
    // Issued 12 days ago on 7-day terms: overdue, although the old "invoice date + 30" rule said it was not.
    const snapshot = buildReceivablesSnapshot([row({ dueDate: new Date("2026-04-08T00:00:00.000Z") })], now);
    expect(snapshot.overdueReceivables).toBe(1);
    expect(snapshot.watchlist[0].daysOverdue).toBe(5);

    // Issued 40 days ago on 60-day terms: not overdue.
    const longTerms = buildReceivablesSnapshot([row({ invoiceDate: new Date("2026-03-04T00:00:00.000Z"), dueDate: new Date("2026-05-03T00:00:00.000Z") })], now);
    expect(longTerms.overdueReceivables).toBe(0);
    expect(longTerms.aging.notDue.toNumber()).toBe(1000);
  });

  it("converts foreign-currency balances to the base currency", () => {
    const snapshot = buildReceivablesSnapshot([row({ amountReceived: 400, exchangeRate: new Prisma.Decimal(83), dueDate: new Date("2026-03-01T00:00:00.000Z") })], now);
    expect(snapshot.outstandingAmount.toNumber()).toBe(49800);
    expect(snapshot.overdueAmount.toNumber()).toBe(49800);
  });

  it("splits what is owed by days past due", () => {
    const snapshot = buildReceivablesSnapshot(
      [
        row({ id: "a", dueDate: new Date("2026-04-20T00:00:00.000Z") }),
        row({ id: "b", dueDate: new Date("2026-04-01T00:00:00.000Z"), totalAmount: new Prisma.Decimal(200), grandTotal: new Prisma.Decimal(200) }),
        row({ id: "c", dueDate: new Date("2026-03-01T00:00:00.000Z"), totalAmount: new Prisma.Decimal(300), grandTotal: new Prisma.Decimal(300) }),
        row({ id: "d", dueDate: new Date("2026-01-01T00:00:00.000Z"), totalAmount: new Prisma.Decimal(400), grandTotal: new Prisma.Decimal(400) }),
      ],
      now,
    );
    expect(snapshot.aging.notDue.toNumber()).toBe(1000);
    expect(snapshot.aging.days1to30.toNumber()).toBe(200);
    expect(snapshot.aging.days31to60.toNumber()).toBe(300);
    expect(snapshot.aging.days61plus.toNumber()).toBe(400);
    expect(snapshot.dueSoonReceivables).toBe(1);
    expect(snapshot.dueSoon.map((item) => item.id)).toEqual(["a"]);
  });

  it("lists overdue balances first, largest first, then what falls due soonest", () => {
    const snapshot = buildReceivablesSnapshot(
      [
        row({ id: "soon", dueDate: new Date("2026-04-15T00:00:00.000Z"), totalAmount: new Prisma.Decimal(9000), grandTotal: new Prisma.Decimal(9000) }),
        row({ id: "small-late", dueDate: new Date("2026-03-01T00:00:00.000Z"), totalAmount: new Prisma.Decimal(100), grandTotal: new Prisma.Decimal(100) }),
        row({ id: "big-late", dueDate: new Date("2026-04-10T00:00:00.000Z"), totalAmount: new Prisma.Decimal(5000), grandTotal: new Prisma.Decimal(5000) }),
      ],
      now,
    );
    expect(snapshot.watchlist.map((item) => item.id)).toEqual(["big-late", "small-late", "soon"]);
  });

  it("falls back to totalAmount for legacy rows whose grandTotal is zero", () => {
    const snapshot = buildReceivablesSnapshot([row({ grandTotal: new Prisma.Decimal(0), dueDate: new Date("2026-03-01T00:00:00.000Z") })], now);
    expect(snapshot.outstandingAmount.toNumber()).toBe(1000);
  });
});
