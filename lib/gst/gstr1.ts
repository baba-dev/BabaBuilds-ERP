import { addRow, r2, zeroRow, type TaxRow } from "./money";
import { hsnForTurnover, isNilLine, type ClassifiedInvoice, type GstLine } from "./classify";
import { FOREIGN_POS } from "./states";

export type CreditNoteInput = {
  id: string;
  number: string;
  date: Date;
  /** Credit note value in invoice currency (incl. tax) and the tax part. */
  amount: number;
  taxAmount: number;
  reason: string;
  invoice: ClassifiedInvoice;
  invoiceSubtotalBooked: number;
  exchangeRate: number;
};

export type Gstr1Invoice = {
  id: string;
  number: string;
  date: string;
  value: number;
  pos: string;
  rcm: boolean;
  supplyType: string;
  lines: Array<TaxRow & { rate: number }>;
};

export type Gstr1Note = Gstr1Invoice & { originalNumber: string; originalDate: string; reason: string };

export type Gstr1B2bParty = { gstin: string; name: string; invoices: Gstr1Invoice[] };

export type Gstr1B2cs = TaxRow & { pos: string; rate: number; interState: boolean };

export type Gstr1Nil = { key: "INTRA_B2B" | "INTRA_B2C" | "INTER_B2B" | "INTER_B2C"; nil: number; exempt: number; nonGst: number };

export type Gstr1Hsn = TaxRow & { hsn: string; description: string; uqc: string; quantity: number; rate: number; value: number };

export type Gstr1DocRange = { type: string; from: string; to: string; total: number; cancelled: number; net: number };

export type Gstr1Report = {
  periodKey: string;
  summary: TaxRow & { invoiceCount: number; creditNoteCount: number; value: number };
  b2b: Gstr1B2bParty[];
  b2cl: Gstr1Invoice[];
  b2cs: Gstr1B2cs[];
  exports: Gstr1Invoice[];
  cdnr: Array<{ gstin: string; name: string; notes: Gstr1Note[] }>;
  cdnur: Gstr1Note[];
  nil: Gstr1Nil[];
  hsnB2b: Gstr1Hsn[];
  hsnB2c: Gstr1Hsn[];
  docs: Gstr1DocRange[];
  isNil: boolean;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const inRange = (d: Date, start: Date, end: Date) => d.getTime() >= start.getTime() && d.getTime() <= end.getTime();

function linesByRate(lines: GstLine[]): Array<TaxRow & { rate: number }> {
  const map = new Map<number, TaxRow & { rate: number }>();
  for (const l of lines) {
    const cur = map.get(l.rate) ?? { rate: l.rate, ...zeroRow() };
    map.set(l.rate, { rate: l.rate, ...addRow(cur, l) });
  }
  return Array.from(map.values()).sort((a, b) => a.rate - b.rate);
}

function toGstr1Invoice(inv: ClassifiedInvoice, lines: GstLine[], value: number): Gstr1Invoice {
  return {
    id: inv.id,
    number: inv.number,
    date: ymd(inv.date),
    value,
    pos: inv.placeOfSupply,
    rcm: inv.supplyType === "B2B_RCM",
    supplyType: inv.supplyType,
    lines: linesByRate(lines),
  };
}

/** Which invoices belong to this return: dated in the period and not cancelled within it. */
export function invoicesForPeriod(invoices: ClassifiedInvoice[], start: Date, end: Date) {
  const included: ClassifiedInvoice[] = [];
  const cancelled: ClassifiedInvoice[] = [];
  for (const inv of invoices) {
    if (!inRange(inv.date, start, end)) continue;
    if (inv.voided && (!inv.voidedAt || inv.voidedAt.getTime() <= end.getTime())) cancelled.push(inv);
    else included.push(inv);
  }
  return { included, cancelled };
}

/** Credit notes belong to the period they were issued in, unless they just cancel an invoice of that same period. */
export function creditNotesForPeriod(notes: CreditNoteInput[], start: Date, end: Date): CreditNoteInput[] {
  return notes.filter((n) => inRange(n.date, start, end) && !inRange(n.invoice.date, start, end));
}

function scaledNoteLines(note: CreditNoteInput): { lines: GstLine[]; value: number } {
  const xr = note.exchangeRate > 0 ? note.exchangeRate : 1;
  const noteTaxable = r2((note.amount - note.taxAmount) * xr);
  const origTaxable = note.invoice.taxable || 1;
  const factor = Math.min(1, noteTaxable / origTaxable);
  const lines = note.invoice.lines.map((l) => ({
    ...l,
    taxable: r2(l.taxable * factor),
    igst: r2(l.igst * factor),
    cgst: r2(l.cgst * factor),
    sgst: r2(l.sgst * factor),
    cess: r2(l.cess * factor),
  }));
  return { lines, value: r2(note.amount * xr) };
}

function docSeries(numbers: string[]): { from: string; to: string } {
  const sorted = [...numbers].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  return { from: sorted[0] ?? "", to: sorted[sorted.length - 1] ?? "" };
}

export function buildGstr1(args: {
  periodKey: string;
  start: Date;
  end: Date;
  invoices: ClassifiedInvoice[];
  creditNotes: CreditNoteInput[];
  prevTurnover: number;
}): Gstr1Report {
  const { start, end, prevTurnover } = args;
  const { included, cancelled } = invoicesForPeriod(args.invoices, start, end);
  const notes = creditNotesForPeriod(args.creditNotes, start, end);

  const b2bMap = new Map<string, Gstr1B2bParty>();
  const b2cl: Gstr1Invoice[] = [];
  const exportsList: Gstr1Invoice[] = [];
  const b2csMap = new Map<string, Gstr1B2cs>();
  const nilMap = new Map<Gstr1Nil["key"], Gstr1Nil>();
  const hsnMaps = { b2b: new Map<string, Gstr1Hsn>(), b2c: new Map<string, Gstr1Hsn>() };
  let summary = zeroRow();
  let valueTotal = 0;

  const addNil = (inv: ClassifiedInvoice, line: GstLine) => {
    const key = `${inv.interState ? "INTER" : "INTRA"}_${inv.gstin ? "B2B" : "B2C"}` as Gstr1Nil["key"];
    const cur = nilMap.get(key) ?? { key, nil: 0, exempt: 0, nonGst: 0 };
    cur.nil = r2(cur.nil + line.taxable);
    nilMap.set(key, cur);
  };

  const addHsn = (bucket: Map<string, Gstr1Hsn>, line: GstLine, sign: 1 | -1) => {
    const hsn = hsnForTurnover(line.hsn, prevTurnover) || "NA";
    const key = `${hsn}|${line.rate}`;
    const cur = bucket.get(key) ?? { hsn, description: line.description.slice(0, 30), uqc: "NA", quantity: 0, rate: line.rate, value: 0, ...zeroRow() };
    const row = addRow(cur, {
      taxable: sign * line.taxable,
      igst: sign * line.igst,
      cgst: sign * line.cgst,
      sgst: sign * line.sgst,
      cess: sign * line.cess,
    });
    bucket.set(key, {
      ...cur,
      ...row,
      quantity: cur.quantity + sign * line.quantity,
      value: r2(cur.value + sign * (line.taxable + line.igst + line.cgst + line.sgst + line.cess)),
    });
  };

  for (const inv of included) {
    // Nil-rated / exempt lines (not exports) go to Table 8; everything else to the invoice tables.
    const taxedLines = inv.supplyType === "EXPWP" || inv.supplyType === "EXPWOP" ? inv.lines : inv.lines.filter((l) => !isNilLine(l));
    for (const l of inv.lines) if (isNilLine(l) && inv.supplyType !== "EXPWP" && inv.supplyType !== "EXPWOP") addNil(inv, l);

    valueTotal = r2(valueTotal + inv.value);
    const hsnBucket = inv.gstin ? hsnMaps.b2b : hsnMaps.b2c;
    for (const l of inv.lines) addHsn(hsnBucket, l, 1);

    if (taxedLines.length === 0) continue;
    const taxable = r2(taxedLines.reduce((s, l) => s + l.taxable, 0));
    const tax = r2(taxedLines.reduce((s, l) => s + l.igst + l.cgst + l.sgst + l.cess, 0));
    const doc = toGstr1Invoice(inv, taxedLines, r2(taxable + tax));
    for (const l of taxedLines) summary = addRow(summary, l);

    if (inv.supplyType === "B2B" || inv.supplyType === "B2B_RCM") {
      const party = b2bMap.get(inv.gstin!) ?? { gstin: inv.gstin!, name: inv.clientName, invoices: [] };
      party.invoices.push(doc);
      b2bMap.set(inv.gstin!, party);
    } else if (inv.supplyType === "B2CL") {
      b2cl.push(doc);
    } else if (inv.supplyType === "EXPWP" || inv.supplyType === "EXPWOP") {
      exportsList.push({ ...doc, pos: FOREIGN_POS });
    } else {
      for (const l of taxedLines) {
        const key = `${inv.placeOfSupply}|${l.rate}|${inv.interState}`;
        const cur = b2csMap.get(key) ?? { pos: inv.placeOfSupply, rate: l.rate, interState: inv.interState, ...zeroRow() };
        b2csMap.set(key, { ...cur, ...addRow(cur, l) });
      }
    }
  }

  // Credit notes reduce the same tables via Table 9B and net off the summary.
  const cdnrMap = new Map<string, { gstin: string; name: string; notes: Gstr1Note[] }>();
  const cdnur: Gstr1Note[] = [];
  for (const n of notes) {
    const { lines, value } = scaledNoteLines(n);
    const taxed = lines.filter((l) => !isNilLine(l));
    for (const l of lines) addHsn(n.invoice.gstin ? hsnMaps.b2b : hsnMaps.b2c, l, -1);
    if (taxed.length === 0) continue;
    const doc: Gstr1Note = {
      ...toGstr1Invoice(n.invoice, taxed, value),
      id: n.id,
      number: n.number,
      date: ymd(n.date),
      originalNumber: n.invoice.number,
      originalDate: ymd(n.invoice.date),
      reason: n.reason,
    };
    for (const l of taxed) summary = addRow(summary, { taxable: -l.taxable, igst: -l.igst, cgst: -l.cgst, sgst: -l.sgst, cess: -l.cess });
    valueTotal = r2(valueTotal - value);
    if (n.invoice.gstin) {
      const party = cdnrMap.get(n.invoice.gstin) ?? { gstin: n.invoice.gstin, name: n.invoice.clientName, notes: [] };
      party.notes.push(doc);
      cdnrMap.set(n.invoice.gstin, party);
    } else cdnur.push(doc);
  }

  const issuedNumbers = included.map((i) => i.number);
  const cancelledNumbers = cancelled.map((i) => i.number);
  const allNumbers = [...issuedNumbers, ...cancelledNumbers];
  const docs: Gstr1DocRange[] = [];
  if (allNumbers.length > 0) {
    const { from, to } = docSeries(allNumbers);
    docs.push({ type: "INVOICE", from, to, total: allNumbers.length, cancelled: cancelledNumbers.length, net: issuedNumbers.length });
  }
  if (notes.length > 0) {
    const { from, to } = docSeries(notes.map((n) => n.number));
    docs.push({ type: "CREDIT_NOTE", from, to, total: notes.length, cancelled: 0, net: notes.length });
  }

  const sortHsn = (m: Map<string, Gstr1Hsn>) => Array.from(m.values()).sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);

  return {
    periodKey: args.periodKey,
    summary: { ...summary, invoiceCount: included.length, creditNoteCount: notes.length, value: valueTotal },
    b2b: Array.from(b2bMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    b2cl,
    b2cs: Array.from(b2csMap.values()),
    exports: exportsList,
    cdnr: Array.from(cdnrMap.values()),
    cdnur,
    nil: Array.from(nilMap.values()),
    hsnB2b: sortHsn(hsnMaps.b2b),
    hsnB2c: sortHsn(hsnMaps.b2c),
    docs,
    isNil: included.length === 0 && notes.length === 0,
  };
}

/** GST-portal offline-tool shaped JSON for GSTR-1 (indicative; validate in the offline tool before upload). */
export function gstr1PortalJson(report: Gstr1Report, supplierGstin: string): Record<string, unknown> {
  const fp = (() => {
    const key = report.periodKey;
    const m = /^(\d{4})-(\d{2})$/.exec(key);
    if (m) return `${m[2]}${m[1]}`;
    const q = /^(\d{4})-Q([1-4])$/.exec(key);
    if (q) {
      const endMonth = [6, 9, 12, 3][Number(q[2]) - 1];
      const year = Number(q[1]) + (q[2] === "4" ? 1 : 0);
      return `${String(endMonth).padStart(2, "0")}${year}`;
    }
    return "";
  })();
  const dmy = (iso: string) => `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
  const itms = (lines: Array<TaxRow & { rate: number }>) =>
    lines.map((l, i) => ({ num: i + 1, itm_det: { rt: l.rate, txval: l.taxable, iamt: l.igst, camt: l.cgst, samt: l.sgst, csamt: l.cess } }));
  const noteJson = (n: Gstr1Note) => ({
    ntty: "C",
    nt_num: n.number,
    nt_dt: dmy(n.date),
    val: n.value,
    pos: n.pos,
    rchrg: n.rcm ? "Y" : "N",
    inv_typ: "R",
    itms: itms(n.lines),
  });
  const nilKey: Record<Gstr1Nil["key"], string> = { INTER_B2B: "INTRB2B", INTER_B2C: "INTRB2C", INTRA_B2B: "INTRAB2B", INTRA_B2C: "INTRAB2C" };
  const hsnRow = (h: Gstr1Hsn, i: number) => ({ num: i + 1, hsn_sc: h.hsn, desc: h.description, uqc: h.uqc, qty: h.quantity, rt: h.rate, txval: h.taxable, iamt: h.igst, camt: h.cgst, samt: h.sgst, csamt: h.cess });

  return {
    gstin: supplierGstin,
    fp,
    b2b: report.b2b.map((p) => ({
      ctin: p.gstin,
      inv: p.invoices.map((i) => ({ inum: i.number, idt: dmy(i.date), val: i.value, pos: i.pos, rchrg: i.rcm ? "Y" : "N", inv_typ: "R", itms: itms(i.lines) })),
    })),
    b2cl: Object.values(
      report.b2cl.reduce<Record<string, { pos: string; inv: unknown[] }>>((acc, i) => {
        (acc[i.pos] ??= { pos: i.pos, inv: [] }).inv.push({ inum: i.number, idt: dmy(i.date), val: i.value, itms: itms(i.lines) });
        return acc;
      }, {}),
    ),
    b2cs: report.b2cs.map((r) => ({ sply_ty: r.interState ? "INTER" : "INTRA", rt: r.rate, typ: "OE", pos: r.pos, txval: r.taxable, iamt: r.igst, camt: r.cgst, samt: r.sgst, csamt: r.cess })),
    exp: ["WPAY", "WOPAY"]
      .map((t) => ({
        exp_typ: t,
        inv: report.exports
          .filter((i) => (t === "WPAY") === (i.supplyType === "EXPWP"))
          .map((i) => ({ inum: i.number, idt: dmy(i.date), val: i.value, itms: i.lines.map((l) => ({ txval: l.taxable, rt: l.rate, iamt: l.igst, csamt: l.cess })) })),
      }))
      .filter((g) => g.inv.length > 0),
    cdnr: report.cdnr.map((p) => ({ ctin: p.gstin, nt: p.notes.map(noteJson) })),
    cdnur: report.cdnur.map((n) => ({ typ: "B2CL", ntty: "C", nt_num: n.number, nt_dt: dmy(n.date), val: n.value, pos: n.pos, itms: itms(n.lines) })),
    nil: { inv: report.nil.map((n) => ({ sply_ty: nilKey[n.key], expt_amt: n.exempt, nil_amt: n.nil, ngsup_amt: n.nonGst })) },
    hsn: { hsn_b2b: report.hsnB2b.map(hsnRow), hsn_b2c: report.hsnB2c.map(hsnRow) },
    doc_issue: {
      doc_det: report.docs.map((d) => ({
        doc_num: d.type === "INVOICE" ? 1 : 5,
        docs: [{ num: 1, from: d.from, to: d.to, totnum: d.total, cancel: d.cancelled, net_issue: d.net }],
      })),
    },
  };
}
