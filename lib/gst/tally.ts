import type { ClassifiedInvoice } from "./classify";
import type { ExpenseGstInput } from "./books";
import { expenseTaxable } from "./books";
import { r2 } from "./money";

const esc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c] as string);
const ymd = (d: Date) => `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
const amt = (n: number) => r2(n).toFixed(2);

export type TallyLedgers = { sales: string; purchase: string; cgst: string; sgst: string; igst: string; cess: string; inputCgst: string; inputSgst: string; inputIgst: string; inputCess: string };
export const DEFAULT_LEDGERS: TallyLedgers = { sales: "Sales", purchase: "Purchases", cgst: "Output CGST", sgst: "Output SGST", igst: "Output IGST", cess: "Output Cess", inputCgst: "Input CGST", inputSgst: "Input SGST", inputIgst: "Input IGST", inputCess: "Input Cess" };

const entry = (ledger: string, amount: number, debit: boolean, party = false) =>
  `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${esc(ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE>${party ? "<ISPARTYLEDGER>Yes</ISPARTYLEDGER>" : ""}<AMOUNT>${amt(debit ? -amount : amount)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;

/**
 * Tally Prime import XML: sales vouchers from invoices and purchase vouchers from bills, with the GST split posted to
 * output / input ledgers. Ledger names default to Tally's usual ones and can be overridden.
 */
export function buildTallyXml(args: { company: string; invoices: ClassifiedInvoice[]; expenses: ExpenseGstInput[]; ledgers?: Partial<TallyLedgers> }): string {
  const L = { ...DEFAULT_LEDGERS, ...args.ledgers };
  const vouchers: string[] = [];
  for (const inv of args.invoices) {
    if (inv.voided) continue;
    const sum = (k: "cgst" | "sgst" | "igst" | "cess") => r2(inv.lines.reduce((s, l) => s + l[k], 0));
    const tax: Array<[string, number]> = [[L.cgst, sum("cgst")], [L.sgst, sum("sgst")], [L.igst, sum("igst")], [L.cess, sum("cess")]];
    vouchers.push(
      `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Sales" ACTION="Create"><DATE>${ymd(inv.date)}</DATE><VOUCHERTYPENAME>Sales</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(inv.number)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(inv.clientName)}</PARTYLEDGERNAME><PARTYGSTIN>${esc(inv.gstin ?? "")}</PARTYGSTIN><PLACEOFSUPPLY>${esc(inv.placeOfSupply)}</PLACEOFSUPPLY>`
      + entry(inv.clientName, inv.value, true, true) + entry(L.sales, inv.taxable, false)
      + tax.filter(([, v]) => v > 0).map(([n, v]) => entry(n, v, false)).join("")
      + `</VOUCHER></TALLYMESSAGE>`,
    );
  }
  for (const e of args.expenses) {
    if (e.itcStatus === "NONE") continue;
    const taxable = expenseTaxable(e);
    const taxTotal = r2(e.igst + e.cgst + e.sgst + e.cess);
    const claim = e.itcStatus === "ELIGIBLE";
    const total = e.itcStatus === "REVERSE_CHARGE" ? taxable : e.amount;
    const taxEntries: Array<[string, number]> = claim ? [[L.inputCgst, e.cgst], [L.inputSgst, e.sgst], [L.inputIgst, e.igst], [L.inputCess, e.cess]] : [];
    vouchers.push(
      `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="Purchase" ACTION="Create"><DATE>${ymd(e.date)}</DATE><VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME><VOUCHERNUMBER>${esc(e.vendorInvoiceNo ?? e.id)}</VOUCHERNUMBER><PARTYLEDGERNAME>${esc(e.vendor)}</PARTYLEDGERNAME><PARTYGSTIN>${esc(e.vendorGstin ?? "")}</PARTYGSTIN>`
      + entry(e.vendor, total, false, true) + entry(L.purchase, claim ? taxable : r2(taxable + (e.itcStatus === "INELIGIBLE" ? taxTotal : 0)), true)
      + taxEntries.filter(([, v]) => v > 0).map(([n, v]) => entry(n, v, true)).join("")
      + `</VOUCHER></TALLYMESSAGE>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${esc(args.company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC><REQUESTDATA>${vouchers.join("")}</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>`;
}
