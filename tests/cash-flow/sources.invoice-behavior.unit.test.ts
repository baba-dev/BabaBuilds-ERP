import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { invoiceToForecastLines } from "@/lib/cash-flow/sources";

describe("cash-flow invoice behavior adjustments (unit)", () => {
  it("adds behavior delay beyond terms days to expected date", () => {
    const invoiceDate = new Date("2026-01-01T00:00:00.000Z");
    const invoice = {
      id: "inv_1",
      invoiceNumber: "001",
      clientName: "Client A",
      invoiceDate,
      dueDate: null,
      expectedPaymentDate: null,
      paymentTermsDays: 15,
      clientId: "c1",
      status: "PENDING" as const,
      totalAmount: new Prisma.Decimal(1000),
      amountReceived: 0,
    };

    const lines = invoiceToForecastLines({
      invoice,
      workspaceDefaults: { paymentTermsDays: 15 },
      paymentBehavior: { avgDaysToPay: 25, medianDaysToPay: 25, onTimeRate: 0.8, lateRate: 0.2, partialPaymentRate: 0.0 },
      scenarioTag: "BASE",
      collectionsDelayDays: 0,
      inflowHaircutPercent: 0,
    });

    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    // baseDate = invoiceDate + 15 days; behaviorDelay = 25 - 15 = 10 days => total 25 days from invoice date
    expect(new Date(line.expectedDate).toISOString().slice(0, 10)).toBe("2026-01-26");
  });

  it("does not apply negative behavior delay", () => {
    const invoiceDate = new Date("2026-01-01T00:00:00.000Z");
    const invoice = {
      id: "inv_2",
      invoiceNumber: "002",
      clientName: "Client B",
      invoiceDate,
      dueDate: null,
      expectedPaymentDate: null,
      paymentTermsDays: 30,
      clientId: "c2",
      status: "PENDING" as const,
      totalAmount: new Prisma.Decimal(1000),
      amountReceived: 0,
    };

    const lines = invoiceToForecastLines({
      invoice,
      workspaceDefaults: { paymentTermsDays: 30 },
      paymentBehavior: { avgDaysToPay: 10, medianDaysToPay: 10, onTimeRate: 0.9, lateRate: 0.1, partialPaymentRate: 0.0 },
      scenarioTag: "BASE",
      collectionsDelayDays: 0,
      inflowHaircutPercent: 0,
    });

    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    expect(new Date(line.expectedDate).toISOString().slice(0, 10)).toBe("2026-01-31");
  });
});

