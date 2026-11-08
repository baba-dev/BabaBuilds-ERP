import { z } from "zod";
import { r2, splitIntra } from "./money";
import { normalizeGstin, validateGstin } from "./gstin";
import { FOREIGN_POS, isStateCode } from "./states";

const money = z.number().finite().min(0).max(1e12);
const pos = z.string().refine((v) => v === FOREIGN_POS || isStateCode(v), "Unknown place of supply");
const rate = z.number().finite().min(0).max(100);
const gstinOpt = z
  .string()
  .trim()
  .max(20)
  .optional()
  .nullable()
  .transform((v) => (v ? normalizeGstin(v) : null))
  .refine((v) => v === null || validateGstin(v).valid, "That GSTIN is not valid");

export const debitNoteSchema = z.object({
  noteNumber: z.string().trim().min(1).max(40),
  issuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  invoiceNumber: z.string().trim().max(40).optional().nullable(),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable(),
  recipientName: z.string().trim().min(1).max(120),
  recipientGstin: gstinOpt,
  pos,
  rate,
  taxable: money.refine((v) => v > 0, "Enter the taxable value"),
  reason: z.string().trim().min(3).max(300),
});

export const amendmentSchema = z.object({
  periodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/),
  originalPeriodKey: z.string().regex(/^\d{4}-(0[1-9]|1[0-2]|Q[1-4])$/),
  originalNumber: z.string().trim().min(1).max(40),
  originalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  recipientName: z.string().trim().max(120).optional().nullable(),
  recipientGstin: gstinOpt,
  pos,
  rate,
  originalTaxable: money,
  revisedTaxable: money,
  reason: z.string().trim().min(3).max(300),
});

export const advanceSchema = z.object({
  receivedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  party: z.string().trim().min(1).max(120),
  recipientGstin: gstinOpt,
  pos,
  rate: rate.refine((v) => v > 0, "Choose the GST rate"),
  amount: money.refine((v) => v > 0, "Enter the amount received"),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const advanceAdjustSchema = z.object({ adjustedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), adjustedInvoice: z.string().trim().min(1).max(40) });

/** CGST+SGST within the supplier's state, IGST otherwise (and always for exports). */
export function splitTax(taxable: number, ratePercent: number, placeOfSupply: string, supplierState: string | null) {
  const tax = r2((taxable * ratePercent) / 100);
  const inter = placeOfSupply === FOREIGN_POS || (!!supplierState && placeOfSupply !== supplierState);
  if (inter) return { igst: tax, cgst: 0, sgst: 0 };
  const { cgst, sgst } = splitIntra(tax);
  return { igst: 0, cgst, sgst };
}

/** An advance is received GST-inclusive: taxable = amount x 100 / (100 + rate). */
export function splitAdvance(amount: number, ratePercent: number, placeOfSupply: string, supplierState: string | null) {
  const taxable = r2((amount * 100) / (100 + ratePercent));
  const tax = r2(amount - taxable);
  const inter = placeOfSupply === FOREIGN_POS || (!!supplierState && placeOfSupply !== supplierState);
  if (inter) return { taxable, igst: tax, cgst: 0, sgst: 0 };
  const { cgst, sgst } = splitIntra(tax);
  return { taxable, igst: 0, cgst, sgst };
}
