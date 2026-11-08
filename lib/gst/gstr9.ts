import { addHeads, addRow, r2, totalTax, zeroHeads, zeroRow, type TaxHeads, type TaxRow } from "./money";
import type { ExpenseGstInput, PeriodBooks } from "./books";
import { expenseTaxable } from "./books";
import type { Gstr1Report, Gstr1Invoice } from "./gstr1";
import type { Gstr3bReport } from "./gstr3b";
import { hsnForTurnover } from "./classify";
import { GST_RULES } from "./rules";

/** Rows of GSTR-9 that cannot be derived from books and are keyed in by the taxpayer. */
export const GSTR9_MANUAL_ROWS = [
  { key: "t4f", table: "4", label: "Advances on which tax has been paid but invoice not issued" },
  { key: "t4k", table: "4", label: "Supplies / tax declared through amendments (+)" },
  { key: "t4l", table: "4", label: "Supplies / tax reduced through amendments (-)" },
  { key: "t5b", table: "5", label: "Supplies to SEZ without payment of tax" },
  { key: "t5f", table: "5", label: "Non-GST supply (including no-supply)" },
  { key: "t8c", table: "8", label: "ITC on invoices of the previous financial year availed in this year" },
  { key: "t8e", table: "8", label: "ITC available but not availed" },
  { key: "t10", table: "10", label: "Supplies / tax declared through amendments (+) (net of debit notes)" },
  { key: "t11", table: "11", label: "Supplies / tax reduced through amendments (-) (net of credit notes)" },
  { key: "t12", table: "12", label: "Reversal of ITC availed during previous FY" },
  { key: "t13", table: "13", label: "ITC availed for previous FY" },
  { key: "t14", table: "14", label: "Differential tax paid on account of declaration in tables 10 & 11" },
  { key: "t15a", table: "15", label: "Total refund claimed" },
  { key: "t15b", table: "15", label: "Total refund sanctioned" },
  { key: "t15c", table: "15", label: "Total refund rejected" },
  { key: "t15d", table: "15", label: "Total refund pending" },
  { key: "t15e", table: "15", label: "Total demand of taxes" },
  { key: "t15f", table: "15", label: "Total taxes paid in respect of demands" },
  { key: "t15g", table: "15", label: "Total demands pending" },
  { key: "t16a", table: "16", label: "Supplies received from composition taxpayers" },
  { key: "t16b", table: "16", label: "Deemed supply under section 143 (job work)" },
  { key: "t16c", table: "16", label: "Goods sent on approval basis but not returned" },
] as const;

export type Gstr9ManualKey = (typeof GSTR9_MANUAL_ROWS)[number]["key"];
export type Gstr9Inputs = Partial<Record<Gstr9ManualKey, Partial<TaxRow>>> & { lateFeePaid?: number; interestPaid?: number; c9Items?: Array<{ label: string; amount: number }> };

const rowOf = (inputs: Gstr9Inputs, key: Gstr9ManualKey): TaxRow => ({ ...zeroRow(), ...(inputs[key] ?? {}) });

export type Gstr9HsnRow = TaxRow & { hsn: string; description: string; uqc: string; quantity: number; rate: number };

export type Gstr9Report = {
  fy: string;
  /** Aggregate turnover = table 4N + 5N (taxable + non-taxable). */
  turnover: number;
  t4: Record<string, TaxRow>;
  t5: Record<string, TaxRow>;
  t6: Record<string, TaxHeads>;
  t7: Record<string, TaxHeads>;
  t8: { as2b: TaxHeads; asBooks: TaxHeads; difference: TaxHeads; ineligibleOrNotInBooks: TaxHeads; rows: Record<string, TaxHeads> };
  /** GSTR-9C style reconciliation, pre-filled from the books. */
  c9: { turnoverBooks: number; items: Array<{ label: string; amount: number }>; turnoverAdjusted: number; turnoverDeclared: number; unreconciled: number; taxPayable: number; taxPaid: number; itcPerBooks: number; itcPerReturn: number; itcDifference: number };
  t9: Array<{ head: "IGST" | "CGST" | "SGST" | "CESS"; payable: number; cash: number; itc: number }>;
  manual: Record<string, TaxRow>;
  t17: Gstr9HsnRow[];
  t18: Gstr9HsnRow[];
  t19: { lateFeeEstimate: number; lateFeePaid: number; interestPaid: number };
  gstr9cRequired: boolean;
  gstr9Optional: boolean;
  /** Books turnover vs returns turnover (the 9C style reconciliation). */
  reconciliation: { booksTurnover: number; declared: number; difference: number };
};

const sumInvoices = (list: Gstr1Invoice[], pred: (rate: number) => boolean = () => true): TaxRow => {
  let acc = zeroRow();
  for (const inv of list) for (const l of inv.lines) if (pred(l.rate)) acc = addRow(acc, l);
  return acc;
};

const negateRow = (r: TaxRow): TaxRow => ({ taxable: -r.taxable, igst: -r.igst, cgst: -r.cgst, sgst: -r.sgst, cess: -r.cess });
const heads = (e: { igst: number; cgst: number; sgst: number; cess: number }): TaxHeads => ({ igst: e.igst, cgst: e.cgst, sgst: e.sgst, cess: e.cess });

type PurchaseKind = "inputs" | "capital" | "services";
export function purchaseKind(e: Pick<ExpenseGstInput, "category" | "hsn">): PurchaseKind {
  if (/asset|equipment|machiner|furniture|computer|laptop|hardware|vehicle/i.test(e.category)) return "capital";
  if (!e.hsn || e.hsn.startsWith("99")) return "services";
  return "inputs";
}

function hsnRollup(rows: Array<{ hsn: string; description: string; rate: number; taxable: number; igst: number; cgst: number; sgst: number; cess: number; quantity: number }>, prevTurnover: number): Gstr9HsnRow[] {
  const map = new Map<string, Gstr9HsnRow>();
  for (const r of rows) {
    const hsn = hsnForTurnover(r.hsn, prevTurnover) || "NA";
    const key = `${hsn}|${r.rate}`;
    const cur = map.get(key) ?? { hsn, description: r.description.slice(0, 30), uqc: "NA", quantity: 0, rate: r.rate, ...zeroRow() };
    map.set(key, { ...cur, ...addRow(cur, r), quantity: cur.quantity + r.quantity });
  }
  return Array.from(map.values()).sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
}

export function buildGstr9(args: {
  fy: string;
  monthly: Gstr1Report[];
  books: PeriodBooks;
  ledger: Gstr3bReport[];
  expenses: ExpenseGstInput[];
  twoBTotals: TaxHeads;
  inputs: Gstr9Inputs;
  prevTurnover: number;
  booksTurnover: number;
  lateFeeEstimate: number;
}): Gstr9Report {
  const { monthly, books, inputs } = args;
  const b2b = monthly.flatMap((m) => m.b2b.flatMap((p) => p.invoices));
  const b2cl = monthly.flatMap((m) => m.b2cl);
  const exportsAll = monthly.flatMap((m) => m.exports);
  const sezAll = monthly.flatMap((m) => m.sez.flatMap((p) => p.invoices));
  const allNotes = monthly.flatMap((m) => [...m.cdnr.flatMap((p) => p.notes), ...m.cdnur]);
  const creditNotes = allNotes.filter((n) => n.noteType === "C");
  const debitNotes = allNotes.filter((n) => n.noteType === "D");
  const taxed = (rate: number) => rate > 0;

  // Advances received and not yet invoiced (4F), amendments split into increases and decreases (4K / 4L).
  const advRow = (rows: Array<{ taxable: number; igst: number; cgst: number; sgst: number }>): TaxRow => rows.reduce<TaxRow>((a, r) => addRow(a, { taxable: r.taxable, igst: r.igst, cgst: r.cgst, sgst: r.sgst }), zeroRow());
  const advancesNet = addRow(advRow(monthly.flatMap((m) => m.advances.received)), negateRow(advRow(monthly.flatMap((m) => m.advances.adjusted))));
  const amendDeltas = monthly.flatMap((m) => [...m.amendments.b2b, ...m.amendments.b2cs].map((a) => a.delta));
  const amendUp = amendDeltas.filter((d) => d.taxable + d.igst + d.cgst + d.sgst >= 0).reduce<TaxRow>((a, d) => addRow(a, d), zeroRow());
  const amendDown = amendDeltas.filter((d) => d.taxable + d.igst + d.cgst + d.sgst < 0).reduce<TaxRow>((a, d) => addRow(a, negateRow(d)), zeroRow());

  const b2cs = monthly.flatMap((m) => m.b2cs).reduce<TaxRow>((a, r) => addRow(a, r), zeroRow());
  const t4: Record<string, TaxRow> = {
    a: addRow(sumInvoices(b2cl, taxed), b2cs),
    b: sumInvoices(b2b.filter((i) => !i.rcm), taxed),
    c: sumInvoices(exportsAll.filter((i) => i.supplyType === "EXPWP"), taxed),
    d: sumInvoices(sezAll.filter((i) => i.supplyType === "SEZWP"), taxed),
    e: zeroRow(),
    f: addRow(advancesNet, rowOf(inputs, "t4f")),
    g: books.rcm,
  };
  t4.h = Object.values(t4).reduce((a, r) => addRow(a, r), zeroRow());
  t4.i = sumInvoices(creditNotes);
  t4.j = sumInvoices(debitNotes);
  t4.k = addRow(amendUp, rowOf(inputs, "t4k"));
  t4.l = addRow(amendDown, rowOf(inputs, "t4l"));
  t4.m = addRow(addRow(addRow(addRow(t4.h, negateRow(t4.i)), t4.j), t4.k), negateRow(t4.l));
  t4.n = t4.m;

  const nilTaxable = monthly.reduce((s, m) => s + m.nil.reduce((x, n) => x + n.nil, 0), 0);
  const exemptTaxable = monthly.reduce((s, m) => s + m.nil.reduce((x, n) => x + n.exempt, 0), 0);
  const t5: Record<string, TaxRow> = {
    a: { ...zeroRow(), taxable: sumInvoices(exportsAll.filter((i) => i.supplyType === "EXPWOP")).taxable },
    b: addRow({ ...zeroRow(), taxable: sumInvoices(sezAll.filter((i) => i.supplyType === "SEZWOP")).taxable }, rowOf(inputs, "t5b")),
    c: { ...zeroRow(), taxable: sumInvoices(b2b.filter((i) => i.rcm)).taxable },
    d: { ...zeroRow(), taxable: r2(exemptTaxable) },
    e: { ...zeroRow(), taxable: r2(nilTaxable) },
    f: rowOf(inputs, "t5f"),
  };
  t5.g = Object.values(t5).reduce((a, r) => addRow(a, r), zeroRow());
  t5.n = t5.g;
  // Aggregate turnover excludes inward reverse-charge supplies (4G) that sit in the table 4 totals.
  const turnover = r2(t4.n.taxable - t4.g.taxable + t5.n.taxable);

  // Table 6: ITC availed per the returns
  const sum = (list: ExpenseGstInput[]): TaxHeads => list.reduce((a, e) => addHeads(a, heads(e)), zeroHeads());
  const eligible = args.expenses.filter((e) => e.itcStatus === "ELIGIBLE" && !e.itcHeld);
  const rcm = args.expenses.filter((e) => e.itcStatus === "REVERSE_CHARGE" && !e.itcHeld);
  const t6: Record<string, TaxHeads> = {
    b_inputs: sum(eligible.filter((e) => purchaseKind(e) === "inputs")),
    b_capital: sum(eligible.filter((e) => purchaseKind(e) === "capital")),
    b_services: sum(eligible.filter((e) => purchaseKind(e) === "services")),
    c_unregistered: sum(rcm.filter((e) => !e.vendorGstin)),
    d_registered: sum(rcm.filter((e) => !!e.vendorGstin)),
    e_import_goods: zeroHeads(),
    f_import_services: zeroHeads(),
    g_isd: zeroHeads(),
    h_reclaimed: books.reclaimed,
  };
  t6.i_subtotal = Object.values(t6).reduce((a, h) => addHeads(a, h), zeroHeads());
  t6.a_per3b = args.ledger.reduce((a, r) => addHeads(a, addHeads(r.s4.a.total, zeroHeads())), zeroHeads());
  t6.j_difference = addHeads(t6.a_per3b, { igst: -t6.i_subtotal.igst, cgst: -t6.i_subtotal.cgst, sgst: -t6.i_subtotal.sgst, cess: -t6.i_subtotal.cess });
  t6.m_total = t6.i_subtotal;

  const kind = (k: string) => books.reversalByKind[k] ?? zeroHeads();
  const t7: Record<string, TaxHeads> = {
    a_rule37: kind("ITC_REVERSAL_RULE_37"),
    b_rule39: zeroHeads(),
    c_rule42: kind("ITC_REVERSAL_RULE_42"),
    d_rule43: kind("ITC_REVERSAL_RULE_43"),
    e_section17_5: books.itcIneligible,
    f_tran1: zeroHeads(),
    g_tran2: zeroHeads(),
    h_other: addHeads(kind("ITC_REVERSAL_OTHER"), kind("ITC_REVERSAL_RULE_38")),
  };
  t7.i_total = Object.values(t7).reduce((a, h) => addHeads(a, h), zeroHeads());
  const reversedOutside17 = addHeads(t7.i_total, { igst: -books.itcIneligible.igst, cgst: -books.itcIneligible.cgst, sgst: -books.itcIneligible.sgst, cess: -books.itcIneligible.cess });
  t7.j_net = addHeads(t6.m_total, { igst: -reversedOutside17.igst, cgst: -reversedOutside17.cgst, sgst: -reversedOutside17.sgst, cess: -reversedOutside17.cess });

  const asBooks = t6.m_total;
  const neg = (h: TaxHeads): TaxHeads => ({ igst: -h.igst, cgst: -h.cgst, sgst: -h.sgst, cess: -h.cess });
  const manualHeads = (k: Gstr9ManualKey): TaxHeads => { const r = rowOf(inputs, k); return { igst: r.igst, cgst: r.cgst, sgst: r.sgst, cess: r.cess }; };
  // 8A per 2B, 8B availed in the year, 8C previous-year credit availed now, 8D = A - (B + C), 8E available but not availed,
  // 8F availed but ineligible, 8K = credit to lapse (8D less 8E and 8F, floored at zero).
  const d8 = addHeads(args.twoBTotals, neg(addHeads(asBooks, manualHeads("t8c"))));
  const positive = (h: TaxHeads): TaxHeads => ({ igst: Math.max(0, h.igst), cgst: Math.max(0, h.cgst), sgst: Math.max(0, h.sgst), cess: Math.max(0, h.cess) });
  const t8 = {
    as2b: args.twoBTotals,
    asBooks,
    difference: addHeads(args.twoBTotals, neg(asBooks)),
    ineligibleOrNotInBooks: books.itcIneligible,
    rows: {
      a: args.twoBTotals, b: asBooks, c: manualHeads("t8c"), d: d8, e: manualHeads("t8e"), f: books.itcIneligible,
      k: positive(addHeads(d8, neg(addHeads(manualHeads("t8e"), books.itcIneligible)))),
    },
  };

  // Table 9: tax payable vs paid (from the ledger, i.e. cash vs credit utilisation)
  const liab = args.ledger.reduce((a, r) => addHeads(a, r.payment.liability), zeroHeads());
  const cash = args.ledger.reduce((a, r) => addHeads(a, r.payment.cash), zeroHeads());
  const t9 = (["igst", "cgst", "sgst", "cess"] as const).map((k) => ({
    head: k.toUpperCase() as "IGST" | "CGST" | "SGST" | "CESS",
    payable: liab[k],
    cash: cash[k],
    itc: r2(liab[k] - cash[k]),
  }));

  const manual: Record<string, TaxRow> = {};
  for (const m of GSTR9_MANUAL_ROWS) manual[m.key] = rowOf(inputs, m.key);

  const t17 = hsnRollup(monthly.flatMap((m) => [...m.hsnB2b, ...m.hsnB2c]), args.prevTurnover);
  const t18 = hsnRollup(
    args.expenses
      .filter((e) => e.itcStatus !== "NONE")
      .map((e) => ({ hsn: e.hsn, description: e.vendor, rate: e.rate ?? 0, taxable: expenseTaxable(e), igst: e.igst, cgst: e.cgst, sgst: e.sgst, cess: e.cess, quantity: 1 })),
    args.prevTurnover,
  );

  const items = (inputs.c9Items ?? []).filter((i) => i.label.trim() && Number.isFinite(i.amount)).slice(0, 30);
  const adjusted = r2(args.booksTurnover + items.reduce((sum, i) => sum + i.amount, 0));
  const taxPayable = r2(t9.reduce((sum, h) => sum + h.payable, 0));
  const taxPaid = r2(t9.reduce((sum, h) => sum + h.cash + h.itc, 0));
  const itcBooks = r2(totalTax(asBooks));
  const itcReturn = r2(totalTax(args.ledger.reduce((a, r) => addHeads(a, r.s4.a.total), zeroHeads())));

  return {
    fy: args.fy,
    turnover,
    t4,
    t5,
    t6,
    t7,
    t8,
    t9,
    manual,
    t17,
    t18,
    t19: { lateFeeEstimate: args.lateFeeEstimate, lateFeePaid: inputs.lateFeePaid ?? 0, interestPaid: inputs.interestPaid ?? 0 },
    gstr9cRequired: turnover > GST_RULES.gstr9cAbove,
    gstr9Optional: turnover <= GST_RULES.gstr9OptionalUpTo,
    reconciliation: { booksTurnover: args.booksTurnover, declared: turnover, difference: r2(args.booksTurnover - turnover) },
    c9: { turnoverBooks: args.booksTurnover, items, turnoverAdjusted: adjusted, turnoverDeclared: turnover, unreconciled: r2(adjusted - turnover), taxPayable, taxPaid, itcPerBooks: itcBooks, itcPerReturn: itcReturn, itcDifference: r2(itcBooks - itcReturn) },
  };
}

export { totalTax };
