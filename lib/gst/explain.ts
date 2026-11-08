import { claimDate, expenseTaxable, type AdjustmentInput, type ExpenseGstInput } from "./books";
import { isNilLine, type ClassifiedInvoice } from "./classify";
import { creditNotesForPeriod, invoicesForPeriod, type AdvanceInput, type AmendmentInput, type CreditNoteInput, type DebitNoteInput } from "./gstr1";
import { r2 } from "./money";
import { periodRange } from "./calendar";

export const EXPLAIN_KEYS = ["outward", "zero_rated", "nil", "rcm", "interstate_unreg", "itc_other", "itc_rcm", "itc_ineligible", "itc_held", "reversals", "credit_notes"] as const;
export type ExplainKey = (typeof EXPLAIN_KEYS)[number];

export type ExplainDoc = {
  kind: "invoice" | "bill" | "note" | "adjustment";
  id: string;
  number: string;
  party: string;
  date: string;
  taxable: number;
  tax: number;
  /** Where to open it in the app. */
  href: string;
  note?: string;
};

type Range = { start: Date; end: Date };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const taxOfLines = (inv: ClassifiedInvoice, pred: (l: ClassifiedInvoice["lines"][number]) => boolean) => {
  const lines = inv.lines.filter(pred);
  return { taxable: r2(lines.reduce((s, l) => s + l.taxable, 0)), tax: r2(lines.reduce((s, l) => s + l.igst + l.cgst + l.sgst + l.cess, 0)), n: lines.length };
};
const isZeroRated = (inv: ClassifiedInvoice) => inv.supplyType === "EXPWP" || inv.supplyType === "EXPWOP" || inv.supplyType === "SEZWP" || inv.supplyType === "SEZWOP";

/** The documents behind one number on a return: invoices, bills, notes and manual adjustments, for one or more periods. */
export function explainSources(key: ExplainKey, ranges: Range[], data: { invoices: ClassifiedInvoice[]; creditNotes: CreditNoteInput[]; expenses: ExpenseGstInput[]; adjustments: AdjustmentInput[]; debitNotes?: DebitNoteInput[]; amendments?: AmendmentInput[]; advances?: AdvanceInput[] }): ExplainDoc[] {
  const out: ExplainDoc[] = [];
  for (const { start, end } of ranges) {
    const { included } = invoicesForPeriod(data.invoices, start, end);
    const inv = (i: ClassifiedInvoice, taxable: number, tax: number, note?: string) =>
      out.push({ kind: "invoice", id: i.id, number: i.number, party: i.clientName, date: ymd(i.date), taxable, tax, href: `/income?invoice=${i.id}`, note });

    if (key === "outward") for (const i of included) { if (isZeroRated(i)) continue; const t = taxOfLines(i, (l) => !isNilLine(l)); if (t.n) inv(i, t.taxable, t.tax); }
    if (key === "outward") {
      // Debit notes, amendments and advances also move 3.1(a), so the drill-down must show them or it would not add up.
      for (const d of data.debitNotes ?? []) if (d.date >= start && d.date <= end) out.push({ kind: "note", id: d.id, number: d.number, party: d.name, date: ymd(d.date), taxable: d.taxable, tax: r2(d.igst + d.cgst + d.sgst + d.cess), href: "/tax?tab=documents", note: "DEBIT" });
      for (const a of data.amendments ?? []) {
        const pr = periodRange(a.periodKey);
        const inPeriod = !!pr && pr.start.getTime() >= start.getTime() && pr.end.getTime() <= end.getTime();
        if (!inPeriod) continue;
        out.push({ kind: "note", id: a.id, number: a.originalNumber, party: a.name ?? "", date: ymd(a.originalDate), taxable: r2(a.revised.taxable - a.original.taxable), tax: r2((a.revised.igst + a.revised.cgst + a.revised.sgst) - (a.original.igst + a.original.cgst + a.original.sgst)), href: "/tax?tab=documents", note: "AMENDMENT" });
      }
      for (const a of data.advances ?? []) {
        if (a.receivedAt >= start && a.receivedAt <= end) out.push({ kind: "note", id: `${a.id}-r`, number: a.party, party: a.party, date: ymd(a.receivedAt), taxable: a.taxable, tax: r2(a.igst + a.cgst + a.sgst), href: "/tax?tab=documents", note: "ADVANCE" });
        if (a.adjustedAt && a.adjustedAt >= start && a.adjustedAt <= end) out.push({ kind: "note", id: `${a.id}-a`, number: a.adjustedInvoice ?? a.party, party: a.party, date: ymd(a.adjustedAt), taxable: -a.taxable, tax: -r2(a.igst + a.cgst + a.sgst), href: "/tax?tab=documents", note: "ADVANCE_ADJUSTED" });
      }
    }
    if (key === "zero_rated") for (const i of included) if (isZeroRated(i)) { const t = taxOfLines(i, () => true); inv(i, t.taxable, t.tax, i.supplyType); }
    if (key === "nil") for (const i of included) { if (isZeroRated(i)) continue; const t = taxOfLines(i, isNilLine); if (t.n) inv(i, t.taxable, 0); }
    if (key === "interstate_unreg") for (const i of included) if ((i.supplyType === "B2CL" || (i.supplyType === "B2CS" && i.interState))) { const t = taxOfLines(i, (l) => !isNilLine(l)); if (t.n) inv(i, t.taxable, t.tax, i.placeOfSupply); }
    if (key === "credit_notes") {
      for (const n of creditNotesForPeriod(data.creditNotes, start, end)) {
        out.push({ kind: "note", id: n.id, number: n.number, party: n.invoice.clientName, date: ymd(n.date), taxable: -r2(n.amount - n.taxAmount), tax: -r2(n.taxAmount), href: `/income?invoice=${n.invoice.id}`, note: n.invoice.number });
      }
    }

    const inRange = data.expenses.filter((e) => { const d = claimDate(e); return d >= start && d <= end; });
    const bill = (e: ExpenseGstInput, note?: string) =>
      out.push({ kind: "bill", id: e.id, number: e.vendorInvoiceNo ?? "—", party: e.vendor, date: ymd(e.date), taxable: expenseTaxable(e), tax: r2(e.igst + e.cgst + e.sgst + e.cess), href: `/expenses?expense=${e.id}`, note });
    if (key === "rcm") for (const e of inRange) if (e.itcStatus === "REVERSE_CHARGE") bill(e);
    if (key === "itc_rcm") for (const e of inRange) if (e.itcStatus === "REVERSE_CHARGE" && !e.itcHeld) bill(e);
    if (key === "itc_other") for (const e of inRange) if (e.itcStatus === "ELIGIBLE" && !e.itcHeld) bill(e);
    if (key === "itc_ineligible") for (const e of inRange) if (e.itcStatus === "INELIGIBLE") bill(e);
    if (key === "itc_held") for (const e of inRange) if (e.itcHeld && (e.itcStatus === "ELIGIBLE" || e.itcStatus === "REVERSE_CHARGE")) bill(e, "HELD");
    if (key === "reversals") {
      for (const a of data.adjustments) {
        if (!a.kind.startsWith("ITC_REVERSAL")) continue;
        const m = new Date(`${a.periodKey}-01T00:00:00Z`);
        if (m >= new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)) && m <= end)
          out.push({ kind: "adjustment", id: a.id, number: a.kind, party: a.notes ?? "", date: `${a.periodKey}-01`, taxable: 0, tax: r2(a.igst + a.cgst + a.sgst + a.cess), href: "/tax?tab=itc" });
      }
      for (const e of data.expenses) {
        if (e.itcStatus !== "ELIGIBLE" || e.itcHeld || (e.paymentStatus !== "UNPAID" && !(e.paidAt && e.paidAt > new Date(e.date.getTime() + 180 * 86400000)))) continue;
        const lapse = new Date(e.date.getTime() + 180 * 86400000);
        if (lapse >= start && lapse <= end && !(e.paidAt && e.paidAt <= lapse)) bill(e, "RULE_37");
      }
    }
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
