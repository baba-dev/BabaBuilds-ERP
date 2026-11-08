import type { Gstr1Report } from "./gstr1";
import type { Gstr9Report } from "./gstr9";
import type { Gstr3bReport } from "./gstr3b";
import { stateName } from "./states";

type Cell = string | number | null | undefined;
export type Rows = Cell[][];

/** CSV text for a list of rows; cells starting with = + - @ are neutralised against spreadsheet formula injection. */
export function csvText(rows: Rows): string {
  const cell = (v: Cell) => {
    let t = v === null || v === undefined ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(t) && !/^-?\d+(\.\d+)?$/.test(t)) t = `'${t}`;
    return `"${t.replace(/"/g, '""')}"`;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}

export function gstr1Rows(r: Gstr1Report): Rows {
  const rows: Rows = [["Section", "Document", "Date", "Party", "GSTIN", "Place of supply", "Rate %", "Taxable value", "IGST", "CGST", "SGST", "Cess", "Invoice value"]];
  type Doc = { number: string; date: string; pos: string; value: number; lines: Array<{ rate: number; taxable: number; igst: number; cgst: number; sgst: number; cess: number }> };
  const push = (section: string, doc: Doc, party: string, gstin: string) => {
    for (const l of doc.lines) rows.push([section, doc.number, doc.date, party, gstin, stateName(doc.pos) || doc.pos, l.rate, l.taxable, l.igst, l.cgst, l.sgst, l.cess, doc.value]);
  };
  for (const p of r.b2b) for (const i of p.invoices) push(i.rcm ? "4B B2B (reverse charge)" : "4A B2B", i, p.name, p.gstin);
  for (const i of r.b2cl) push("5 B2C large", i, "", "");
  for (const s of r.b2cs) rows.push(["7 B2C small", "", "", "", "", stateName(s.pos), s.rate, s.taxable, s.igst, s.cgst, s.sgst, s.cess, ""]);
  for (const i of r.exports) push(i.supplyType === "EXPWP" ? "6A Export (with payment)" : "6A Export (LUT)", i, "", "");
  for (const p of r.sez) for (const i of p.invoices) push(i.supplyType === "SEZWP" ? "6B SEZ (with payment)" : "6B SEZ (without payment)", i, p.name, p.gstin);
  for (const p of r.cdnr) for (const n of p.notes) push(n.noteType === "D" ? "9B Debit note (registered)" : "9B Credit note (registered)", n, p.name, p.gstin);
  for (const n of r.cdnur) push(n.noteType === "D" ? "9B Debit note (unregistered)" : "9B Credit note (unregistered)", n, "", "");
  for (const a of r.amendments.b2b) rows.push(["9A B2B amendment", a.originalNumber, a.originalDate, a.name, a.gstin ?? "", stateName(a.pos), a.rate, a.delta.taxable, a.delta.igst, a.delta.cgst, a.delta.sgst, a.delta.cess, ""]);
  for (const a of r.amendments.b2cs) rows.push(["10 B2C amendment", a.originalNumber, a.originalDate, a.name, "", stateName(a.pos), a.rate, a.delta.taxable, a.delta.igst, a.delta.cgst, a.delta.sgst, a.delta.cess, ""]);
  for (const n of r.nil) rows.push([`8 Nil/exempt ${n.key.replace("_", " ")}`, "", "", "", "", "", 0, n.nil + n.exempt + n.nonGst, 0, 0, 0, 0, ""]);
  for (const a of r.advances.received) rows.push(["11A Advance received", "", "", "", "", stateName(a.pos), a.rate, a.taxable, a.igst, a.cgst, a.sgst, 0, ""]);
  for (const a of r.advances.adjusted) rows.push(["11B Advance adjusted", "", "", "", "", stateName(a.pos), a.rate, -a.taxable, -a.igst, -a.cgst, -a.sgst, 0, ""]);
  for (const e of r.eco) rows.push(["14 Through e-commerce operator", `${e.invoices} invoices`, "", "", e.gstin, "", "", e.taxable, e.igst, e.cgst, e.sgst, e.cess, ""]);
  for (const h of r.hsnB2b) rows.push(["12 HSN (B2B)", h.hsn, "", h.description, "", "", h.rate, h.taxable, h.igst, h.cgst, h.sgst, h.cess, h.value]);
  for (const h of r.hsnB2c) rows.push(["12 HSN (B2C)", h.hsn, "", h.description, "", "", h.rate, h.taxable, h.igst, h.cgst, h.sgst, h.cess, h.value]);
  return rows;
}

export function gstr3bRows(r: Gstr3bReport): Rows {
  const row = (label: string, x: { taxable?: number; igst: number; cgst: number; sgst: number; cess: number }): Cell[] => [label, x.taxable ?? "", x.igst, x.cgst, x.sgst, x.cess];
  const z = { igst: 0, cgst: 0, sgst: 0, cess: 0 };
  return [
    ["Section", "Taxable value", "IGST", "CGST", "SGST", "Cess"],
    row("3.1(a) Outward taxable supplies", r.s31.a),
    row("3.1(b) Zero-rated supplies", r.s31.b),
    ["3.1(c) Nil-rated, exempt", r.s31.c.taxable, 0, 0, 0, 0],
    row("3.1(d) Inward supplies liable to reverse charge", r.s31.d),
    ...r.s32.map((s) => [`3.2 Inter-state to unregistered: ${stateName(s.pos) || s.pos}`, s.taxable, s.igst, 0, 0, 0] as Cell[]),
    row("4(A)(3) ITC on reverse charge", { ...r.s4.a.rcm }),
    row("4(A)(5) All other ITC", { ...r.s4.a.other }),
    row("4(B)(1) Reversed: rules 38, 42, 43", { ...r.s4.b.rules }),
    row("4(B)(2) Reversed: others", { ...r.s4.b.other }),
    row("4(C) Net ITC available", { ...r.s4.c }),
    row("4(D) Ineligible ITC", { ...r.s4.d.ineligible }),
    row("6.1 Tax payable", { ...r.payment.liability }),
    row("6.1 Paid through ITC", { igst: r.payment.liability.igst - r.payment.cash.igst - r.payment.cashCredits.igst, cgst: r.payment.liability.cgst - r.payment.cash.cgst - r.payment.cashCredits.cgst, sgst: r.payment.liability.sgst - r.payment.cash.sgst - r.payment.cashCredits.sgst, cess: r.payment.liability.cess - r.payment.cash.cess - r.payment.cashCredits.cess }),
    row("6.1 TDS/TCS credit used", { ...r.payment.cashCredits }),
    row("6.1 Paid in cash", { ...r.payment.cash }),
    row("Credit carried forward", { ...(r.payment.closingItc ?? z) }),
  ];
}

export function gstr9Rows(report: Gstr9Report): Rows {
  const rows: Rows = [["Table", "Row", "Taxable value", "IGST", "CGST", "SGST", "Cess"]];
  const add = (table: string, group: Record<string, { taxable?: number; igst: number; cgst: number; sgst: number; cess: number }>) => {
    for (const [k, v] of Object.entries(group)) rows.push([table, k.toUpperCase(), v.taxable ?? "", v.igst, v.cgst, v.sgst, v.cess]);
  };
  add("4", report.t4);
  add("5", report.t5);
  add("6", report.t6);
  add("7", report.t7);
  add("8", report.t8.rows);
  for (const h of report.t9) rows.push(["9", h.head, "", h.payable, h.cash, h.itc, ""]);
  add("10-16", report.manual);
  for (const h of report.t17) rows.push(["17", `${h.hsn} @${h.rate}%`, h.taxable, h.igst, h.cgst, h.sgst, h.cess]);
  for (const h of report.t18) rows.push(["18", `${h.hsn} @${h.rate}%`, h.taxable, h.igst, h.cgst, h.sgst, h.cess]);
  rows.push(["9C", "Turnover per books", report.c9.turnoverBooks, "", "", "", ""]);
  for (const i of report.c9.items) rows.push(["9C", i.label, i.amount, "", "", "", ""]);
  rows.push(["9C", "Turnover per GSTR-9", report.c9.turnoverDeclared, "", "", "", ""]);
  rows.push(["9C", "Unreconciled difference", report.c9.unreconciled, "", "", "", ""]);
  return rows;
}
