import { z } from "zod";
import { r2, splitIntra } from "./money";
import { normalizeGstin, validateGstin } from "./gstin";
import { isStateCode } from "./states";

export const ITC_STATUSES = ["NONE", "ELIGIBLE", "INELIGIBLE", "REVERSE_CHARGE"] as const;
export type ItcStatus = (typeof ITC_STATUSES)[number];

/** Rates offered on the form (the 2025 two-rate structure plus legacy slabs still seen on older bills). */
export const GST_RATE_OPTIONS = [0, 5, 18, 40, 12, 28] as const;

export const expenseGstSchema = z.object({
  itcStatus: z.enum(ITC_STATUSES).default("NONE"),
  vendorGstin: z.string().trim().max(20).optional().nullable(),
  vendorInvoiceNo: z.string().trim().max(60).optional().nullable(),
  vendorStateCode: z.string().trim().max(2).optional().nullable(),
  hsnCode: z.string().trim().max(10).optional().nullable(),
  gstRate: z.number().finite().min(0).max(100).optional().nullable(),
  /** UNPAID bills lose their credit after 180 days (rule 37) until they are paid. */
  paymentStatus: z.enum(["PAID", "UNPAID"]).default("PAID"),
});
export type ExpenseGstFields = z.infer<typeof expenseGstSchema>;

export type ExpenseGstResult = {
  taxable: number;
  igst: number;
  cgst: number;
  sgst: number;
  cess: number;
  total: number;
  interState: boolean;
};

/**
 * GST on a purchase bill.
 * - ELIGIBLE / INELIGIBLE: `amount` is what was paid including GST, so tax = amount x rate / (100 + rate).
 * - REVERSE_CHARGE: `amount` is the value of the supply; tax is added on top and paid by you directly.
 * Intra-state vs inter-state follows the supplier's state against yours.
 */
export function computeExpenseGst(args: { amount: number; rate: number | null | undefined; itcStatus: ItcStatus; supplierState: string | null; vendorState: string | null }): ExpenseGstResult {
  const rate = Math.max(0, args.rate ?? 0);
  const amount = Math.max(0, args.amount);
  const empty = { taxable: amount, igst: 0, cgst: 0, sgst: 0, cess: 0, total: amount, interState: false };
  if (args.itcStatus === "NONE" || rate === 0) return empty;
  const reverse = args.itcStatus === "REVERSE_CHARGE";
  const tax = reverse ? r2((amount * rate) / 100) : r2((amount * rate) / (100 + rate));
  const taxable = reverse ? amount : r2(amount - tax);
  const interState = !!args.supplierState && !!args.vendorState && args.supplierState !== args.vendorState;
  if (interState) return { taxable, igst: tax, cgst: 0, sgst: 0, cess: 0, total: r2(taxable + tax), interState };
  const { cgst, sgst } = splitIntra(tax);
  return { taxable, igst: 0, cgst, sgst, cess: 0, total: r2(taxable + tax), interState };
}

/** The vendor's state: from a valid GSTIN, else a chosen valid code, else null. */
export function vendorStateOf(gstin: string | null | undefined, chosen: string | null | undefined): string | null {
  const check = validateGstin(gstin);
  if (check.valid) return check.stateCode;
  return chosen && isStateCode(chosen) ? chosen : null;
}

export type NormalizedExpenseGst =
  | { ok: true; data: { itcStatus: ItcStatus; vendorGstin: string | null; vendorInvoiceNo: string | null; vendorStateCode: string | null; hsnCode: string | null; gstRate: number | null; paymentStatus: "PAID" | "UNPAID"; igstAmount: number; cgstAmount: number; sgstAmount: number; cessAmount: number } }
  | { ok: false; code: string; message: string };

/** Validate the GST block of an expense and compute its tax split. Tax amounts are never taken from the client. */
export function normalizeExpenseGst(fields: ExpenseGstFields | undefined, amount: number, supplierState: string | null): NormalizedExpenseGst {
  const f = fields ?? { itcStatus: "NONE" as const, paymentStatus: "PAID" as const };
  const gstin = normalizeGstin(f.vendorGstin) || null;
  if (gstin && !validateGstin(gstin).valid) return { ok: false, code: "VENDOR_GSTIN_INVALID", message: "The vendor GSTIN is not valid." };
  if (f.itcStatus === "NONE") {
    return { ok: true, data: { itcStatus: "NONE", vendorGstin: gstin, vendorInvoiceNo: f.vendorInvoiceNo || null, vendorStateCode: vendorStateOf(gstin, f.vendorStateCode), hsnCode: f.hsnCode || null, gstRate: null, paymentStatus: "PAID", igstAmount: 0, cgstAmount: 0, sgstAmount: 0, cessAmount: 0 } };
  }
  if (f.gstRate === null || f.gstRate === undefined) return { ok: false, code: "GST_RATE_REQUIRED", message: "Choose the GST rate on this bill." };
  const vendorState = vendorStateOf(gstin, f.vendorStateCode);
  const calc = computeExpenseGst({ amount, rate: f.gstRate, itcStatus: f.itcStatus, supplierState, vendorState });
  return {
    ok: true,
    data: {
      itcStatus: f.itcStatus,
      vendorGstin: gstin,
      vendorInvoiceNo: f.vendorInvoiceNo || null,
      vendorStateCode: vendorState,
      hsnCode: f.hsnCode?.replace(/\D/g, "").slice(0, 8) || null,
      gstRate: f.gstRate,
      paymentStatus: f.paymentStatus ?? "PAID",
      igstAmount: calc.igst,
      cgstAmount: calc.cgst,
      sgstAmount: calc.sgst,
      cessAmount: calc.cess,
    },
  };
}
