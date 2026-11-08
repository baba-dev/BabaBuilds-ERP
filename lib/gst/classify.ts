import { GST_RULES } from "./rules";
import { FOREIGN_POS } from "./states";
import { validateGstin, normalizeGstin } from "./gstin";
import { r2, splitIntra, num, type TaxRow } from "./money";

export type SupplyType = "B2B" | "B2B_RCM" | "B2CL" | "B2CS" | "EXPWP" | "EXPWOP" | "SEZWP" | "SEZWOP";

export type InvoiceLineInput = {
  description: string;
  quantity: number;
  /** Pre-tax line amount in invoice currency. */
  amount: number;
  /** Tax rate as a fraction (0.18). */
  taxRate: number;
  sacCode: string | null;
};

export type InvoiceInput = {
  id: string;
  number: string;
  date: Date;
  voided: boolean;
  voidedAt: Date | null;
  exchangeRate: number;
  subtotal: number;
  taxAmount: number;
  total: number;
  taxRate: number;
  sacCode: string | null;
  isExemptMode: boolean;
  items: InvoiceLineInput[];
  clientId: string | null;
  clientName: string;
  recipientGstin: string | null;
  clientCountry: string | null;
  clientStateCode: string | null;
  placeOfSupplyOverride: string | null;
  reverseCharge: boolean;
  /** SEZ_WP | SEZ_WOP when the supply is to a SEZ unit or developer. */
  supplyOverride?: string | null;
  /** GSTIN of the e-commerce operator the supply went through, if any. */
  ecoGstin?: string | null;
  irn?: string | null;
  irnAckDate?: Date | null;
  ewayBillNo?: string | null;
};

export type GstLine = TaxRow & { rate: number; hsn: string; description: string; quantity: number; nil: boolean };

export type ClassifiedInvoice = {
  id: string;
  number: string;
  date: Date;
  clientId: string | null;
  clientName: string;
  gstin: string | null;
  supplyType: SupplyType;
  placeOfSupply: string;
  interState: boolean;
  /** Invoice value in INR (taxable + tax). */
  value: number;
  lines: GstLine[];
  taxable: number;
  tax: number;
  voided: boolean;
  voidedAt: Date | null;
  ecoGstin: string | null;
  irn: string | null;
  ewayBillNo: string | null;
  issues: GstIssueCode[];
};

export type GstIssueCode =
  | "STATE_ASSUMED"
  | "GSTIN_INVALID"
  | "GSTIN_STATE_MISMATCH"
  | "SAC_MISSING"
  | "TAX_MISMATCH"
  | "EXPORT_WITH_TAX"
  | "SEZ_NEEDS_GSTIN";

/** Pull the first run of 4+ digits out of a stored code (legacy rows sometimes hold JSON-encoded values). */
export function normalizeHsn(raw: string | null | undefined): string {
  if (!raw) return "";
  const match = /\d{4,8}/.exec(String(raw));
  return match ? match[0] : "";
}

export function hsnForTurnover(hsn: string, prevTurnover: number): string {
  if (!hsn) return "";
  const digits = prevTurnover > GST_RULES.hsn6DigitAbove ? 6 : 4;
  return hsn.length >= digits ? hsn.slice(0, digits) : hsn;
}

export function classifyInvoice(inv: InvoiceInput, supplierState: string | null): ClassifiedInvoice {
  const issues: GstIssueCode[] = [];
  const xr = inv.exchangeRate > 0 ? inv.exchangeRate : 1;
  const country = (inv.clientCountry ?? "IN").trim().toUpperCase();
  const foreign = country !== "" && country !== "IN" && country !== "INDIA";
  // A foreign customer's tax ID (EIN, VAT...) is not a GSTIN and must not be validated or reported as one.
  const gstinRaw = foreign ? "" : normalizeGstin(inv.recipientGstin);
  const gstinCheck = gstinRaw ? validateGstin(gstinRaw) : null;
  const registered = !!gstinCheck && gstinCheck.valid;
  if (gstinRaw && gstinCheck && !gstinCheck.valid) issues.push("GSTIN_INVALID");

  // Place of supply (services): explicit > recipient's registration > recipient address state > export > supplier state.
  let pos: string;
  if (inv.placeOfSupplyOverride) pos = inv.placeOfSupplyOverride;
  else if (foreign) pos = FOREIGN_POS;
  else if (registered && gstinCheck.valid) pos = gstinCheck.stateCode;
  else if (inv.clientStateCode) pos = inv.clientStateCode;
  else {
    pos = supplierState ?? "97";
    issues.push("STATE_ASSUMED");
  }
  if (registered && gstinCheck.valid && inv.clientStateCode && inv.clientStateCode !== gstinCheck.stateCode && !inv.placeOfSupplyOverride) {
    issues.push("GSTIN_STATE_MISMATCH");
  }

  const isExport = pos === FOREIGN_POS;
  const sezRequested = inv.supplyOverride === "SEZ_WP" || inv.supplyOverride === "SEZ_WOP";
  if (sezRequested && !registered) issues.push("SEZ_NEEDS_GSTIN");
  const isSez = sezRequested && registered && !isExport;
  // Supplies to a SEZ are always inter-state for GST, whatever the SEZ unit's state.
  const interState = (!!supplierState && pos !== supplierState) || isSez;

  // Build base lines in INR.
  const rawLines: InvoiceLineInput[] =
    inv.items.length > 0
      ? inv.items
      : [{ description: "", quantity: 1, amount: inv.subtotal, taxRate: inv.isExemptMode ? 0 : inv.taxRate, sacCode: inv.sacCode }];
  const computed = rawLines.map((l) => ({ ...l, taxable: r2(l.amount * xr), tax: r2(l.amount * xr * l.taxRate) }));
  const computedTax = computed.reduce((s, l) => s + l.tax, 0);
  const bookedTax = r2(inv.taxAmount * xr);
  if (Math.abs(computedTax - bookedTax) > 1) issues.push("TAX_MISMATCH");
  // The books are authoritative: scale line tax so the return always matches the invoice's stored tax.
  const scale = computedTax > 0 ? bookedTax / computedTax : 1;

  const lines: GstLine[] = computed.map((l) => {
    const sourceTax = computedTax > 0 ? r2(l.tax * scale) : 0;
    const hsn = normalizeHsn(l.sacCode ?? inv.sacCode);
    if (!hsn) issues.push("SAC_MISSING");
    const rate = l.taxable > 0 ? Math.round((sourceTax / l.taxable) * 10000) / 100 : Math.round(l.taxRate * 10000) / 100;
    const row: GstLine = {
      rate: snapRate(rate),
      hsn,
      description: l.description,
      quantity: l.quantity,
      taxable: l.taxable,
      igst: 0,
      cgst: 0,
      sgst: 0,
      cess: 0,
      nil: sourceTax === 0,
    };
    if (sourceTax > 0) {
      if (interState || isExport) row.igst = sourceTax;
      else {
        const split = splitIntra(sourceTax);
        row.cgst = split.cgst;
        row.sgst = split.sgst;
      }
    }
    return row;
  });

  const taxable = r2(lines.reduce((s, l) => s + l.taxable, 0));
  const tax = r2(lines.reduce((s, l) => s + l.igst + l.cgst + l.sgst + l.cess, 0));
  const value = r2(taxable + tax);

  let supplyType: SupplyType;
  if (isSez) {
    supplyType = inv.supplyOverride === "SEZ_WP" ? "SEZWP" : "SEZWOP";
  } else if (isExport) {
    supplyType = tax > 0 ? "EXPWP" : "EXPWOP";
    if (tax > 0) issues.push("EXPORT_WITH_TAX");
  } else if (registered) {
    supplyType = inv.reverseCharge ? "B2B_RCM" : "B2B";
  } else {
    supplyType = interState && value > GST_RULES.b2clThreshold ? "B2CL" : "B2CS";
  }

  return {
    id: inv.id,
    number: inv.number,
    date: inv.date,
    clientId: inv.clientId,
    clientName: inv.clientName,
    gstin: registered ? gstinRaw : null,
    supplyType,
    placeOfSupply: pos,
    interState: interState || isExport,
    value,
    lines,
    taxable,
    tax,
    voided: inv.voided,
    voidedAt: inv.voidedAt,
    ecoGstin: inv.ecoGstin ? normalizeGstin(inv.ecoGstin) : null,
    irn: inv.irn ?? null,
    ewayBillNo: inv.ewayBillNo ?? null,
    issues: Array.from(new Set(issues)),
  };
}

const STANDARD_RATES = [0, 0.1, 0.25, 0.5, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

/** Snap a derived rate to the nearest statutory rate when within rounding noise. */
export function snapRate(rate: number): number {
  const hit = STANDARD_RATES.find((r) => Math.abs(r - rate) < 0.15);
  return hit ?? Math.round(rate * 100) / 100;
}

export const isNilLine = (l: GstLine) => l.nil && l.igst + l.cgst + l.sgst + l.cess === 0;

export { num };
