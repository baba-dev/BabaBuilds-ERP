import { describe, expect, it } from "vitest";
import { computeExpenseGst, normalizeExpenseGst, vendorStateOf } from "@/lib/gst/expense-gst";
import { resolveClientGstState } from "@/lib/gst/client-state";
import { gstinChecksumChar } from "@/lib/gst/gstin";

const mk = (state: string, pan: string) => { const f = `${state}${pan}1Z`; return f + gstinChecksumChar(f); };
const KA = mk("29", "AAACB2894G");

describe("purchase-bill GST", () => {
  it("splits a GST-inclusive bill: intra-state CGST+SGST, inter-state IGST", () => {
    expect(computeExpenseGst({ amount: 11800, rate: 18, itcStatus: "ELIGIBLE", supplierState: "27", vendorState: "27" })).toMatchObject({ taxable: 10000, cgst: 900, sgst: 900, igst: 0, total: 11800 });
    expect(computeExpenseGst({ amount: 11800, rate: 18, itcStatus: "ELIGIBLE", supplierState: "27", vendorState: "29" })).toMatchObject({ taxable: 10000, igst: 1800, interState: true });
  });
  it("reverse charge adds tax on top of the value of supply", () => {
    expect(computeExpenseGst({ amount: 10000, rate: 18, itcStatus: "REVERSE_CHARGE", supplierState: "27", vendorState: null })).toMatchObject({ taxable: 10000, cgst: 900, sgst: 900, total: 11800 });
  });
  it("no credit status means no tax split", () => {
    expect(computeExpenseGst({ amount: 500, rate: 18, itcStatus: "NONE", supplierState: "27", vendorState: "29" })).toMatchObject({ taxable: 500, igst: 0, cgst: 0 });
  });
  it("validates the vendor GSTIN and requires a rate when claiming credit", () => {
    expect(normalizeExpenseGst({ itcStatus: "ELIGIBLE", vendorGstin: "27AAACL1234F1ZQ", gstRate: 18 }, 1000, "27")).toMatchObject({ ok: false, code: "VENDOR_GSTIN_INVALID" });
    expect(normalizeExpenseGst({ itcStatus: "ELIGIBLE", vendorGstin: KA }, 1000, "27")).toMatchObject({ ok: false, code: "GST_RATE_REQUIRED" });
    const ok = normalizeExpenseGst({ itcStatus: "ELIGIBLE", vendorGstin: KA.toLowerCase(), gstRate: 18, hsnCode: "99 83-14" }, 11800, "27");
    expect(ok).toMatchObject({ ok: true, data: { igstAmount: 1800, vendorStateCode: "29", hsnCode: "998314", vendorGstin: KA } });
  });
  it("takes the vendor state from the GSTIN first", () => {
    expect(vendorStateOf(KA, "07")).toBe("29");
    expect(vendorStateOf(null, "07")).toBe("07");
    expect(vendorStateOf(null, "ZZ")).toBeNull();
  });
});

describe("client GST state", () => {
  it("a valid GSTIN overrides the chosen state; otherwise only real codes are kept", () => {
    expect(resolveClientGstState("07", KA)).toBe("29");
    expect(resolveClientGstState("07", "")).toBe("07");
    expect(resolveClientGstState("99", null)).toBeNull();
    expect(resolveClientGstState(null, "US-EIN-1")).toBeNull();
  });
});
