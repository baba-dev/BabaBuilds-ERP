import { addHeads, r2, totalTax, zeroHeads, type TaxHeads, type TaxRow } from "./money";
import type { InterStateRow, PeriodBooks } from "./books";
import { utilizeItc, type Utilisation } from "./itc";

export type Gstr3bReport = {
  periodKey: string;
  /** 3.1 outward supplies and inward supplies liable to reverse charge */
  s31: { a: TaxRow; b: TaxRow; c: { taxable: number }; d: TaxRow; e: { taxable: number } };
  /** 3.2 inter-state supplies to unregistered persons by place of supply */
  s32: InterStateRow[];
  /** 4 eligible ITC */
  s4: {
    a: { rcm: TaxHeads; other: TaxHeads; total: TaxHeads };
    b: { rules: TaxHeads; other: TaxHeads; total: TaxHeads };
    c: TaxHeads;
    d: { ineligible: TaxHeads };
  };
  /** 6.1 payment of tax */
  payment: {
    liability: TaxHeads;
    rcmCash: TaxHeads;
    openingItc: TaxHeads;
    itcAvailable: TaxHeads;
    utilisation: Utilisation;
    itcUsed: TaxHeads;
    cash: TaxHeads;
    closingItc: TaxHeads;
    cashTotal: number;
    /** TDS/TCS credit applied against the cash payable. */
    cashCredits: TaxHeads;
    /** Credit held back and not claimed this period. */
    itcHeld: TaxHeads;
  };
};

const sumHeads = (a: TaxHeads, b: TaxHeads): TaxHeads => addHeads(a, b);
const neg = (h: TaxHeads): TaxHeads => ({ igst: -h.igst, cgst: -h.cgst, sgst: -h.sgst, cess: -h.cess });
const positive = (h: TaxHeads): TaxHeads => ({ igst: Math.max(0, h.igst), cgst: Math.max(0, h.cgst), sgst: Math.max(0, h.sgst), cess: Math.max(0, h.cess) });
const headsOf = (r: TaxRow): TaxHeads => ({ igst: r.igst, cgst: r.cgst, sgst: r.sgst, cess: r.cess });

/**
 * Build a GSTR-3B for one filing period.
 * `carryIn` is the credit ledger balance brought forward from the previous period; manual opening balances in
 * the period are added on top.
 */
export function buildGstr3b(periodKey: string, books: PeriodBooks, carryIn: TaxHeads = zeroHeads()): Gstr3bReport {
  const itcA = { rcm: books.itcRcm, other: sumHeads(books.itcOther, books.reclaimed), total: zeroHeads() };
  itcA.total = sumHeads(itcA.rcm, itcA.other);
  const itcB = { rules: books.reversalRules, other: books.reversalOther, total: sumHeads(books.reversalRules, books.reversalOther) };
  const itcC = positive(sumHeads(itcA.total, neg(itcB.total)));

  // Outward liability (net of credit notes, floored at zero per head) + zero-rated IGST paid + RCM + manual adjustments.
  const outwardLiab = positive(sumHeads(sumHeads(headsOf(books.outward), headsOf(books.zeroRatedWithPayment)), books.liabilityAdjustment));
  const rcmCash = headsOf(books.rcm);
  const liability = sumHeads(outwardLiab, rcmCash);

  const openingItc = sumHeads(carryIn, books.openingItc);
  const itcAvailable = sumHeads(openingItc, itcC);

  // RCM tax is paid in cash first (it cannot be paid from credit); its ITC (already in 4A) is then usable on output tax.
  const util = utilizeItc(outwardLiab, itcAvailable);
  const cashBefore = sumHeads(util.cash, rcmCash);
  const applied = (k: keyof TaxHeads) => Math.min(cashBefore[k], books.cashCredits[k]);
  const cashCredits: TaxHeads = { igst: applied("igst"), cgst: applied("cgst"), sgst: applied("sgst"), cess: applied("cess") };
  const cash: TaxHeads = { igst: r2(cashBefore.igst - cashCredits.igst), cgst: r2(cashBefore.cgst - cashCredits.cgst), sgst: r2(cashBefore.sgst - cashCredits.sgst), cess: r2(cashBefore.cess - cashCredits.cess) };
  const itcUsed = sumHeads(
    { igst: util.utilisation.igstCredit.igst + util.utilisation.igstCredit.cgst + util.utilisation.igstCredit.sgst, cgst: 0, sgst: 0, cess: 0 },
    {
      igst: 0,
      cgst: util.utilisation.cgstCredit.cgst + util.utilisation.cgstCredit.igst,
      sgst: util.utilisation.sgstCredit.sgst + util.utilisation.sgstCredit.igst,
      cess: util.utilisation.cessCredit.cess,
    },
  );

  return {
    periodKey,
    s31: { a: books.outward, b: sumRows(books.zeroRatedWithPayment, books.zeroRatedWithoutPayment), c: { taxable: books.nilExempt }, d: books.rcm, e: { taxable: 0 } },
    s32: books.interStateUnregistered,
    s4: { a: itcA, b: itcB, c: itcC, d: { ineligible: books.itcIneligible } },
    payment: {
      liability,
      rcmCash,
      openingItc,
      itcAvailable,
      utilisation: util.utilisation,
      itcUsed,
      cash,
      closingItc: util.remaining,
      cashTotal: totalTax(cash),
      cashCredits,
      itcHeld: books.itcHeld,
    },
  };
}

function sumRows(a: TaxRow, b: TaxRow): TaxRow {
  return { taxable: r2(a.taxable + b.taxable), igst: r2(a.igst + b.igst), cgst: r2(a.cgst + b.cgst), sgst: r2(a.sgst + b.sgst), cess: r2(a.cess + b.cess) };
}

export type LedgerUnit = { key: string; books: PeriodBooks };

/** Walk filing periods in order, carrying the credit-ledger balance forward. */
export function buildLedger(units: LedgerUnit[]): Gstr3bReport[] {
  const out: Gstr3bReport[] = [];
  let carry = zeroHeads();
  for (const u of units) {
    const report = buildGstr3b(u.key, u.books, carry);
    carry = report.payment.closingItc;
    out.push(report);
  }
  return out;
}
