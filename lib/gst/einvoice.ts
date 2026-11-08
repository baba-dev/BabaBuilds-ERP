import { stateName } from "./states";
import { normalizeGstin } from "./gstin";
import { r2 } from "./money";
import type { ClassifiedInvoice } from "./classify";
import { GST_RULES } from "./rules";

/** Above ₹10 crore turnover an invoice must be reported to the IRP within 30 days of its date. */
export const EINVOICE_REPORTING_WINDOW_DAYS = 30;
export const EINVOICE_REPORTING_WINDOW_ABOVE = 100_000_000;

export type EInvoiceStatus = "NOT_REQUIRED" | "REPORTED" | "PENDING" | "OVERDUE";

/** Which invoices need an IRN: B2B, SEZ and exports, once the previous year's turnover is above ₹5 crore. */
export function needsEInvoice(prevTurnover: number, supplyType: ClassifiedInvoice["supplyType"]): boolean {
  if (prevTurnover <= GST_RULES.eInvoiceAbove) return false;
  return supplyType === "B2B" || supplyType === "B2B_RCM" || supplyType === "EXPWP" || supplyType === "EXPWOP" || supplyType === "SEZWP" || supplyType === "SEZWOP";
}

export function eInvoiceStatus(args: { prevTurnover: number; invoiceDate: Date; supplyType: ClassifiedInvoice["supplyType"]; irn: string | null; now?: Date }): { status: EInvoiceStatus; dueBy: Date | null; daysLeft: number | null } {
  const now = args.now ?? new Date();
  if (args.irn) return { status: "REPORTED", dueBy: null, daysLeft: null };
  if (!needsEInvoice(args.prevTurnover, args.supplyType)) return { status: "NOT_REQUIRED", dueBy: null, daysLeft: null };
  if (args.prevTurnover < EINVOICE_REPORTING_WINDOW_ABOVE) return { status: "PENDING", dueBy: null, daysLeft: null };
  const dueBy = new Date(args.invoiceDate.getTime() + EINVOICE_REPORTING_WINDOW_DAYS * 86400000);
  const daysLeft = Math.ceil((dueBy.getTime() - now.getTime()) / 86400000);
  return { status: daysLeft < 0 ? "OVERDUE" : "PENDING", dueBy, daysLeft };
}

/** IRNs are 64 lowercase hex characters (a SHA-256). */
export const isValidIrn = (irn: string) => /^[0-9a-f]{64}$/.test(irn);

const dmy = (d: Date) => `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;
const pinOf = (text: string) => /\b(\d{6})\b/.exec(text)?.[1] ?? null;
const clip = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);

export type SellerDetails = { gstin: string; legalName: string; address: string; stateCode: string };
export type BuyerDetails = { gstin: string | null; legalName: string; address: string; stateCode: string | null };

/** e-Invoice payload (schema INV-01, v1.1) for upload to the IRP / offline tool. The IRP signs it and returns the IRN and QR. */
export function buildEInvoicePayload(args: { seller: SellerDetails; buyer: BuyerDetails; invoice: ClassifiedInvoice; reverseCharge?: boolean }): { payload: Record<string, unknown>; problems: string[] } {
  const { seller, buyer, invoice } = args;
  const problems: string[] = [];
  const sellerPin = pinOf(seller.address);
  if (!sellerPin) problems.push("SELLER_PIN");
  if (seller.address.trim().length < 3) problems.push("SELLER_ADDRESS");
  const isExport = invoice.supplyType === "EXPWP" || invoice.supplyType === "EXPWOP";
  const buyerPin = isExport ? "999999" : pinOf(buyer.address);
  if (!buyerPin) problems.push("BUYER_PIN");
  if (!isExport && !buyer.gstin) problems.push("BUYER_GSTIN");
  const supTyp = { B2B: "B2B", B2B_RCM: "B2B", EXPWP: "EXPWP", EXPWOP: "EXPWOP", SEZWP: "SEZWP", SEZWOP: "SEZWOP", B2CL: "B2B", B2CS: "B2B" }[invoice.supplyType];

  const items = invoice.lines.map((l, i) => {
    const qty = l.quantity > 0 ? l.quantity : 1;
    const tax = r2(l.igst + l.cgst + l.sgst + l.cess);
    if (!l.hsn) problems.push(`HSN_LINE_${i + 1}`);
    return {
      SlNo: String(i + 1), PrdDesc: clip(l.description || "Services", 300), IsServc: !l.hsn || l.hsn.startsWith("99") ? "Y" : "N", HsnCd: l.hsn || "",
      Qty: qty, Unit: "OTH", UnitPrice: r2(l.taxable / qty), TotAmt: l.taxable, AssAmt: l.taxable, GstRt: l.rate,
      IgstAmt: l.igst, CgstAmt: l.cgst, SgstAmt: l.sgst, CesAmt: l.cess, TotItemVal: r2(l.taxable + tax),
    };
  });
  const sum = (k: "igst" | "cgst" | "sgst" | "cess") => r2(invoice.lines.reduce((s, l) => s + l[k], 0));
  const payload = {
    Version: "1.1",
    TranDtls: { TaxSch: "GST", SupTyp: supTyp, RegRev: args.reverseCharge || invoice.supplyType === "B2B_RCM" ? "Y" : "N", IgstOnIntra: "N" },
    DocDtls: { Typ: "INV", No: invoice.number, Dt: dmy(invoice.date) },
    SellerDtls: { Gstin: normalizeGstin(seller.gstin), LglNm: clip(seller.legalName, 100), Addr1: clip(seller.address, 100), Loc: clip(stateName(seller.stateCode) || "India", 50), Pin: sellerPin ? Number(sellerPin) : 0, Stcd: seller.stateCode },
    BuyerDtls: {
      Gstin: isExport ? "URP" : normalizeGstin(buyer.gstin), LglNm: clip(buyer.legalName, 100), Pos: invoice.placeOfSupply, Addr1: clip(buyer.address, 100),
      Loc: clip(stateName(buyer.stateCode ?? invoice.placeOfSupply) || "Other", 50), Pin: buyerPin ? Number(buyerPin) : 0, Stcd: isExport ? "96" : (buyer.stateCode ?? invoice.placeOfSupply),
    },
    ItemList: items,
    ValDtls: { AssVal: invoice.taxable, CgstVal: sum("cgst"), SgstVal: sum("sgst"), IgstVal: sum("igst"), CesVal: sum("cess"), TotInvVal: invoice.value },
  };
  return { payload, problems: Array.from(new Set(problems)) };
}
