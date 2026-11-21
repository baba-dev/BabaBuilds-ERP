import { describe, expect, it } from "vitest";

import { buildGstBreakdown } from "@/lib/invoice/gst-breakdown";
import { r2 } from "@/lib/gst/money";

const lines = [{ amount: 1000, taxRate: 0.18 }];

describe("buildGstBreakdown", () => {
  it("splits an intra-state supply into CGST and SGST", () => {
    const b = buildGstBreakdown({ lines, gst: { supplierStateCode: "29", placeOfSupply: "29" }, isExport: false, isTaxExempt: false, totalTaxAmount: 180 });
    expect(b.kind).toBe("INTRA");
    expect([b.cgst, b.sgst, b.igst, b.totalTax]).toEqual([90, 90, 0, 180]);
    expect(b.placeOfSupplyName).toBe("Karnataka");
    expect(b.rows).toEqual([{ ratePercent: 18, taxable: 1000, cgst: 90, sgst: 90, igst: 0, total: 180 }]);
  });

  it("charges IGST on an inter-state supply", () => {
    const b = buildGstBreakdown({ lines, gst: { supplierStateCode: "29", placeOfSupply: "27" }, isExport: false, isTaxExempt: false, totalTaxAmount: 180 });
    expect(b.kind).toBe("INTER");
    expect([b.cgst, b.sgst, b.igst]).toEqual([0, 0, 180]);
  });

  it("treats SEZ supplies as inter-state even within the same state", () => {
    const b = buildGstBreakdown({ lines, gst: { supplierStateCode: "29", placeOfSupply: "29", supplyOverride: "SEZ_WP" }, isExport: false, isTaxExempt: false, totalTaxAmount: 180 });
    expect(b.kind).toBe("INTER");
    expect(b.supplyOverride).toBe("SEZ_WP");
  });

  it("reports exports with no tax", () => {
    const flagged = buildGstBreakdown({ lines, gst: { supplierStateCode: "29" }, isExport: true, isTaxExempt: true, totalTaxAmount: 0 });
    expect(flagged.kind).toBe("EXPORT");
    const byPos = buildGstBreakdown({ lines, gst: { supplierStateCode: "29", placeOfSupply: "96" }, isExport: false, isTaxExempt: false, totalTaxAmount: 0 });
    expect(byPos.kind).toBe("EXPORT");
    expect(byPos.totalTax).toBe(0);
  });

  it("returns NONE when exempt, when no GST input is given, or when a state is unknown", () => {
    expect(buildGstBreakdown({ lines, gst: { supplierStateCode: "29", placeOfSupply: "29" }, isExport: false, isTaxExempt: true, totalTaxAmount: 0 }).kind).toBe("NONE");
    expect(buildGstBreakdown({ lines, isExport: false, isTaxExempt: false, totalTaxAmount: 180 }).kind).toBe("NONE");
    expect(buildGstBreakdown({ lines, gst: { supplierStateCode: "29" }, isExport: false, isTaxExempt: false, totalTaxAmount: 180 }).kind).toBe("NONE");
  });

  it("keeps per-rate rows and the head split equal to the invoice tax, to the paisa (mixed rates, odd paise)", () => {
    const mixed = [
      { amount: 100.01, taxRate: 0.18 },
      { amount: 50.03, taxRate: 0.05 },
      { amount: 0.01, taxRate: 0.12 },
      { amount: 33.33, taxRate: 0.18 },
    ];
    const unrounded = mixed.reduce((sum, l) => sum + l.amount * l.taxRate, 0);
    const totalTaxAmount = r2(unrounded);
    for (const pos of ["29", "27"]) {
      const b = buildGstBreakdown({ lines: mixed, gst: { supplierStateCode: "29", placeOfSupply: pos }, isExport: false, isTaxExempt: false, totalTaxAmount });
      expect(b.rows.map((r) => r.ratePercent)).toEqual([5, 12, 18]);
      expect(r2(b.rows.reduce((s, r) => s + r.total, 0))).toBe(totalTaxAmount);
      expect(r2(b.cgst + b.sgst + b.igst)).toBe(totalTaxAmount);
      expect(b.totalTax).toBe(totalTaxAmount);
      for (const row of b.rows) expect(r2(row.cgst + row.sgst + row.igst)).toBe(row.total);
    }
  });

  it("does not throw on empty lines", () => {
    const b = buildGstBreakdown({ lines: [], gst: { supplierStateCode: "29", placeOfSupply: "29" }, isExport: false, isTaxExempt: false, totalTaxAmount: 0 });
    expect(b.kind).toBe("NONE");
    expect(b.rows).toEqual([]);
  });

  it("passes reverse charge and IRN details through", () => {
    const b = buildGstBreakdown({ lines, gst: { supplierStateCode: "29", placeOfSupply: "29", reverseCharge: true, irn: "abc", irnAckNo: "123", irnAckDate: new Date("2026-04-27") }, isExport: false, isTaxExempt: false, totalTaxAmount: 180 });
    expect(b.reverseCharge).toBe(true);
    expect(b.irn).toBe("abc");
    expect(b.irnAckNo).toBe("123");
  });
});
