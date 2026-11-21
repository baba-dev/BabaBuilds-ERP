import { describe, expect, it } from "vitest";

import { designUsesPaymentQrs, toPdfGst, toPdfLines, toPdfPaymentQrs } from "@/lib/invoice/pdf-params";

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

describe("toPdfPaymentQrs", () => {
  const img = (label: string, sortOrder: number) => ({ label, imagePath: `/payment-qr/ws/${label}.png`, sortOrder });

  it("is empty when nothing is configured", () => {
    expect(toPdfPaymentQrs({}, [])).toEqual({ upi: undefined, staticQrs: [] });
    expect(toPdfPaymentQrs({ upiVpa: null, upiPayeeName: null }, [])).toEqual({ upi: undefined, staticQrs: [] });
  });

  it("normalises a valid UPI ID and payee name, and ignores an invalid ID", () => {
    expect(toPdfPaymentQrs({ upiVpa: " Shop@OKHDFC ", upiPayeeName: " Baba  Sons " }, []).upi).toEqual({ vpa: "shop@okhdfc", payeeName: "Baba Sons" });
    expect(toPdfPaymentQrs({ upiVpa: "not a vpa", upiPayeeName: "Baba" }, []).upi).toBeUndefined();
  });

  it("orders uploaded images by their sort order and keeps at most three", () => {
    const { staticQrs } = toPdfPaymentQrs({}, [img("D", 3), img("B", 1), img("A", 0), img("C", 2)]);
    expect(staticQrs.map((q) => q.label)).toEqual(["A", "B", "C"]);
    expect(staticQrs[0]).toEqual({ label: "A", imagePath: "/payment-qr/ws/A.png" });
  });
});

describe("designUsesPaymentQrs", () => {
  it("is true only for Pay-Fast and the receipt", () => {
    expect(designUsesPaymentQrs("DESIGN_4")).toBe(true);
    expect(designUsesPaymentQrs("DESIGN_8")).toBe(true);
    for (const id of ["DESIGN_1", "DESIGN_2", "DESIGN_3", "DESIGN_5", "DESIGN_6", "DESIGN_7", "", null, undefined]) expect(designUsesPaymentQrs(id as string | null | undefined), String(id)).toBe(false);
  });
});
