import { describe, expect, it } from "vitest";
import { gstinChecksumChar } from "@/lib/gst/gstin";
import { catalogCodeStatus, counterSalePlace, parseProductGst, previewGst, rateStatus, resolveTreatment, snapshotGstFields, validateTaxCode, type PreviewInput } from "@/lib/gst/source";
import { parseClientGstInput } from "@/lib/gst/client-state";
import { lineIsGoods, needsEway } from "@/lib/gst/eway";
import { classifyInvoice } from "@/lib/gst/classify";
import { lookupRegistration } from "@/lib/gst/gsp";

function makeGstin(state: string, pan: string) {
  const first14 = `${state}${pan}1Z`;
  return first14 + gstinChecksumChar(first14);
}
const MH = makeGstin("27", "AABCU9603R");
const KA = makeGstin("29", "AAACB2894G");

const base = (over: Partial<PreviewInput> = {}): PreviewInput => ({
  supplierState: "27",
  applicable: true,
  party: { country: "IN", gstin: null, stateCode: "27" },
  lines: [{ amount: 10000, ratePercent: 18, sacCode: "998313" }],
  defaultRate: 18,
  ...over,
});

describe("tax codes", () => {
  it("accepts 4/6/8 digit HSN and 4/6 digit SAC", () => {
    expect(validateTaxCode("8471")).toMatchObject({ valid: true, kind: "HSN" });
    expect(validateTaxCode("84713010")).toMatchObject({ valid: true, kind: "HSN" });
    expect(validateTaxCode("998313")).toMatchObject({ valid: true, kind: "SAC" });
    expect(validateTaxCode("9983")).toMatchObject({ valid: true, kind: "SAC" });
  });
  it("rejects malformed codes", () => {
    expect(validateTaxCode("")).toMatchObject({ valid: false, reason: "EMPTY" });
    expect(validateTaxCode("84A1")).toMatchObject({ valid: false, reason: "NOT_DIGITS" });
    expect(validateTaxCode("847")).toMatchObject({ valid: false, reason: "LENGTH" });
    expect(validateTaxCode("99831")).toMatchObject({ valid: false, reason: "SAC_LENGTH" });
  });
  it("flags the removed 12% and 28% slabs", () => {
    expect(rateStatus(18)).toBe("OK");
    expect(rateStatus(40)).toBe("OK");
    expect(rateStatus(12)).toBe("LEGACY");
    expect(rateStatus(28)).toBe("LEGACY");
    expect(rateStatus(13)).toBe("UNUSUAL");
    expect(catalogCodeStatus("998313", 28).rateStatus).toBe("LEGACY");
  });
});

describe("standing treatment", () => {
  it("lets the invoice override the customer default", () => {
    expect(resolveTreatment({ gstSupplyOverride: "SEZ_WP", gstReverseCharge: true }, null)).toEqual({ placeOfSupply: null, supplyOverride: "SEZ_WP", reverseCharge: true });
    expect(resolveTreatment({ gstSupplyOverride: "SEZ_WP" }, { supplyOverride: "SEZ_WOP", reverseCharge: false })).toMatchObject({ supplyOverride: "SEZ_WOP", reverseCharge: false });
  });
  it("snapshots only what applies, and ignores junk", () => {
    expect(snapshotGstFields({ gstSupplyOverride: "SEZ_WOP", gstReverseCharge: false })).toEqual({ gstSupplyOverride: "SEZ_WOP" });
    expect(snapshotGstFields({}, { placeOfSupply: "99" })).toEqual({});
    expect(snapshotGstFields({ gstReverseCharge: true }, { placeOfSupply: "29" })).toEqual({ gstPlaceOfSupply: "29", gstReverseCharge: true });
  });
  it("keeps a SEZ customer SEZ on every recurring invoice", () => {
    const client = { gstSupplyOverride: "SEZ_WP", gstReverseCharge: false };
    const first = snapshotGstFields(client);
    const second = snapshotGstFields(client);
    expect(first).toEqual(second);
    expect(first.gstSupplyOverride).toBe("SEZ_WP");
  });
});

describe("previewGst", () => {
  it("splits CGST/SGST for an intra-state B2B sale", () => {
    const p = previewGst(base({ party: { country: "IN", gstin: MH, stateCode: null } }));
    expect(p.supplyType).toBe("B2B");
    expect(p.interState).toBe(false);
    expect(p.split).toEqual({ cgst: 900, sgst: 900, igst: 0 });
    expect(p.total).toBe(11800);
    expect(p.warnings).toEqual([]);
  });
  it("uses IGST between states and reads the state from the GSTIN", () => {
    const p = previewGst(base({ party: { country: "IN", gstin: KA, stateCode: null } }));
    expect(p.placeOfSupply).toBe("29");
    expect(p.split).toEqual({ cgst: 0, sgst: 0, igst: 1800 });
  });
  it("warns when the customer has no state and when the SAC is missing or invalid", () => {
    const p = previewGst(base({ party: { country: "IN", gstin: null, stateCode: null }, lines: [{ amount: 100, ratePercent: 18, sacCode: null }, { amount: 100, ratePercent: 18, sacCode: "12" }] }));
    const codes = p.warnings.map((w) => w.code);
    expect(codes).toContain("CLIENT_STATE_MISSING");
    expect(p.warnings.find((w) => w.code === "SAC_MISSING")?.line).toBe(0);
    expect(p.warnings.find((w) => w.code === "SAC_INVALID")?.line).toBe(1);
  });
  it("flags legacy rates", () => {
    const p = previewGst(base({ lines: [{ amount: 100, ratePercent: 12, sacCode: "998313" }] }));
    expect(p.warnings.map((w) => w.code)).toContain("LEGACY_RATE");
  });
  it("recognises an export, with a warning when tax is charged", () => {
    const p = previewGst(base({ party: { country: "US", gstin: null, stateCode: null } }));
    expect(p.placeOfSupply).toBe("96");
    expect(p.supplyType).toBe("EXPWP");
    expect(p.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["EXPORT", "EXPORT_WITH_TAX"]));
    const zero = previewGst(base({ party: { country: "US", gstin: null, stateCode: null }, lines: [{ amount: 100, ratePercent: 0, sacCode: "998313" }] }));
    expect(zero.supplyType).toBe("EXPWOP");
  });
  it("treats a SEZ customer as inter-state IGST even in the same state", () => {
    const p = previewGst(base({ party: { country: "IN", gstin: MH, stateCode: "27", gstSupplyOverride: "SEZ_WP" } }));
    expect(p.supplyType).toBe("SEZWP");
    expect(p.split.igst).toBe(1800);
    expect(p.warnings.map((w) => w.code)).toContain("SEZ");
  });
  it("needs a GSTIN for SEZ and notes reverse charge", () => {
    const sez = previewGst(base({ party: { country: "IN", gstin: null, stateCode: "29", gstSupplyOverride: "SEZ_WP" } }));
    expect(sez.warnings.map((w) => w.code)).toContain("SEZ_NEEDS_GSTIN");
    const rcm = previewGst(base({ party: { country: "IN", gstin: MH, stateCode: null, gstReverseCharge: true } }));
    expect(rcm.supplyType).toBe("B2B_RCM");
    expect(rcm.warnings.map((w) => w.code)).toContain("REVERSE_CHARGE");
  });
  it("lets an invoice-level place of supply win", () => {
    const p = previewGst(base({ overrides: { placeOfSupply: "29" } }));
    expect(p.placeOfSupply).toBe("29");
    expect(p.interState).toBe(true);
  });
  it("reports a tax-exempt client and charges nothing", () => {
    const p = previewGst(base({ party: { country: "IN", gstin: MH, stateCode: null, taxExempt: true } }));
    expect(p.tax).toBe(0);
    expect(p.warnings.map((w) => w.code)).toContain("TAX_EXEMPT_CLIENT");
  });
  it("is silent when GST does not apply and asks for the supplier state", () => {
    expect(previewGst(base({ applicable: false })).applicable).toBe(false);
    expect(previewGst(base({ supplierState: null })).warnings.map((w) => w.code)).toContain("SUPPLIER_STATE_MISSING");
  });
  it("applies the default rate to lines with none", () => {
    const p = previewGst(base({ lines: [{ amount: 1000, ratePercent: null, sacCode: "998313" }], defaultRate: 5 }));
    expect(p.tax).toBe(50);
  });
});

describe("counter sales", () => {
  it("places an anonymous domestic buyer in the supplier's state", () => {
    expect(counterSalePlace({ country: "IN" }, "27")).toBe("27");
    expect(counterSalePlace({ country: "" }, "27")).toBe("27");
  });
  it("leaves identified, foreign or stateless-supplier cases alone", () => {
    expect(counterSalePlace({ country: "IN", gstStateCode: "29" }, "27")).toBeNull();
    expect(counterSalePlace({ country: "IN", taxId: KA }, "27")).toBeNull();
    expect(counterSalePlace({ country: "US" }, "27")).toBeNull();
    expect(counterSalePlace({ country: "IN" }, null)).toBeNull();
  });
  it("does not flag STATE_ASSUMED once the place is written", () => {
    const base2 = { id: "1", number: "1", date: new Date(), voided: false, voidedAt: null, exchangeRate: 1, subtotal: 100, taxAmount: 18, total: 118, taxRate: 0.18, sacCode: "8471", isExemptMode: false, items: [], clientId: null, clientName: "Walk-in", recipientGstin: null, clientCountry: "IN", clientStateCode: null, reverseCharge: false };
    expect(classifyInvoice({ ...base2, placeOfSupplyOverride: null }, "27").issues).toContain("STATE_ASSUMED");
    expect(classifyInvoice({ ...base2, placeOfSupplyOverride: "27" }, "27").issues).not.toContain("STATE_ASSUMED");
  });
});

describe("product and client input", () => {
  it("parses product HSN and rate", () => {
    expect(parseProductGst("8471 30", "18")).toEqual({ ok: true, hsnCode: "847130", gstRate: 18 });
    expect(parseProductGst("", "")).toEqual({ ok: true, hsnCode: null, gstRate: null });
    expect(parseProductGst("998313", "18")).toMatchObject({ ok: false, code: "HSN_INVALID" });
    expect(parseProductGst("84", "18")).toMatchObject({ ok: false, code: "HSN_INVALID" });
    expect(parseProductGst("8471", "150")).toMatchObject({ ok: false, code: "RATE_INVALID" });
  });
  it("validates the client's GSTIN and reads the state from it", () => {
    const ok = parseClientGstInput({ country: "India", taxId: KA, state: "27", supplyOverride: "", reverseCharge: "false" });
    expect(ok).toMatchObject({ ok: true, data: { gstStateCode: "29", gstSupplyOverride: null, gstReverseCharge: false } });
    expect(parseClientGstInput({ country: "IN", taxId: "29AAACB2894G1Z0", state: "", supplyOverride: "", reverseCharge: "" })).toMatchObject({ ok: false, code: "GSTIN_INVALID" });
    expect(parseClientGstInput({ country: "IN", taxId: "AAACB2894G", state: "29", supplyOverride: "", reverseCharge: "" })).toMatchObject({ ok: true, data: { gstStateCode: "29" } });
  });
  it("never holds a foreign tax ID to GSTIN rules, and SEZ needs a valid GSTIN", () => {
    expect(parseClientGstInput({ country: "US", taxId: "12-3456789", state: "27", supplyOverride: "", reverseCharge: "true" })).toMatchObject({ ok: true, data: { gstStateCode: null, gstReverseCharge: false } });
    expect(parseClientGstInput({ country: "IN", taxId: "", state: "27", supplyOverride: "SEZ_WP", reverseCharge: "" })).toMatchObject({ ok: false, code: "SEZ_NEEDS_GSTIN" });
    expect(parseClientGstInput({ country: "IN", taxId: MH, state: "", supplyOverride: "SEZ_WOP", reverseCharge: "true" })).toMatchObject({ ok: true, data: { gstSupplyOverride: "SEZ_WOP", gstReverseCharge: true } });
  });
});

describe("e-way eligibility from the product master", () => {
  const line = (hsn: string, goods?: boolean) => ({ hsn, goods, rate: 18, description: "", quantity: 1, taxable: 60000, igst: 0, cgst: 0, sgst: 0, cess: 0, nil: false });
  it("trusts the product link over the HSN prefix", () => {
    expect(lineIsGoods(line("", true))).toBe(true);
    expect(lineIsGoods(line("998313", false))).toBe(false);
    expect(lineIsGoods(line("8471"))).toBe(true);
    expect(lineIsGoods(line("998313"))).toBe(false);
  });
  it("needs a bill for linked goods above the threshold, not for services", () => {
    expect(needsEway({ value: 70800, lines: [line("8471", true)] })).toBe(true);
    expect(needsEway({ value: 70800, lines: [line("998313", false)] })).toBe(false);
    expect(needsEway({ value: 40000, lines: [line("8471", true)] })).toBe(false);
  });
});

describe("registration lookup", () => {
  it("rejects a bad GSTIN before asking anyone", async () => {
    expect(await lookupRegistration("nope")).toMatchObject({ ok: false, code: "GSTIN_INVALID" });
  });
  it("reports that no provider is connected", async () => {
    expect(await lookupRegistration(MH)).toMatchObject({ ok: false, code: "GSP_NOT_CONFIGURED" });
  });
});
