import { describe, expect, it } from "vitest";
import { classifyMsme, normalizeUdyam, validateUdyam } from "@/lib/msme/udyam";
import { compositionView, gstThresholdView, nonGstDocument, supplierChargesGst, thresholdLimit } from "@/lib/msme/threshold";
import { allowedDays, msmePayables } from "@/lib/msme/payables";
import { normalizeExpenseGst } from "@/lib/gst/expense-gst";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("Udyam number", () => {
  it("accepts the official format and normalises sloppy input", () => {
    expect(validateUdyam("UDYAM-MH-12-0000001").valid).toBe(true);
    expect(normalizeUdyam(" udyam mh 12 0000001 ")).toBe("UDYAM-MH-12-0000001");
    expect(normalizeUdyam("MH120000001")).toBe("UDYAM-MH-12-0000001");
  });
  it("rejects wrong shapes and empties", () => {
    expect(validateUdyam("UDYAM-MH-12-000001").valid).toBe(false);
    expect(validateUdyam("UDYAM-M1-12-0000001").valid).toBe(false);
    expect(validateUdyam("").reason).toBe("EMPTY");
    expect(validateUdyam("GSTIN123").reason).toBe("FORMAT");
  });
});

describe("MSME classification (limits from 1 April 2025)", () => {
  it("uses both tests when investment is known", () => {
    expect(classifyMsme({ turnover: 5_00_00_000, investment: 1_00_00_000 }).class).toBe("MICRO");
    expect(classifyMsme({ turnover: 5_00_00_000, investment: 5_00_00_000 }).class).toBe("SMALL");
    expect(classifyMsme({ turnover: 200_00_00_000, investment: 1_00_00_000 }).class).toBe("MEDIUM");
    expect(classifyMsme({ turnover: 600_00_00_000 }).class).toBe("NONE");
  });
  it("says so when only turnover was used", () => {
    expect(classifyMsme({ turnover: 20_00_000 }).basis).toBe("TURNOVER_ONLY");
    expect(classifyMsme({ turnover: 20_00_000, investment: 0 }).basis).toBe("BOTH");
  });
});

describe("GST registration threshold", () => {
  it("picks the limit by supply kind and state", () => {
    expect(thresholdLimit("SERVICES", "27").limit).toBe(20_00_000);
    expect(thresholdLimit("GOODS", "27").limit).toBe(40_00_000);
    expect(thresholdLimit("BOTH", "27").limit).toBe(20_00_000);
    expect(thresholdLimit("SERVICES", "14")).toEqual({ limit: 10_00_000, special: true });
    expect(thresholdLimit("GOODS", "16").limit).toBe(20_00_000);
  });
  const base = { registered: false, countryIsIndia: true, kind: "SERVICES" as const, stateCode: "27", fyStart: d("2026-04-01"), now: d("2026-10-01") };
  it("stays quiet well below the limit and projects a crossing date", () => {
    const v = gstThresholdView({ ...base, points: [{ date: d("2026-05-10"), amount: 2_00_000 }, { date: d("2026-08-10"), amount: 2_00_000 }] });
    expect(v.status).toBe("WELL_BELOW");
    expect(v.headroom).toBe(16_00_000);
    expect(v.crossedOn).toBeNull();
    expect(v.projectedCrossing).toBeNull();
  });
  it("warns at 80% and reports the pace", () => {
    const v = gstThresholdView({ ...base, points: [{ date: d("2026-06-10"), amount: 16_50_000 }] });
    expect(v.status).toBe("APPROACHING");
    expect(v.share).toBeGreaterThan(0.8);
    expect(v.projectedCrossing).not.toBeNull();
  });
  it("finds the exact invoice that crossed and gives 30 days to apply", () => {
    const v = gstThresholdView({ ...base, points: [{ date: d("2026-05-01"), amount: 15_00_000 }, { date: d("2026-07-15"), amount: 6_00_000 }, { date: d("2026-09-01"), amount: 1_00_000 }] });
    expect(v.status).toBe("CROSSED");
    expect(v.crossedOn).toBe("2026-07-15");
    expect(v.applyBy).toBe("2026-08-14");
  });
  it("does not flag a registered or foreign business", () => {
    expect(gstThresholdView({ ...base, registered: true, points: [{ date: d("2026-05-01"), amount: 90_00_000 }] }).status).toBe("REGISTERED");
    expect(gstThresholdView({ ...base, countryIsIndia: false, points: [] }).status).toBe("NOT_APPLICABLE");
  });
});

describe("composition and non-GST suppliers", () => {
  it("is limited to 50 lakh for services and 1.5 crore for goods", () => {
    expect(compositionView({ kind: "SERVICES", stateCode: "27", prevTurnover: 40_00_000 }).eligible).toBe(true);
    expect(compositionView({ kind: "SERVICES", stateCode: "27", prevTurnover: 60_00_000 }).eligible).toBe(false);
    expect(compositionView({ kind: "GOODS", stateCode: "27", prevTurnover: 1_40_00_000 }).eligible).toBe(true);
    expect(compositionView({ kind: "BOTH", stateCode: "27", prevTurnover: 1 }).eligible).toBe(false);
  });
  it("charges GST only when registered on the regular scheme", () => {
    expect(supplierChargesGst({ gstRegistrationType: "REGULAR" }, "IN")).toBe(true);
    expect(supplierChargesGst({ gstRegistrationType: "UNREGISTERED" }, "IN")).toBe(false);
    expect(supplierChargesGst({ gstRegistrationType: "COMPOSITION" }, "IN")).toBe(false);
    expect(supplierChargesGst({ gstRegistrationType: "UNREGISTERED" }, "US")).toBe(true);
    expect(supplierChargesGst(null, "IN")).toBe(true);
  });
  it("titles the document honestly", () => {
    expect(nonGstDocument({ gstRegistrationType: "UNREGISTERED" }, "IN")?.note).toMatch(/NOT REGISTERED/);
    expect(nonGstDocument({ gstRegistrationType: "COMPOSITION" }, "IN")?.title).toBe("BILL OF SUPPLY");
    expect(nonGstDocument({ gstRegistrationType: "REGULAR" }, "IN")).toBeNull();
  });
});

describe("section 43B(h) payables", () => {
  it("caps the agreed period at 45 days and defaults to 15", () => {
    expect(allowedDays(null)).toBe(15);
    expect(allowedDays(30)).toBe(30);
    expect(allowedDays(90)).toBe(45);
  });
  const mk = (over: Partial<Parameters<typeof msmePayables>[0][number]>) => ({ id: "1", vendor: "V", date: d("2026-06-01"), amount: 1000, paid: false, paidAt: null, vendorMsme: "MICRO", vendorUdyam: null, ...over });
  it("flags unpaid bills past the limit and late payments, and skips traders", () => {
    const r = msmePayables(
      [mk({ id: "a", agreedDays: 45 }), mk({ id: "b", paid: true, paidAt: d("2026-08-30"), agreedDays: 45 }), mk({ id: "c", paid: true, paidAt: d("2026-06-20"), agreedDays: 45 }), mk({ id: "d", vendorMsme: "MEDIUM" }), mk({ id: "e", date: d("2027-05-01") })],
      d("2026-10-01"),
      d("2027-03-31"),
    );
    expect(r.rows.map((x) => [x.id, x.state])).toEqual([["a", "OVERDUE_UNPAID"], ["b", "PAID_LATE"], ["c", "OK"]]);
    expect(r.unpaidPastDue).toBe(1);
    expect(r.unpaidPastDueAmount).toBe(1000);
    expect(r.paidLate).toBe(1);
  });
});

describe("expense MSME tagging", () => {
  it("keeps a no-GST bill on credit for a small supplier", () => {
    const r = normalizeExpenseGst({ itcStatus: "NONE", paymentStatus: "UNPAID", vendorMsme: "SMALL", vendorUdyam: "udyam mh 12 0000001", vendorAgreedDays: 90 }, 1000, null);
    expect(r.ok && r.data.paymentStatus).toBe("UNPAID");
    expect(r.ok && r.data.vendorUdyam).toBe("UDYAM-MH-12-0000001");
    expect(r.ok && r.data.vendorAgreedDays).toBe(45);
  });
  it("ignores credit for non-MSE suppliers and rejects a bad Udyam number", () => {
    const r = normalizeExpenseGst({ itcStatus: "NONE", paymentStatus: "UNPAID", vendorMsme: "NONE" }, 1000, null);
    expect(r.ok && r.data.paymentStatus).toBe("PAID");
    const bad = normalizeExpenseGst({ itcStatus: "NONE", paymentStatus: "PAID", vendorMsme: "MICRO", vendorUdyam: "nope" }, 1000, null);
    expect(!bad.ok && bad.code).toBe("VENDOR_UDYAM_INVALID");
  });
});
