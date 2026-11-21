import { describe, expect, it } from "vitest";

import { toPdfGst, toPdfLines } from "@/lib/invoice/pdf-params";

describe("toPdfLines", () => {
  it("keeps quantity, unit price, rate and SAC from the composer", () => {
    const [line] = toPdfLines([{ title: "ERP setup", amount: 5000, quantity: 2, unitPrice: 2500, taxRate: 0.18, sacCode: "998313" }], "998000");
    expect(line).toMatchObject({ description: "ERP setup", quantity: 2, unitPrice: 2500, amount: 5000, taxRate: 0.18, sacCode: "998313" });
  });

  it("falls back to quantity 1, the amount as unit price and the default SAC", () => {
    const [line] = toPdfLines([{ title: "Support", amount: 100 }], "998000");
    expect(line).toMatchObject({ quantity: 1, unitPrice: 100, amount: 100, taxRate: null, sacCode: "998000" });
  });

  it("derives the unit price from the amount when only a quantity is given", () => {
    const [line] = toPdfLines([{ title: "Hours", amount: 1000, quantity: 4 }], null);
    expect(line.unitPrice).toBe(250);
    expect(line.sacCode).toBeNull();
  });

  it("accepts string prices and survives nonsense quantities", () => {
    const lines = toPdfLines([
      { title: "A", amount: 10, unitPrice: "2500.50", quantity: 1 },
      { title: "B", amount: 10, quantity: 0 },
      { title: "C", amount: 10, quantity: Number.NaN },
      { title: "D", amount: 10, quantity: -3 },
    ], null);
    expect(lines[0].unitPrice).toBe(2500.5);
    for (const l of lines.slice(1)) {
      expect(l.quantity).toBe(1);
      expect(Number.isFinite(l.unitPrice)).toBe(true);
    }
  });

  it("returns no lines for no services", () => {
    expect(toPdfLines([], null)).toEqual([]);
  });
});

describe("toPdfGst", () => {
  it("uses the invoice's place of supply, else the client's state", () => {
    expect(toPdfGst({ gstStateCode: "27" }, { placeOfSupply: "29" }).placeOfSupply).toBe("29");
    expect(toPdfGst({ gstStateCode: "27" }, undefined).placeOfSupply).toBe("27");
    expect(toPdfGst({ gstStateCode: "99" }, undefined).placeOfSupply).toBeNull();
    expect(toPdfGst({}, undefined).placeOfSupply).toBeNull();
  });

  it("carries reverse charge and SEZ treatment, invoice choice first", () => {
    expect(toPdfGst({ gstSupplyOverride: "SEZ_WP", gstReverseCharge: true }, undefined)).toMatchObject({ supplyOverride: "SEZ_WP", reverseCharge: true });
    expect(toPdfGst({ gstSupplyOverride: "SEZ_WP", gstReverseCharge: true }, { supplyOverride: "SEZ_WOP", reverseCharge: false })).toMatchObject({ supplyOverride: "SEZ_WOP", reverseCharge: false });
  });
});
