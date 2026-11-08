import { describe, expect, it } from "vitest";
import { gstinChecksumChar, validateGstin } from "@/lib/gst/gstin";
import { classifyInvoice, type InvoiceInput } from "@/lib/gst/classify";
import { buildGstr1, gstr1PortalJson } from "@/lib/gst/gstr1";
import { buildBooks, mergeBooks, type ExpenseGstInput } from "@/lib/gst/books";
import { buildGstr3b, buildLedger } from "@/lib/gst/gstr3b";
import { utilizeItc } from "@/lib/gst/itc";
import { trackingStart, daysLate, monthsOfPeriod, obligationsForFy, obligationStatus, periodRange, fyStartYear, fyLabel } from "@/lib/gst/calendar";
import { estimateInterest, estimateLateFee } from "@/lib/gst/fees";
import { qrmpGstr3bDueDay } from "@/lib/gst/states";
import { buildGstr9 } from "@/lib/gst/gstr9";
import { parseGstr2bJson, reconcileGstr2b } from "@/lib/gst/recon";
import { zeroHeads } from "@/lib/gst/money";

function makeGstin(state: string, pan: string, entity = "1", z = "Z") {
  const first14 = `${state}${pan}${entity}${z}`;
  return first14 + gstinChecksumChar(first14);
}
const MH = makeGstin("27", "AABCU9603R");
const KA = makeGstin("29", "AAACB2894G");

const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

let seq = 0;
function invoice(over: Partial<InvoiceInput> & { amount?: number; rate?: number }): InvoiceInput {
  const amount = over.amount ?? 100000;
  const rate = over.rate ?? 0.18;
  seq += 1;
  return {
    id: `i${seq}`,
    number: over.number ?? `INV-${String(seq).padStart(3, "0")}`,
    date: over.date ?? D("2026-04-10"),
    voided: false,
    voidedAt: null,
    exchangeRate: 1,
    subtotal: amount,
    taxAmount: amount * rate,
    total: amount * (1 + rate),
    taxRate: rate,
    sacCode: "998313",
    isExemptMode: rate === 0,
    items: [{ description: "Consulting", quantity: 1, amount, taxRate: rate, sacCode: "998313" }],
    clientId: "c1",
    clientName: "Client",
    recipientGstin: null,
    clientCountry: "IN",
    clientStateCode: null,
    placeOfSupplyOverride: null,
    reverseCharge: false,
    ...over,
  } as InvoiceInput;
}

describe("tracking start and foreign tax IDs", () => {
  it("starts at registration, else the first invoice, else this month", () => {
    const now = new Date("2026-11-08T00:00:00Z");
    expect(trackingStart({ registeredFrom: D("2025-07-19") }, D("2026-05-12"), now).toISOString().slice(0, 10)).toBe("2025-07-01");
    expect(trackingStart({ registeredFrom: null }, D("2026-05-12"), now).toISOString().slice(0, 10)).toBe("2026-05-01");
    expect(trackingStart({ registeredFrom: null }, null, now).toISOString().slice(0, 10)).toBe("2026-11-01");
  });
  it("does not treat a foreign customer's tax ID as a GSTIN", () => {
    const c = classifyInvoice(invoice({ clientCountry: "USA", recipientGstin: "US-EIN-987654", rate: 0 }), "27");
    expect(c.issues).not.toContain("GSTIN_INVALID");
    expect(c.supplyType).toBe("EXPWOP");
  });
});

describe("GSTIN", () => {
  it("validates generated GSTINs and rejects tampering", () => {
    expect(validateGstin(MH)).toMatchObject({ valid: true, stateCode: "27", pan: "AABCU9603R" });
    expect(validateGstin(MH.slice(0, 14) + (MH[14] === "A" ? "B" : "A"))).toEqual({ valid: false, reason: "CHECKSUM" });
    expect(validateGstin("27AABCU9603R1Z")).toEqual({ valid: false, reason: "LENGTH" });
    expect(validateGstin("99AABCU9603R1ZX")).toMatchObject({ valid: false });
    expect(validateGstin("")).toMatchObject({ valid: false });
  });
  it("accepts a known real-format GSTIN", () => {
    expect(validateGstin("27AAPFU0939F1ZV")).toMatchObject({ valid: true, stateCode: "27" });
  });
});

describe("classification & place of supply", () => {
  it("intra-state splits CGST/SGST evenly", () => {
    const c = classifyInvoice(invoice({ recipientGstin: MH }), "27");
    expect(c.supplyType).toBe("B2B");
    expect(c.interState).toBe(false);
    expect(c.lines[0]).toMatchObject({ rate: 18, cgst: 9000, sgst: 9000, igst: 0 });
  });
  it("inter-state uses IGST", () => {
    const c = classifyInvoice(invoice({ recipientGstin: KA }), "27");
    expect(c.interState).toBe(true);
    expect(c.lines[0]).toMatchObject({ igst: 18000, cgst: 0, sgst: 0 });
  });
  it("B2C above 1 lakh inter-state is B2CL, otherwise B2CS", () => {
    expect(classifyInvoice(invoice({ clientStateCode: "29", amount: 100000 }), "27").supplyType).toBe("B2CL");
    expect(classifyInvoice(invoice({ clientStateCode: "29", amount: 50000 }), "27").supplyType).toBe("B2CS");
    expect(classifyInvoice(invoice({ clientStateCode: "27", amount: 500000 }), "27").supplyType).toBe("B2CS");
  });
  it("exports are zero-rated; with and without payment", () => {
    const lut = classifyInvoice(invoice({ clientCountry: "US", rate: 0, amount: 200000 }), "27");
    expect(lut.supplyType).toBe("EXPWOP");
    expect(lut.placeOfSupply).toBe("96");
    const paid = classifyInvoice(invoice({ clientCountry: "US", rate: 0.18, amount: 200000 }), "27");
    expect(paid.supplyType).toBe("EXPWP");
    expect(paid.lines[0].igst).toBe(36000);
  });
  it("flags a missing state and an invalid GSTIN", () => {
    const c = classifyInvoice(invoice({ recipientGstin: "NOTAGSTIN" }), "27");
    expect(c.issues).toContain("STATE_ASSUMED");
    expect(c.issues).toContain("GSTIN_INVALID");
  });
  it("scales line tax to the booked invoice tax and flags the gap", () => {
    const inv = invoice({ recipientGstin: MH });
    inv.taxAmount = 17000;
    const c = classifyInvoice(inv, "27");
    expect(c.tax).toBe(17000);
    expect(c.issues).toContain("TAX_MISMATCH");
  });
  it("converts foreign-currency invoices to INR", () => {
    const c = classifyInvoice(invoice({ clientCountry: "US", rate: 0, amount: 1000, exchangeRate: 83 }), "27");
    expect(c.taxable).toBe(83000);
  });
});

const period = { start: D("2026-04-01"), end: new Date("2026-04-30T23:59:59.999Z") };

describe("GSTR-1", () => {
  const supplier = "27";
  const invoices = [
    invoice({ recipientGstin: MH, number: "INV-001" }),
    invoice({ recipientGstin: KA, number: "INV-002", amount: 50000 }),
    invoice({ clientStateCode: "29", amount: 150000, number: "INV-003" }),
    invoice({ clientStateCode: "27", amount: 20000, number: "INV-004" }),
    invoice({ clientCountry: "US", rate: 0, amount: 300000, number: "INV-005" }),
    invoice({ recipientGstin: MH, rate: 0, amount: 10000, number: "INV-006" }),
  ].map((i) => classifyInvoice(i, supplier));

  const report = buildGstr1({ periodKey: "2026-04", ...period, invoices, creditNotes: [], prevTurnover: 0 });

  it("puts every document in the right table", () => {
    expect(report.b2b.flatMap((p) => p.invoices).map((i) => i.number).sort()).toEqual(["INV-001", "INV-002"]);
    expect(report.b2cl.map((i) => i.number)).toEqual(["INV-003"]);
    expect(report.b2cs).toHaveLength(1);
    expect(report.exports.map((i) => i.number)).toEqual(["INV-005"]);
    expect(report.nil).toEqual([{ key: "INTRA_B2B", nil: 10000, exempt: 0, nonGst: 0 }]);
  });
  it("summary adds taxed lines (nil supplies excluded from tax tables)", () => {
    // taxed taxable: 100000 + 50000 + 150000 + 20000 + export 300000
    expect(report.summary.taxable).toBe(620000);
    expect(report.summary.invoiceCount).toBe(6);
    expect(report.summary.igst).toBe(9000 + 27000);
    expect(report.summary.cgst).toBe(9000 + 1800);
  });
  it("reports documents issued and uses 4-digit HSN under 5 Cr", () => {
    expect(report.docs[0]).toMatchObject({ type: "INVOICE", from: "INV-001", to: "INV-006", total: 6, cancelled: 0 });
    expect(report.hsnB2b[0].hsn).toBe("9983");
    const big = buildGstr1({ periodKey: "2026-04", ...period, invoices, creditNotes: [], prevTurnover: 60000000 });
    expect(big.hsnB2b[0].hsn).toBe("998313");
  });
  it("drops invoices cancelled inside the period and their credit notes", () => {
    const voided = classifyInvoice({ ...invoice({ recipientGstin: MH, number: "INV-009" }), voided: true, voidedAt: D("2026-04-12") }, supplier);
    const r = buildGstr1({ periodKey: "2026-04", ...period, invoices: [voided], prevTurnover: 0, creditNotes: [{ id: "cn", number: "CN-1", date: D("2026-04-12"), amount: 118000, taxAmount: 18000, reason: "x", invoice: voided, invoiceSubtotalBooked: 100000, exchangeRate: 1 }] });
    expect(r.summary.taxable).toBe(0);
    expect(r.docs[0]).toMatchObject({ total: 1, cancelled: 1, net: 0 });
    expect(r.cdnr).toHaveLength(0);
  });
  it("reports a later credit note in Table 9B and nets the summary", () => {
    const original = classifyInvoice(invoice({ recipientGstin: MH, number: "INV-100", date: D("2026-03-10") }), supplier);
    const may = { start: D("2026-05-01"), end: new Date("2026-05-31T23:59:59.999Z") };
    const r = buildGstr1({ periodKey: "2026-05", ...may, invoices: [original], prevTurnover: 0, creditNotes: [{ id: "cn", number: "CN-2", date: D("2026-05-04"), amount: 59000, taxAmount: 9000, reason: "Discount", invoice: original, invoiceSubtotalBooked: 100000, exchangeRate: 1 }] });
    expect(r.cdnr[0].notes[0]).toMatchObject({ number: "CN-2", originalNumber: "INV-100" });
    expect(r.summary.taxable).toBe(-50000);
    expect(r.summary.cgst).toBe(-4500);
  });
  it("emits portal JSON with dd-mm-yyyy dates and the period code", () => {
    const json = gstr1PortalJson(report, MH) as { fp: string; b2b: Array<{ ctin: string; inv: Array<{ idt: string }> }>; b2cs: unknown[] };
    expect(json.fp).toBe("042026");
    expect(json.b2b[0].inv[0].idt).toBe("10-04-2026");
    expect(json.b2cs).toHaveLength(1);
  });
});

describe("ITC utilisation", () => {
  it("applies IGST credit to IGST, then CGST, then SGST", () => {
    const r = utilizeItc({ igst: 100, cgst: 50, sgst: 50, cess: 0 }, { igst: 180, cgst: 0, sgst: 0, cess: 0 });
    expect(r.utilisation.igstCredit).toEqual({ igst: 100, cgst: 50, sgst: 30 });
    expect(r.cash).toEqual({ igst: 0, cgst: 0, sgst: 20, cess: 0 });
  });
  it("never lets CGST credit pay SGST and uses leftover on IGST", () => {
    const r = utilizeItc({ igst: 40, cgst: 10, sgst: 50, cess: 0 }, { igst: 0, cgst: 30, sgst: 0, cess: 0 });
    expect(r.utilisation.cgstCredit).toEqual({ cgst: 10, igst: 20 });
    expect(r.cash).toEqual({ igst: 20, cgst: 0, sgst: 50, cess: 0 });
  });
  it("cess credit only offsets cess", () => {
    const r = utilizeItc({ igst: 10, cgst: 0, sgst: 0, cess: 5 }, { igst: 0, cgst: 0, sgst: 0, cess: 8 });
    expect(r.cash).toEqual({ igst: 10, cgst: 0, sgst: 0, cess: 0 });
    expect(r.remaining.cess).toBe(3);
  });
});

function expense(over: Partial<ExpenseGstInput>): ExpenseGstInput {
  return { id: "e", date: D("2026-04-15"), vendor: "Vendor", vendorGstin: KA, vendorInvoiceNo: "V-1", vendorStateCode: "29", category: "Software", hsn: "998314", rate: 18, amount: 11800, igst: 1800, cgst: 0, sgst: 0, cess: 0, itcStatus: "ELIGIBLE", ...over };
}

describe("GSTR-3B & ledger", () => {
  const mk = (invoices: InvoiceInput[], expenses: ExpenseGstInput[], adjustments = [] as never[]) => {
    const classified = invoices.map((i) => classifyInvoice(i, "27"));
    const gstr1 = buildGstr1({ periodKey: "2026-04", ...period, invoices: classified, creditNotes: [], prevTurnover: 0 });
    return buildBooks({ gstr1, expenses, adjustments });
  };

  it("nets ITC against liability and reports cash", () => {
    const books = mk([invoice({ recipientGstin: MH })], [expense({ igst: 1800 })]);
    const r = buildGstr3b("2026-04", books);
    expect(r.s31.a).toMatchObject({ taxable: 100000, cgst: 9000, sgst: 9000 });
    expect(r.s4.c.igst).toBe(1800);
    // IGST credit pays CGST first then SGST
    expect(r.payment.cash).toEqual({ igst: 0, cgst: 7200, sgst: 9000, cess: 0 });
    expect(r.payment.cashTotal).toBe(16200);
  });
  it("RCM is paid in cash and its credit becomes available", () => {
    const books = mk([invoice({ recipientGstin: MH })], [expense({ itcStatus: "REVERSE_CHARGE", igst: 0, cgst: 900, sgst: 900, amount: 10000, vendorGstin: null })]);
    const r = buildGstr3b("2026-04", books);
    expect(r.s31.d.taxable).toBe(8200);
    expect(r.payment.rcmCash).toMatchObject({ cgst: 900, sgst: 900 });
    expect(r.payment.cash.cgst).toBe(9000 - 900 + 900); // output 9000 less RCM credit 900, plus RCM paid in cash 900
  });
  it("ineligible ITC is shown but never claimed", () => {
    const r = buildGstr3b("2026-04", mk([invoice({ recipientGstin: MH })], [expense({ itcStatus: "INELIGIBLE" })]));
    expect(r.s4.c.igst).toBe(0);
    expect(r.s4.d.ineligible.igst).toBe(1800);
  });
  it("carries surplus credit forward month to month", () => {
    const m1 = mk([], [expense({ igst: 5000, amount: 40000 })]);
    const m2 = mk([invoice({ recipientGstin: MH })], []);
    const [a, b] = buildLedger([{ key: "2026-04", books: m1 }, { key: "2026-05", books: m2 }]);
    expect(a.payment.closingItc.igst).toBe(5000);
    expect(b.payment.openingItc.igst).toBe(5000);
    expect(b.payment.cash).toEqual({ igst: 0, cgst: 4000, sgst: 9000, cess: 0 });
  });
});

describe("calendar", () => {
  const regular = { registrationType: "REGULAR" as const, filingFrequency: "MONTHLY" as const, stateCode: "27" };
  it("monthly: GSTR-1 on the 11th and GSTR-3B on the 20th of the next month", () => {
    const list = obligationsForFy(2026, regular);
    const apr1 = list.find((o) => o.returnType === "GSTR1" && o.periodKey === "2026-04")!;
    const apr3b = list.find((o) => o.returnType === "GSTR3B" && o.periodKey === "2026-04")!;
    expect(apr1.dueDate.toISOString().slice(0, 10)).toBe("2026-05-11");
    expect(apr3b.dueDate.toISOString().slice(0, 10)).toBe("2026-05-20");
    expect(list.find((o) => o.returnType === "GSTR1" && o.periodKey === "2027-03")!.dueDate.toISOString().slice(0, 10)).toBe("2027-04-11");
    expect(list.find((o) => o.returnType === "GSTR9")!.dueDate.toISOString().slice(0, 10)).toBe("2027-12-31");
  });
  it("QRMP: quarterly GSTR-1 on the 13th, GSTR-3B on the 22nd/24th, IFF and PMT-06 in months 1-2", () => {
    const x = obligationsForFy(2026, { ...regular, filingFrequency: "QRMP" });
    expect(x.find((o) => o.returnType === "GSTR1" && o.periodKey === "2026-Q1")!.dueDate.toISOString().slice(0, 10)).toBe("2026-07-13");
    expect(x.find((o) => o.returnType === "GSTR3B" && o.periodKey === "2026-Q1")!.dueDate.toISOString().slice(0, 10)).toBe("2026-07-22");
    const y = obligationsForFy(2026, { ...regular, filingFrequency: "QRMP", stateCode: "07" });
    expect(y.find((o) => o.returnType === "GSTR3B" && o.periodKey === "2026-Q4")!.dueDate.toISOString().slice(0, 10)).toBe("2027-04-24");
    expect(x.filter((o) => o.returnType === "IFF")).toHaveLength(8);
    expect(x.filter((o) => o.returnType === "PMT06").every((o) => o.dueDate.getUTCDate() === 25)).toBe(true);
    expect(qrmpGstr3bDueDay("27")).toBe(22);
    expect(qrmpGstr3bDueDay("07")).toBe(24);
  });
  it("composition files CMP-08 quarterly and GSTR-4 annually; unregistered files nothing", () => {
    const c = obligationsForFy(2026, { ...regular, registrationType: "COMPOSITION" });
    expect(c.map((o) => o.returnType).sort()).toEqual(["CMP08", "CMP08", "CMP08", "CMP08", "GSTR4"]);
    expect(c.find((o) => o.returnType === "CMP08" && o.periodKey === "2026-Q1")!.dueDate.toISOString().slice(0, 10)).toBe("2026-07-18");
    expect(obligationsForFy(2026, { ...regular, registrationType: "UNREGISTERED" })).toEqual([]);
  });
  it("derives status from the due date, filing and extensions", () => {
    const o = { periodEnd: new Date("2026-04-30T23:59:59.999Z"), dueDate: D("2026-05-20") };
    expect(obligationStatus(o, null, new Date("2026-04-20T00:00:00Z"))).toBe("OPEN_PERIOD");
    expect(obligationStatus(o, null, new Date("2026-05-10T00:00:00Z"))).toBe("PENDING");
    expect(obligationStatus(o, null, new Date("2026-05-15T00:00:00Z"))).toBe("DUE_SOON");
    expect(obligationStatus(o, null, new Date("2026-05-21T00:00:00Z"))).toBe("OVERDUE");
    expect(obligationStatus(o, { status: "OPEN", extendedDueDate: D("2026-05-31") }, new Date("2026-05-21T00:00:00Z"))).toBe("PENDING");
    expect(obligationStatus(o, { status: "FILED" }, new Date("2026-06-21T00:00:00Z"))).toBe("FILED");
  });
  it("period helpers", () => {
    expect(fyStartYear(D("2026-03-31"))).toBe(2025);
    expect(fyStartYear(D("2026-04-01"))).toBe(2026);
    expect(fyLabel(2025)).toBe("2025-26");
    expect(monthsOfPeriod("2026-Q4")).toEqual(["2027-01", "2027-02", "2027-03"]);
    expect(periodRange("2025-26")!.start.toISOString().slice(0, 10)).toBe("2025-04-01");
    expect(periodRange("2026-04")!.end.toISOString().slice(0, 10)).toBe("2026-04-30");
  });
});

describe("late fee & interest", () => {
  it("charges per day up to the turnover-tier cap", () => {
    expect(estimateLateFee({ returnType: "GSTR3B", daysLate: 10, isNil: false, prevTurnover: 1e7 })).toBe(500);
    expect(estimateLateFee({ returnType: "GSTR3B", daysLate: 100, isNil: false, prevTurnover: 1e7 })).toBe(2000);
    expect(estimateLateFee({ returnType: "GSTR3B", daysLate: 100, isNil: true, prevTurnover: 1e7 })).toBe(500);
    expect(estimateLateFee({ returnType: "GSTR1", daysLate: 400, isNil: false, prevTurnover: 1e9 })).toBe(10000);
    expect(estimateLateFee({ returnType: "GSTR3B", daysLate: 0, isNil: false, prevTurnover: 0 })).toBe(0);
  });
  it("GSTR-9 late fee is capped at a share of turnover", () => {
    expect(estimateLateFee({ returnType: "GSTR9", daysLate: 1000, isNil: false, prevTurnover: 1e7, annualTurnover: 1e7 })).toBe(4000);
  });
  it("interest is 18% p.a. on delayed cash tax", () => {
    expect(estimateInterest(100000, 73)).toBe(3600);
    expect(daysLate(D("2026-05-20"), new Date("2026-05-25T10:00:00Z"))).toBe(5);
  });
});

describe("GSTR-9", () => {
  it("rolls the year up and reconciles to books", () => {
    const supplier = "27";
    const mkMonth = (key: string, startIso: string, endIso: string, invs: InvoiceInput[], exps: ExpenseGstInput[]) => {
      const gstr1 = buildGstr1({ periodKey: key, start: D(startIso), end: new Date(`${endIso}T23:59:59.999Z`), invoices: invs.map((i) => classifyInvoice(i, supplier)), creditNotes: [], prevTurnover: 0 });
      return { gstr1, books: buildBooks({ gstr1, expenses: exps, adjustments: [] }) };
    };
    const a = mkMonth("2026-04", "2026-04-01", "2026-04-30", [invoice({ recipientGstin: MH }), invoice({ clientStateCode: "27", amount: 10000 }), invoice({ clientCountry: "US", rate: 0, amount: 50000 })], [expense({})]);
    const b = mkMonth("2026-05", "2026-05-01", "2026-05-31", [invoice({ recipientGstin: KA, date: D("2026-05-05"), amount: 40000 })], []);
    const ledger = buildLedger([{ key: "2026-04", books: a.books }, { key: "2026-05", books: b.books }]);
    const report = buildGstr9({
      fy: "2026-27",
      monthly: [a.gstr1, b.gstr1],
      books: mergeBooks([a.books, b.books]),
      ledger,
      expenses: [expense({})],
      twoBTotals: { igst: 1800, cgst: 0, sgst: 0, cess: 0 },
      inputs: {},
      prevTurnover: 0,
      booksTurnover: 200000,
      lateFeeEstimate: 0,
    });
    expect(report.t4.b.taxable).toBe(140000); // two B2B invoices
    expect(report.t4.a.taxable).toBe(10000); // B2CS
    expect(report.t5.a.taxable).toBe(50000); // export under LUT
    expect(report.turnover).toBe(200000);
    expect(report.reconciliation.booksTurnover).toBe(200000);
    expect(report.reconciliation.difference).toBe(0);
    expect(report.t6.b_services.igst).toBe(1800);
    expect(report.t8.difference.igst).toBe(0);
    expect(report.t9.find((h) => h.head === "IGST")!.payable).toBeGreaterThan(0);
    expect(report.t17.length).toBeGreaterThan(0);
  });
});

describe("GSTR-2B reconciliation", () => {
  const json = {
    data: { rtnprd: "042026", docdata: { b2b: [{ ctin: KA, trdnm: "Vendor Ltd", inv: [{ inum: "V-1", dt: "05-04-2026", txval: 10000, igst: 1800, cgst: 0, sgst: 0, cess: 0, itcavl: "Y", rev: "N" }, { inum: "V-9", dt: "06-04-2026", txval: 100, igst: 18, itcavl: "Y" }] }] } },
  };
  it("parses the portal file", () => {
    const p = parseGstr2bJson(json);
    expect(p.rows).toHaveLength(2);
    expect(p.periodHint).toBe("2026-04");
    expect(p.rows[0].invoiceDate?.toISOString().slice(0, 10)).toBe("2026-04-05");
  });
  it("matches, flags mismatches and one-sided rows", () => {
    const { rows } = parseGstr2bJson(json);
    const books = [expense({ vendorInvoiceNo: "v1" }), expense({ id: "e2", vendorInvoiceNo: "X-7", igst: 900, amount: 5900 })];
    const r = reconcileGstr2b(rows, books);
    expect(r.counts).toEqual({ MATCHED: 1, LIKELY: 0, MISMATCH: 0, MISSING_IN_BOOKS: 1, MISSING_IN_2B: 1 });
    // A typo or dropped prefix in the bill's invoice number is surfaced as a likely match, not two unrelated gaps.
    const typo = reconcileGstr2b(rows, [expense({ vendorInvoiceNo: "CH-V-1" })]);
    expect(typo.counts.LIKELY).toBe(1);
    expect(typo.rows.find((x) => x.status === "LIKELY")?.bookInvoiceNumber).toBe("CH-V-1");
    expect(reconcileGstr2b(rows, [expense({ vendorInvoiceNo: "V-1", igst: 1795 })], { tolerance: 10 }).counts.MATCHED).toBe(1);
    const mismatch = reconcileGstr2b(rows, [expense({ vendorInvoiceNo: "V-1", igst: 1000, amount: 10000 })]);
    expect(mismatch.counts.MISMATCH).toBe(1);
  });
});

void zeroHeads;
