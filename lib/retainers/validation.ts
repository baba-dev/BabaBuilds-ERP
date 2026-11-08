import { z } from "zod";
import { FREQUENCIES } from "@/lib/retainers/status";

const isoDate = z.string().trim().refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date.");
const optionalText = (max: number) =>
  z.string().max(max).nullish().transform((v) => (typeof v === "string" && v.trim() ? v.trim() : null));

export const retainerItemSchema = z.object({
  serviceTemplateId: z.string().trim().max(64).nullish().transform((v) => (v ? v : null)),
  title: z.string().trim().min(1, "Every line needs a title.").max(200),
  quantity: z.coerce.number({ message: "Enter a quantity." }).int("Quantity must be a whole number.").min(1).max(100_000),
  unitPrice: z.coerce.number({ message: "Enter a price." }).finite().min(0, "Price cannot be negative.").max(1_000_000_000),
  /** Percentage (18). Omit to use the service's tax code or the workspace default. */
  taxRate: z.coerce.number().min(0).max(100).nullish().transform((v) => (v === null || v === undefined ? null : v)),
});

export const retainerInputSchema = z.object({
  clientId: z.string().trim().min(1, "Choose a client.").max(64),
  name: z.string().trim().min(1, "Give the retainer a name.").max(200),
  notes: optionalText(2000),
  frequency: z.enum(FREQUENCIES).default("MONTHLY"),
  nextBillingDate: isoDate,
  endDate: isoDate.nullish().transform((v) => v || null),
  maxCycles: z.coerce.number().int().min(1).max(1200).nullish().transform((v) => v ?? null),
  autoAppendMonth: z.boolean().default(true),
  emailInvoice: z.boolean().default(true),
  paymentTermsDays: z.coerce.number().int().min(0).max(365).default(7),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).optional(),
  exchangeRate: z.coerce.number().positive().finite().max(1_000_000).optional(),
  items: z.array(retainerItemSchema).min(1, "Add at least one line.").max(50),
  taxRateOverride: z.coerce.number().min(0).max(100).optional(),
});
export type RetainerInput = z.infer<typeof retainerInputSchema>;

export const previewInputSchema = retainerInputSchema.pick({ clientId: true, items: true, taxRateOverride: true, frequency: true });

export const statusChangeSchema = z.object({ status: z.enum(["ACTIVE", "PAUSED", "CANCELLED"]), reason: z.string().trim().max(500).optional() });

export const usageInputSchema = z.object({
  description: z.string().trim().min(1, "Describe the usage.").max(200),
  quantity: z.coerce.number().positive().max(1_000_000),
  unitPrice: z.coerce.number().min(0).max(1_000_000_000),
});

export const billNowSchema = z.object({}).passthrough();
