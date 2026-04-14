import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { summarizeReceivablesForAttention } from "@/lib/dashboard/attention-receivables";

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
