import { describe, expect, it } from "vitest";
import { getStaleReasons } from "@/app/(dashboard)/cash-flow/_components/primitives/utils";

describe("cash-flow stale reasons", () => {
  it("returns reasons when stamps are newer than generatedAt", () => {
    const reasons = getStaleReasons({
      generatedAtIso: "2026-01-01T00:00:00.000Z",
      stamps: {
        invoices: "2026-01-02T00:00:00.000Z",
        purchaseOrders: null,
        retainers: "2025-12-31T00:00:00.000Z",
        bankTransactions: "2026-01-03T00:00:00.000Z",
        manualAdjustments: null,
        assumptions: null,
      },
    });
    expect(reasons.map((r) => r.type)).toEqual(["BANK_TRANSACTIONS_UPDATED", "INVOICES_UPDATED"]);
  });
});

