import { describe, expect, it } from "vitest";
import { gstinChecksumChar } from "@/lib/gst/gstin";
import { classifyInvoice, type InvoiceInput } from "@/lib/gst/classify";
import { buildGstr1, gstr1PortalJson } from "@/lib/gst/gstr1";
import { buildBooks, claimDate, rule37Movement, type ExpenseGstInput } from "@/lib/gst/books";
import { buildGstr3b } from "@/lib/gst/gstr3b";
import { eInvoiceStatus, buildEInvoicePayload, isValidIrn, needsEInvoice } from "@/lib/gst/einvoice";
import { buildEwayBulkJson, needsEway, validateTransport } from "@/lib/gst/eway";
import { findNumberGaps, rule42Reversal } from "@/lib/gst/gaps";
import { buildZip, crc32 } from "@/lib/gst/zip";
import { buildTallyXml } from "@/lib/gst/tally";
import { csvText } from "@/lib/gst/exports";
import { explainSources } from "@/lib/gst/explain";
import { splitAdvance, splitTax, debitNoteSchema } from "@/lib/gst/docs";
import { exposureOf } from "@/lib/gst/exposure";
import { planDigest, planReminders } from "@/lib/gst/reminder-plan";
import { reconcileGstr2b, similarInvoiceNumbers } from "@/lib/gst/recon";
import { buildGstr9 } from "@/lib/gst/gstr9";
import { buildLedger } from "@/lib/gst/gstr3b";
import { zeroHeads } from "@/lib/gst/money";
import type { GstOverview, ObligationView } from "@/lib/gst/service";

const mk = (state: string, pan: string) => { const f = `${state}${pan}1Z`; return f + gstinChecksumChar(f); };
const MH = mk("27", "AABCU9603R");
const SEZ = mk("24", "AAACS1234E");
const KA = mk("29", "AAACB2894G");
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);
const period = { start: D("2026-09-01"), end: new Date("2026-09-30T23:59:59.999Z") };

let seq = 0;
function inv(over: Partial<InvoiceInput> & { amount?: number; rate?: number } = {}): InvoiceInput {
  const amount = over.amount ?? 100000;
  const rate = over.rate ?? 0.18;
  seq += 1;
  return {
    id: `i${seq}`, number: over.number ?? `INV-${String(seq).padStart(3, "0")}`, date: over.date ?? D("2026-09-10"), voided: false, voidedAt: null, exchangeRate: 1,
    subtotal: amount, taxAmount: amount * rate, total: amount * (1 + rate), taxRate: rate, sacCode: "998313", isExemptMode: rate === 0,
    items: [{ description: "Consulting", quantity: 1, amount, taxRate: rate, sacCode: "998313" }],
    clientId: "c1", clientName: "Client", recipientGstin: null, clientCountry: "IN", clientStateCode: null, placeOfSupplyOverride: null, reverseCharge: false, ...over,
  } as InvoiceInput;
}
const exp = (over: Partial<ExpenseGstInput> = {}): ExpenseGstInput => ({ id: "e1", date: D("2026-09-05"), vendor: "Vendor", vendorGstin: KA, vendorInvoiceNo: "V-1", vendorStateCode: "29", category: "Software", hsn: "998314", rate: 18, amount: 11800, igst: 1800, cgst: 0, sgst: 0, cess: 0, itcStatus: "ELIGIBLE", ...over });

describe("SEZ and e-commerce", () => {
  it("classifies SEZ supplies as inter-state zero-rated tables, with and without payment", () => {
    const wp = classifyInvoice(inv({ recipientGstin: SEZ, supplyOverride: "SEZ_WP" }), "27");
    expect(wp.supplyType).toBe("SEZWP");
    expect(wp.lines[0]).toMatchObject({ igst: 18000, cgst: 0 });
    const wop = classifyInvoice(inv({ recipientGstin: SEZ, supplyOverride: "SEZ_WOP", rate: 0 }), "27");
    expect(wop.supplyType).toBe("SEZWOP");
    const noGstin = classifyInvoice(inv({ supplyOverride: "SEZ_WP" }), "27");
    expect(noGstin.issues).toContain("SEZ_NEEDS_GSTIN");
    expect(noGstin.supplyType).not.toBe("SEZWP");
  });
  it("puts SEZ in 6B, counts it as zero-rated in 3B and groups e-commerce supplies in table 14", () => {
    const eco = mk("29", "AAACE1111A");
    const invoices = [
      classifyInvoice(inv({ recipientGstin: SEZ, supplyOverride: "SEZ_WP", number: "S-1" }), "27"),
      classifyInvoice(inv({ clientStateCode: "27", amount: 10000, ecoGstin: eco, number: "E-1" }), "27"),
    ];
    const r = buildGstr1({ periodKey: "2026-09", ...period, invoices, creditNotes: [], prevTurnover: 0 });
    expect(r.sez[0].invoices[0].number).toBe("S-1");
    expect(r.eco).toEqual([expect.objectContaining({ gstin: eco, invoices: 1, taxable: 10000 })]);
    const b = buildBooks({ gstr1: r, expenses: [], adjustments: [] });
    expect(b.zeroRatedWithPayment.igst).toBe(18000);
    expect(b.outward.taxable).toBe(10000);
    const json = gstr1PortalJson(r, MH) as { sez: Array<{ ctin: string; inv: Array<{ sply_ty: string }> }> };
    expect(json.sez[0]).toMatchObject({ ctin: SEZ, inv: [{ sply_ty: "WPAY" }] });
  });
});

describe("debit notes, amendments and advances", () => {
  const base = [classifyInvoice(inv({ recipientGstin: MH, number: "B-1" }), "27")];
  it("debit notes add to the period and are reported as notes", () => {
    const r = buildGstr1({ periodKey: "2026-09", ...period, invoices: base, creditNotes: [], prevTurnover: 0,
      debitNotes: [{ id: "d1", number: "DN-1", date: D("2026-09-20"), invoiceNumber: "B-0", invoiceDate: D("2026-08-01"), name: "Tata", gstin: MH, pos: "27", rate: 18, taxable: 10000, igst: 0, cgst: 900, sgst: 900, cess: 0, reason: "Extra scope" }] });
    expect(r.cdnr[0].notes[0]).toMatchObject({ number: "DN-1", noteType: "D" });
    expect(r.summary.taxable).toBe(110000);
    expect(r.summary.debitNoteCount).toBe(1);
    expect(r.docs.map((d) => d.type)).toContain("DEBIT_NOTE");
  });
  it("amendments change the period only by the difference and only in their own period", () => {
    const amendment = { id: "a1", periodKey: "2026-09", originalPeriodKey: "2026-07", originalNumber: "B-0", originalDate: D("2026-07-10"), name: "Tata", gstin: MH, pos: "27", rate: 18,
      original: { taxable: 100000, igst: 0, cgst: 9000, sgst: 9000, cess: 0 }, revised: { taxable: 80000, igst: 0, cgst: 7200, sgst: 7200, cess: 0 }, reason: "Discount" };
    const r = buildGstr1({ periodKey: "2026-09", ...period, invoices: [], creditNotes: [], amendments: [amendment, { ...amendment, id: "a2", periodKey: "2026-10" }], prevTurnover: 0 });
    expect(r.amendments.b2b).toHaveLength(1);
    expect(r.summary).toMatchObject({ taxable: -20000, cgst: -1800, sgst: -1800 });
  });
  it("advances add tax when received and take it off again when adjusted", () => {
    const adv = splitAdvance(118000, 18, "27", "27");
    expect(adv).toMatchObject({ taxable: 100000, cgst: 9000, sgst: 9000 });
    const item = { id: "v1", party: "P", gstin: null, pos: "27", rate: 18, adjustedInvoice: null, receivedAt: D("2026-08-20"), adjustedAt: D("2026-09-15"), taxable: adv.taxable, igst: adv.igst, cgst: adv.cgst, sgst: adv.sgst };
    const aug = buildGstr1({ periodKey: "2026-08", start: D("2026-08-01"), end: new Date("2026-08-31T23:59:59.999Z"), invoices: [], creditNotes: [], advances: [item], prevTurnover: 0 });
    expect(aug.summary).toMatchObject({ taxable: 100000, cgst: 9000 });
    const sep = buildGstr1({ periodKey: "2026-09", ...period, invoices: [], creditNotes: [], advances: [item], prevTurnover: 0 });
    expect(sep.summary).toMatchObject({ taxable: -100000, cgst: -9000 });
  });
  it("splits tax by place of supply and validates input", () => {
    expect(splitTax(10000, 18, "29", "27")).toEqual({ igst: 1800, cgst: 0, sgst: 0 });
    expect(splitTax(10000, 18, "27", "27")).toEqual({ igst: 0, cgst: 900, sgst: 900 });
    expect(debitNoteSchema.safeParse({ noteNumber: "1", issuedAt: "2026-09-01", recipientName: "A", recipientGstin: "BAD", pos: "27", rate: 18, taxable: 5, reason: "xyz" }).success).toBe(false);
    expect(debitNoteSchema.safeParse({ noteNumber: "1", issuedAt: "2026-09-01", recipientName: "A", recipientGstin: MH.toLowerCase(), pos: "27", rate: 18, taxable: 5, reason: "xyz" }).success).toBe(true);
  });
});

describe("input-credit controls", () => {
  it("holding a bill keeps its credit out of 4(A) but still shows it", () => {
    const gstr1 = buildGstr1({ periodKey: "2026-09", ...period, invoices: [], creditNotes: [], prevTurnover: 0 });
    const b = buildBooks({ gstr1, expenses: [exp({ itcHeld: true }), exp({ id: "e2" })], adjustments: [] });
    expect(b.itcOther.igst).toBe(1800);
    expect(b.itcHeld.igst).toBe(1800);
    expect(buildGstr3b("2026-09", b).payment.itcHeld.igst).toBe(1800);
  });
  it("a bill claimed later moves to the claim month, never earlier than the bill", () => {
    expect(claimDate(exp({ itcClaimMonth: "2026-11" })).toISOString().slice(0, 10)).toBe("2026-11-01");
    expect(claimDate(exp({ itcClaimMonth: "2026-07" })).toISOString().slice(0, 10)).toBe("2026-09-05");
    expect(claimDate(exp()).toISOString().slice(0, 10)).toBe("2026-09-05");
  });
  it("rule 37 reverses credit on bills unpaid after 180 days and reclaims it on payment", () => {
    const bill = exp({ date: D("2026-01-01"), paymentStatus: "UNPAID", paidAt: null });
    const lapse = new Date(D("2026-01-01").getTime() + 180 * 86400000);
    expect(lapse.toISOString().slice(0, 10)).toBe("2026-06-30");
    expect(rule37Movement([bill], D("2026-06-01"), new Date("2026-06-30T23:59:59Z")).reversal.igst).toBe(1800);
    expect(rule37Movement([bill], D("2026-07-01"), new Date("2026-07-31T23:59:59Z")).reversal.igst).toBe(0);
    const paidLate = { ...bill, paymentStatus: "PAID", paidAt: D("2026-08-10") };
    expect(rule37Movement([paidLate], D("2026-06-01"), new Date("2026-06-30T23:59:59Z")).reversal.igst).toBe(1800);
    expect(rule37Movement([paidLate], D("2026-08-01"), new Date("2026-08-31T23:59:59Z")).reclaim.igst).toBe(1800);
    const paidInTime = { ...bill, paymentStatus: "PAID", paidAt: D("2026-03-01") };
    expect(rule37Movement([paidInTime], D("2026-06-01"), new Date("2026-06-30T23:59:59Z")).reversal.igst).toBe(0);
    expect(rule37Movement([exp({ date: D("2026-01-01") })], D("2026-06-01"), new Date("2026-06-30T23:59:59Z")).reversal.igst).toBe(0);
  });
  it("TDS/TCS credit reduces the cash payable but never below zero", () => {
    const gstr1 = buildGstr1({ periodKey: "2026-09", ...period, invoices: [classifyInvoice(inv({ recipientGstin: MH }), "27")], creditNotes: [], prevTurnover: 0 });
    const b = buildBooks({ gstr1, expenses: [], adjustments: [{ id: "t", periodKey: "2026-09", kind: "TDS_CREDIT", igst: 0, cgst: 2000, sgst: 50000, cess: 0, notes: null }] });
    const r = buildGstr3b("2026-09", b);
    expect(r.payment.cashCredits).toMatchObject({ cgst: 2000, sgst: 9000 });
    expect(r.payment.cash).toMatchObject({ cgst: 7000, sgst: 0 });
  });
  it("rule 42 splits common credit by exempt turnover", () => {
    expect(rule42Reversal({ commonCredit: 100000, exemptTurnover: 250000, totalTurnover: 1000000 })).toBe(25000);
    expect(rule42Reversal({ commonCredit: 100, exemptTurnover: 0, totalTurnover: 1000 })).toBe(0);
    expect(rule42Reversal({ commonCredit: 100, exemptTurnover: 5, totalTurnover: 0 })).toBe(0);
  });
});

describe("e-invoice and e-way bill", () => {
  it("applies above ₹5 crore and gives a 30-day window above ₹10 crore", () => {
    expect(needsEInvoice(40_000_000, "B2B")).toBe(false);
    expect(needsEInvoice(60_000_000, "B2B")).toBe(true);
    expect(needsEInvoice(60_000_000, "B2CS")).toBe(false);
    const now = new Date("2026-09-20T00:00:00Z");
    expect(eInvoiceStatus({ prevTurnover: 60_000_000, invoiceDate: D("2026-08-01"), supplyType: "B2B", irn: null, now }).status).toBe("PENDING");
    expect(eInvoiceStatus({ prevTurnover: 150_000_000, invoiceDate: D("2026-08-01"), supplyType: "B2B", irn: null, now })).toMatchObject({ status: "OVERDUE" });
    expect(eInvoiceStatus({ prevTurnover: 150_000_000, invoiceDate: D("2026-09-10"), supplyType: "B2B", irn: null, now })).toMatchObject({ status: "PENDING", daysLeft: 20 });
    expect(eInvoiceStatus({ prevTurnover: 150_000_000, invoiceDate: D("2026-01-10"), supplyType: "B2B", irn: "a".repeat(64), now }).status).toBe("REPORTED");
    expect(isValidIrn("a".repeat(64))).toBe(true);
    expect(isValidIrn("xyz")).toBe(false);
  });
  it("builds an INV-01 payload and reports what is missing", () => {
    const c = classifyInvoice(inv({ recipientGstin: KA, number: "INV/26/009" }), "27");
    const ok = buildEInvoicePayload({ seller: { gstin: MH, legalName: "Nexus", address: "12 MG Road, Pune 411001", stateCode: "27" }, buyer: { gstin: KA, legalName: "Infosys", address: "Hosur Road, Bengaluru 560100", stateCode: "29" }, invoice: c });
    expect(ok.problems).toEqual([]);
    expect(ok.payload).toMatchObject({ Version: "1.1", TranDtls: { SupTyp: "B2B" }, DocDtls: { Typ: "INV", No: "INV/26/009", Dt: "10/09/2026" }, ValDtls: { AssVal: 100000, IgstVal: 18000, TotInvVal: 118000 } });
    const bad = buildEInvoicePayload({ seller: { gstin: MH, legalName: "Nexus", address: "Pune", stateCode: "27" }, buyer: { gstin: KA, legalName: "X", address: "", stateCode: "29" }, invoice: c });
    expect(bad.problems).toEqual(expect.arrayContaining(["SELLER_PIN", "BUYER_PIN"]));
    const exp1 = classifyInvoice(inv({ clientCountry: "US", rate: 0 }), "27");
    expect(buildEInvoicePayload({ seller: { gstin: MH, legalName: "N", address: "Pune 411001", stateCode: "27" }, buyer: { gstin: null, legalName: "Stark", address: "NY", stateCode: null }, invoice: exp1 }).payload).toMatchObject({ BuyerDtls: { Gstin: "URP", Pos: "96" } });
  });
  it("needs an e-way bill only for goods above ₹50,000 and writes bulk JSON for goods lines", () => {
    const goods = classifyInvoice({ ...inv({ recipientGstin: KA, amount: 60000 }), items: [{ description: "Laptops", quantity: 2, amount: 60000, taxRate: 0.18, sacCode: "8471" }] }, "27");
    const service = classifyInvoice(inv({ recipientGstin: KA, amount: 600000 }), "27");
    expect(needsEway(goods)).toBe(true);
    expect(needsEway(service)).toBe(false);
    const json = buildEwayBulkJson({ userGstin: MH, seller: { gstin: MH, stateCode: "27" }, invoices: [{ invoice: goods, buyer: { gstin: KA, stateCode: "29" }, transport: { mode: 1, distanceKm: 840, vehicleNo: "mh 12 ab 1234", fromPin: "411001", toPin: "560100" } }] });
    expect(json.billLists[0]).toMatchObject({ docNo: goods.number, vehicleNo: "MH12AB1234", transDistance: "840", toStateCode: 29, igstValue: 10800 });
    expect(validateTransport({ vehicleNo: "bad", fromPin: "1", toPin: "560100", distanceKm: 0 })).toEqual(["VEHICLE_NO", "FROM_PIN", "DISTANCE"]);
  });
});

describe("cross-checks and exports", () => {
  it("finds gaps in each numbering series", () => {
    const gaps = findNumberGaps(["INV-001", "INV-002", "INV-005", "INV-006", "CN-1", "CN-2", "X9"]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ prefix: "INV-", missing: [3, 4], missingCount: 2 });
  });
  it("writes a valid stored ZIP", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const zip = buildZip([{ name: "a/b.csv", data: "hello" }, { name: "c.txt", data: "world" }], D("2026-09-01"));
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    expect(zip.readUInt32LE(zip.length - 22)).toBe(0x06054b50);
    expect(zip.readUInt16LE(zip.length - 22 + 10)).toBe(2);
    expect(zip.toString("latin1")).toContain("a/b.csv");
  });
  it("neutralises spreadsheet formulas in CSV", () => {
    const csv = csvText([["=HYPERLINK(1)", "-5", "plain", "+cmd"]]);
    expect(csv).toContain("\"'=HYPERLINK(1)\"");
    expect(csv).toContain("\"-5\"");
    expect(csv).toContain("\"'+cmd\"");
  });
  it("emits Tally vouchers with the GST split and escapes names", () => {
    const sale = classifyInvoice(inv({ recipientGstin: MH, clientName: "A & B <Ltd>", number: "T-1" }), "27");
    const xml = buildTallyXml({ company: "Nexus", invoices: [sale], expenses: [exp({ vendor: "Cloud", igst: 1800 })] });
    expect(xml).toContain("A &amp; B &lt;Ltd&gt;");
    expect(xml).toContain("<VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>");
    expect(xml).toContain("Output CGST");
    expect(xml).toContain("<LEDGERNAME>Input IGST</LEDGERNAME>");
    expect(xml).toContain("<VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>");
  });
  it("explains a number with the documents behind it", () => {
    const invoices = [classifyInvoice(inv({ recipientGstin: MH, number: "X-1" }), "27"), classifyInvoice(inv({ clientCountry: "US", rate: 0, number: "X-2" }), "27")];
    const docs = explainSources("outward", [period], { invoices, creditNotes: [], expenses: [exp()], adjustments: [] });
    expect(docs.map((d) => d.number)).toEqual(["X-1"]);
    expect(explainSources("zero_rated", [period], { invoices, creditNotes: [], expenses: [], adjustments: [] }).map((d) => d.number)).toEqual(["X-2"]);
    expect(explainSources("itc_other", [period], { invoices, creditNotes: [], expenses: [exp(), exp({ id: "h", itcHeld: true })], adjustments: [] })).toHaveLength(1);
    const withExtras = explainSources("outward", [period], { invoices, creditNotes: [], expenses: [], adjustments: [],
      debitNotes: [{ id: "d", number: "DN-1", date: D("2026-09-20"), invoiceNumber: null, invoiceDate: null, name: "T", gstin: null, pos: "27", rate: 18, taxable: 1000, igst: 0, cgst: 90, sgst: 90, cess: 0, reason: "x" }],
      advances: [{ id: "a", receivedAt: D("2026-09-02"), adjustedAt: D("2026-09-25"), party: "P", gstin: null, pos: "27", rate: 18, taxable: 500, igst: 0, cgst: 45, sgst: 45, adjustedInvoice: "X-1" }],
      amendments: [{ id: "m", periodKey: "2026-09", originalPeriodKey: "2026-08", originalNumber: "O-1", originalDate: D("2026-08-01"), name: null, gstin: null, pos: "27", rate: 18, original: { taxable: 100, igst: 0, cgst: 9, sgst: 9, cess: 0 }, revised: { taxable: 50, igst: 0, cgst: 4.5, sgst: 4.5, cess: 0 }, reason: "r" }] });
    expect(withExtras.map((d) => d.note).sort()).toEqual(["ADVANCE", "ADVANCE_ADJUSTED", "AMENDMENT", "DEBIT", undefined].sort());
    expect(withExtras.reduce((s, d) => s + d.taxable, 0)).toBe(100000 + 1000 + 500 - 500 - 50);
    expect(explainSources("itc_held", [period], { invoices, creditNotes: [], expenses: [exp({ id: "h", itcHeld: true })], adjustments: [] })).toHaveLength(1);
  });
});

describe("smarter 2B matching", () => {
  it("recognises similar invoice numbers", () => {
    expect(similarInvoiceNumbers("INV/2026/0042", "42")).toBe(false);
    expect(similarInvoiceNumbers("CH-V-100", "V-100")).toBe(true);
    expect(similarInvoiceNumbers("INV-10023", "INV-10028")).toBe(true);
    expect(similarInvoiceNumbers("INV-1", "ZZZ-9")).toBe(false);
  });
  it("does not match different amounts and carries the supplier figures for one-click acceptance", () => {
    const row = { supplierGstin: KA, supplierName: "V", invoiceNumber: "A-77", invoiceDate: D("2026-09-05"), taxableValue: 10000, igst: 1800, cgst: 0, sgst: 0, cess: 0, itcAvailable: true, reverseCharge: false };
    const r = reconcileGstr2b([row], [exp({ vendorInvoiceNo: "A-77", igst: 900, amount: 5900 })]);
    expect(r.rows[0]).toMatchObject({ status: "MISMATCH", twoB: { igst: 1800 } });
    const none = reconcileGstr2b([row], [exp({ vendorInvoiceNo: "Q-1", igst: 100, amount: 700 })]);
    expect(none.counts).toMatchObject({ LIKELY: 0, MISSING_IN_BOOKS: 1, MISSING_IN_2B: 1 });
  });
});

describe("overview helpers", () => {
  const ob = (over: Partial<ObligationView>): ObligationView => ({ returnType: "GSTR3B", periodKey: "2026-08", label: "GSTR-3B", optional: false, periodStart: "2026-08-01T00:00:00.000Z", periodEnd: "2026-08-31T23:59:59.999Z", dueDate: "2026-09-20T00:00:00.000Z", extendedDueDate: null, status: "PENDING", daysLate: 0, lateFeeEstimate: 0, filing: null, figures: { outputTax: 0, itcUsed: 0, cashPayable: 5000, taxable: 0, invoiceCount: 1 }, reviewStatus: null, commentCount: 0, ...over });
  const overview = (obligations: ObligationView[]) => ({ obligations, kpis: { heldCredit: 3000 } }) as unknown as GstOverview;
  it("sums late fee and interest on overdue returns", () => {
    const e = exposureOf([ob({ status: "OVERDUE", daysLate: 73, lateFeeEstimate: 500, figures: { outputTax: 0, itcUsed: 0, cashPayable: 100000, taxable: 0, invoiceCount: 1 } }), ob({ returnType: "GSTR1", status: "OVERDUE", lateFeeEstimate: 300, daysLate: 5 }), ob({ status: "PENDING" })]);
    expect(e).toMatchObject({ lateFee: 800, interest: 3600, total: 4400, overdueCount: 2 });
  });
  it("plans reminders at 7, 3, 1 and 0 days and weekly once overdue", () => {
    const o = ob({});
    for (const [now, key] of [["2026-09-13", "T-7"], ["2026-09-17", "T-3"], ["2026-09-19", "T-1"], ["2026-09-20", "T-0"]] as const) {
      const plan = planReminders(overview([o]), new Date(`${now}T08:00:00Z`));
      expect(plan).toHaveLength(1);
      expect(plan[0].key).toBe(`GSTR3B:2026-08:${key}`);
    }
    expect(planReminders(overview([o]), new Date("2026-09-15T08:00:00Z"))).toHaveLength(0);
    const late = planReminders(overview([ob({ status: "OVERDUE", daysLate: 4 })]), new Date("2026-09-24T08:00:00Z"));
    expect(late[0].key).toMatch(/:OVERDUE:/);
    expect(planReminders(overview([ob({ status: "FILED" })]), new Date("2026-09-20T08:00:00Z"))).toHaveLength(0);
    expect(planReminders(overview([ob({ optional: true, returnType: "IFF" })]), new Date("2026-09-20T08:00:00Z"))).toHaveLength(0);
  });
  it("builds a Monday digest only when there is something to say", () => {
    expect(planDigest(overview([]), 0, new Date("2026-09-21T08:00:00Z"))).toBeNull();
    const d = planDigest(overview([ob({})]), 2, new Date("2026-09-21T08:00:00Z"));
    expect(d?.lines.join(" ")).toMatch(/2 data checks/);
    expect(d?.lines.join(" ")).toMatch(/on hold/);
  });
});

describe("GSTR-9 table 8 and 9C", () => {
  it("compares 2B credit with credit availed and reconciles turnover with books", () => {
    const gstr1 = buildGstr1({ periodKey: "2026-09", ...period, invoices: [classifyInvoice(inv({ recipientGstin: MH }), "27")], creditNotes: [], prevTurnover: 0 });
    const expenses = [exp()];
    const books = buildBooks({ gstr1, expenses, adjustments: [] });
    const ledger = buildLedger([{ key: "2026-09", books }]);
    const rep = buildGstr9({ fy: "2026-27", monthly: [gstr1], books, ledger, expenses, twoBTotals: { igst: 2000, cgst: 0, sgst: 0, cess: 0 }, inputs: { t8e: { igst: 200 }, c9Items: [{ label: "Unbilled revenue", amount: 25000 }] }, prevTurnover: 0, booksTurnover: 100000, lateFeeEstimate: 0 });
    expect(rep.t8.rows.d.igst).toBe(200);
    expect(rep.t8.rows.k.igst).toBe(0);
    expect(rep.c9).toMatchObject({ turnoverBooks: 100000, turnoverAdjusted: 125000, turnoverDeclared: 100000, unreconciled: 25000 });
  });
  it("fills 4D, 4F, 4J, 4K/4L and 5B from SEZ supplies, advances, debit notes and amendments, and still reconciles", () => {
    const invoices = [classifyInvoice(inv({ recipientGstin: MH }), "27"), classifyInvoice(inv({ recipientGstin: SEZ, supplyOverride: "SEZ_WP", amount: 80000 }), "27"), classifyInvoice(inv({ recipientGstin: SEZ, supplyOverride: "SEZ_WOP", rate: 0, amount: 30000 }), "27")];
    const gstr1 = buildGstr1({
      periodKey: "2026-09", ...period, invoices, creditNotes: [], prevTurnover: 0,
      debitNotes: [{ id: "d", number: "DN-1", date: D("2026-09-20"), invoiceNumber: null, invoiceDate: null, name: "T", gstin: MH, pos: "27", rate: 18, taxable: 10000, igst: 0, cgst: 900, sgst: 900, cess: 0, reason: "x" }],
      advances: [{ id: "a", receivedAt: D("2026-09-02"), adjustedAt: null, party: "P", gstin: null, pos: "27", rate: 18, taxable: 50000, igst: 0, cgst: 4500, sgst: 4500, adjustedInvoice: null }],
      amendments: [{ id: "m", periodKey: "2026-09", originalPeriodKey: "2026-08", originalNumber: "O-1", originalDate: D("2026-08-01"), name: null, gstin: MH, pos: "27", rate: 18, original: { taxable: 100000, igst: 0, cgst: 9000, sgst: 9000, cess: 0 }, revised: { taxable: 90000, igst: 0, cgst: 8100, sgst: 8100, cess: 0 }, reason: "r" }],
    });
    const books = buildBooks({ gstr1, expenses: [], adjustments: [] });
    const rep = buildGstr9({ fy: "2026-27", monthly: [gstr1], books, ledger: buildLedger([{ key: "2026-09", books }]), expenses: [], twoBTotals: zeroHeads(), inputs: {}, prevTurnover: 0, booksTurnover: gstr1.summary.taxable, lateFeeEstimate: 0 });
    expect(rep.t4.d).toMatchObject({ taxable: 80000, igst: 14400 });
    expect(rep.t4.f.taxable).toBe(50000);
    expect(rep.t4.j.taxable).toBe(10000);
    expect(rep.t4.l.taxable).toBe(10000);
    expect(rep.t5.b.taxable).toBe(30000);
    expect(rep.reconciliation.difference).toBe(0);
  });
  it("excludes held credit from table 6", () => {
    const gstr1 = buildGstr1({ periodKey: "2026-09", ...period, invoices: [], creditNotes: [], prevTurnover: 0 });
    const expenses = [exp({ itcHeld: true })];
    const books = buildBooks({ gstr1, expenses, adjustments: [] });
    const rep = buildGstr9({ fy: "2026-27", monthly: [gstr1], books, ledger: buildLedger([{ key: "2026-09", books }]), expenses, twoBTotals: zeroHeads(), inputs: {}, prevTurnover: 0, booksTurnover: 0, lateFeeEstimate: 0 });
    expect(rep.t6.b_services.igst).toBe(0);
  });
});
