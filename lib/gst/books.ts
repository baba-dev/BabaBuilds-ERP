import { addHeads, addRow, r2, zeroHeads, zeroRow, type TaxHeads, type TaxRow } from "./money";
import type { Gstr1Report } from "./gstr1";

export type ExpenseGstInput = {
  id: string;
  date: Date;
  vendor: string;
  vendorGstin: string | null;
  vendorInvoiceNo: string | null;
  vendorStateCode: string | null;
  category: string;
  hsn: string;
  rate: number | null;
  amount: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  itcStatus: "NONE" | "ELIGIBLE" | "INELIGIBLE" | "REVERSE_CHARGE" | string;
  paymentStatus?: string;
  paidAt?: Date | null;
  itcHeld?: boolean;
  itcClaimMonth?: string | null;
};

export type AdjustmentInput = {
  id: string;
  periodKey: string;
  kind: string;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  notes: string | null;
};

export type InterStateRow = { pos: string; taxable: number; igst: number };

/** Everything a return period needs from the books, already aggregated. */
export type PeriodBooks = {
  outward: TaxRow;
  zeroRatedWithPayment: TaxRow;
  zeroRatedWithoutPayment: TaxRow;
  nilExempt: number;
  rcm: TaxRow;
  interStateUnregistered: InterStateRow[];
  itcRcm: TaxHeads;
  itcOther: TaxHeads;
  itcIneligible: TaxHeads;
  reversalRules: TaxHeads;
  reversalOther: TaxHeads;
  /** Manual reversals keyed by adjustment kind (feeds GSTR-9 table 7). */
  reversalByKind: Record<string, TaxHeads>;
  reclaimed: TaxHeads;
  openingItc: TaxHeads;
  liabilityAdjustment: TaxHeads;
  cashPaidAdjustment: TaxHeads;
  /** TDS / TCS credited to the electronic cash ledger, set off against cash tax. */
  cashCredits: TaxHeads;
  /** Credit held back (supplier not filed / not yet claimed): visible but not claimed. */
  itcHeld: TaxHeads;
};

export const emptyBooks = (): PeriodBooks => ({
  outward: zeroRow(),
  zeroRatedWithPayment: zeroRow(),
  zeroRatedWithoutPayment: zeroRow(),
  nilExempt: 0,
  rcm: zeroRow(),
  interStateUnregistered: [],
  itcRcm: zeroHeads(),
  itcOther: zeroHeads(),
  itcIneligible: zeroHeads(),
  reversalRules: zeroHeads(),
  reversalOther: zeroHeads(),
  reversalByKind: {},
  reclaimed: zeroHeads(),
  openingItc: zeroHeads(),
  liabilityAdjustment: zeroHeads(),
  cashPaidAdjustment: zeroHeads(),
  cashCredits: zeroHeads(),
  itcHeld: zeroHeads(),
});

const heads = (e: { igst: number; cgst: number; sgst: number; cess: number }): TaxHeads => ({ igst: e.igst, cgst: e.cgst, sgst: e.sgst, cess: e.cess });
const expenseTax = (e: ExpenseGstInput) => r2(e.igst + e.cgst + e.sgst + e.cess);

export function expenseTaxable(e: ExpenseGstInput): number {
  return r2(Math.max(0, e.amount - expenseTax(e)));
}

/** Aggregate GSTR-1-shaped sales + purchases + manual adjustments into the books used by GSTR-3B and the ledger. */
export function buildBooks(args: { gstr1: Gstr1Report; expenses: ExpenseGstInput[]; adjustments: AdjustmentInput[] }): PeriodBooks {
  const b = emptyBooks();
  const { gstr1 } = args;

  let exportsWp = zeroRow();
  let exportsWop = zeroRow();
  const zeroRatedDocs = [...gstr1.exports, ...gstr1.sez.flatMap((p) => p.invoices)];
  for (const inv of zeroRatedDocs) {
    for (const l of inv.lines) {
      if (inv.supplyType === "EXPWP" || inv.supplyType === "SEZWP") exportsWp = addRow(exportsWp, l);
      else exportsWop = addRow(exportsWop, l);
    }
  }
  b.zeroRatedWithPayment = exportsWp;
  b.zeroRatedWithoutPayment = exportsWop;
  // summary is net of credit notes and includes exports; 3.1(a) is everything else.
  b.outward = addRow(gstr1.summary, { taxable: -exportsWp.taxable - exportsWop.taxable, igst: -exportsWp.igst, cgst: -exportsWp.cgst, sgst: -exportsWp.sgst, cess: -exportsWp.cess });
  b.outward = { taxable: b.outward.taxable, igst: b.outward.igst, cgst: b.outward.cgst, sgst: b.outward.sgst, cess: b.outward.cess };
  b.nilExempt = r2(gstr1.nil.reduce((s, n) => s + n.nil + n.exempt + n.nonGst, 0));

  const inter = new Map<string, InterStateRow>();
  for (const inv of gstr1.b2cl) {
    const cur = inter.get(inv.pos) ?? { pos: inv.pos, taxable: 0, igst: 0 };
    for (const l of inv.lines) { cur.taxable = r2(cur.taxable + l.taxable); cur.igst = r2(cur.igst + l.igst); }
    inter.set(inv.pos, cur);
  }
  for (const r of gstr1.b2cs) {
    if (!r.interState) continue;
    const cur = inter.get(r.pos) ?? { pos: r.pos, taxable: 0, igst: 0 };
    cur.taxable = r2(cur.taxable + r.taxable);
    cur.igst = r2(cur.igst + r.igst);
    inter.set(r.pos, cur);
  }
  b.interStateUnregistered = Array.from(inter.values());

  for (const e of args.expenses) {
    const tax = heads(e);
    if (e.itcStatus === "REVERSE_CHARGE") {
      // The reverse-charge liability always arises; only the credit on it can be held back.
      b.rcm = addRow(b.rcm, { taxable: expenseTaxable(e), ...tax });
      if (e.itcHeld) b.itcHeld = addHeads(b.itcHeld, tax);
      else b.itcRcm = addHeads(b.itcRcm, tax);
    } else if (e.itcStatus === "ELIGIBLE") {
      if (e.itcHeld) b.itcHeld = addHeads(b.itcHeld, tax);
      else b.itcOther = addHeads(b.itcOther, tax);
    } else if (e.itcStatus === "INELIGIBLE") {
      b.itcIneligible = addHeads(b.itcIneligible, tax);
    }
  }

  for (const a of args.adjustments) {
    const h = heads(a);
    switch (a.kind) {
      case "ITC_OPENING": b.openingItc = addHeads(b.openingItc, h); break;
      case "ITC_REVERSAL_RULE_38":
      case "ITC_REVERSAL_RULE_42":
      case "ITC_REVERSAL_RULE_43":
        b.reversalRules = addHeads(b.reversalRules, h);
        b.reversalByKind[a.kind] = addHeads(b.reversalByKind[a.kind] ?? zeroHeads(), h);
        break;
      case "ITC_REVERSAL_RULE_37":
      case "ITC_REVERSAL_OTHER":
        b.reversalOther = addHeads(b.reversalOther, h);
        b.reversalByKind[a.kind] = addHeads(b.reversalByKind[a.kind] ?? zeroHeads(), h);
        break;
      case "ITC_REVERSED_CLAIMED_AGAIN": b.reclaimed = addHeads(b.reclaimed, h); break;
      case "LIABILITY_ADJUSTMENT": b.liabilityAdjustment = addHeads(b.liabilityAdjustment, h); break;
      case "CASH_PAID": b.cashPaidAdjustment = addHeads(b.cashPaidAdjustment, h); break;
      case "TDS_CREDIT":
      case "TCS_CREDIT": b.cashCredits = addHeads(b.cashCredits, h); break;
      default: break;
    }
  }
  return b;
}

export function mergeBooks(list: PeriodBooks[]): PeriodBooks {
  const out = emptyBooks();
  const inter = new Map<string, InterStateRow>();
  for (const x of list) {
    out.outward = addRow(out.outward, x.outward);
    out.zeroRatedWithPayment = addRow(out.zeroRatedWithPayment, x.zeroRatedWithPayment);
    out.zeroRatedWithoutPayment = addRow(out.zeroRatedWithoutPayment, x.zeroRatedWithoutPayment);
    out.nilExempt = r2(out.nilExempt + x.nilExempt);
    out.rcm = addRow(out.rcm, x.rcm);
    out.itcRcm = addHeads(out.itcRcm, x.itcRcm);
    out.itcOther = addHeads(out.itcOther, x.itcOther);
    out.itcIneligible = addHeads(out.itcIneligible, x.itcIneligible);
    out.reversalRules = addHeads(out.reversalRules, x.reversalRules);
    out.reversalOther = addHeads(out.reversalOther, x.reversalOther);
    for (const [k, v] of Object.entries(x.reversalByKind)) out.reversalByKind[k] = addHeads(out.reversalByKind[k] ?? zeroHeads(), v);
    out.reclaimed = addHeads(out.reclaimed, x.reclaimed);
    out.openingItc = addHeads(out.openingItc, x.openingItc);
    out.liabilityAdjustment = addHeads(out.liabilityAdjustment, x.liabilityAdjustment);
    out.cashPaidAdjustment = addHeads(out.cashPaidAdjustment, x.cashPaidAdjustment);
    out.cashCredits = addHeads(out.cashCredits, x.cashCredits);
    out.itcHeld = addHeads(out.itcHeld, x.itcHeld);
    for (const r of x.interStateUnregistered) {
      const cur = inter.get(r.pos) ?? { pos: r.pos, taxable: 0, igst: 0 };
      cur.taxable = r2(cur.taxable + r.taxable);
      cur.igst = r2(cur.igst + r.igst);
      inter.set(r.pos, cur);
    }
  }
  out.interStateUnregistered = Array.from(inter.values());
  return out;
}

/** Month a bill's credit is claimed in: the chosen claim month if it is not before the bill, else the bill's own month. */
export function claimDate(e: Pick<ExpenseGstInput, "date" | "itcClaimMonth">): Date {
  const m = e.itcClaimMonth && /^\d{4}-(0[1-9]|1[0-2])$/.test(e.itcClaimMonth) ? e.itcClaimMonth : null;
  if (!m) return e.date;
  const chosen = new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1, 1));
  const billMonth = new Date(Date.UTC(e.date.getUTCFullYear(), e.date.getUTCMonth(), 1));
  return chosen.getTime() > billMonth.getTime() ? chosen : e.date;
}

const RULE37_DAYS = 180;

/**
 * Rule 37: credit on a bill that stays unpaid 180 days after the invoice date must be reversed (with interest) in the
 * period the 180th day falls in, and can be claimed again in the period it is paid. Returns the movement for a period.
 */
export function rule37Movement(expenses: ExpenseGstInput[], start: Date, end: Date): { reversal: TaxHeads; reclaim: TaxHeads; reversedBills: string[]; reclaimedBills: string[] } {
  let reversal = zeroHeads();
  let reclaim = zeroHeads();
  const reversedBills: string[] = [];
  const reclaimedBills: string[] = [];
  for (const e of expenses) {
    if (e.itcStatus !== "ELIGIBLE" || e.itcHeld) continue;
    const lapse = new Date(e.date.getTime() + RULE37_DAYS * 86400000);
    const paidInTime = !!e.paidAt && e.paidAt.getTime() <= lapse.getTime();
    if (paidInTime) continue;
    // Bills never marked unpaid are assumed settled; only UNPAID or paid-after-the-deadline bills move.
    if (e.paymentStatus !== "UNPAID" && !(e.paidAt && e.paidAt.getTime() > lapse.getTime())) continue;
    if (lapse.getTime() >= start.getTime() && lapse.getTime() <= end.getTime()) { reversal = addHeads(reversal, heads(e)); reversedBills.push(e.id); }
    if (e.paidAt && e.paidAt.getTime() >= start.getTime() && e.paidAt.getTime() <= end.getTime() && e.paidAt.getTime() > lapse.getTime()) { reclaim = addHeads(reclaim, heads(e)); reclaimedBills.push(e.id); }
  }
  return { reversal, reclaim, reversedBills, reclaimedBills };
}
