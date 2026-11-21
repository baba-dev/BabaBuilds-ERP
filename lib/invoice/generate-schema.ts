/** Request schema for POST /api/generate (kept out of the route file so it can be unit-tested). */
import { z } from "zod";
import { accentColorField } from "@/lib/invoice-templates/shared/accent-color";

export const ServiceSchema = z.object({
  title: z.string().trim().min(1, "Service title is required").max(200, "Service title is too long"),
  amount: z.coerce.number().finite().min(0, "Service amount must be 0 or greater"),
  // The invoice form sends `productId: null` for services and `sac` as a string for unmapped services
  // (or the SAC record object for mapped ones); the schema must accept what our own client posts.
  productId: z.string().nullish(),
  quantity: z.number().optional().default(1),
  unitPrice: z.coerce.number().optional(),
  sac: z
    .union([z.string(), z.number(), z.object({ igstRate: z.number().nullable().optional() }).passthrough()])
    .nullish(),
  taxRate: z.number().nullable().optional(),
  sacCode: z.string().trim().max(100).optional().nullable(),
});

/** GST treatment chosen on the composer; anything left out falls back to the customer's standing treatment. */
export const GstOverridesSchema = z.object({
  placeOfSupply: z.string().trim().max(2).nullish(),
  supplyOverride: z.enum(["SEZ_WP", "SEZ_WOP"]).nullish(),
  reverseCharge: z.boolean().nullish(),
});

export const GenerateInvoiceSchema = z.object({
  idempotencyKey: z.string().optional(),
  draftId: z.string().optional(),
  clientId: z.string().min(1, "Client is required"),
  billingMonth: z.string().trim().min(1, "Billing month is required").max(100),
  sacCode: z.string().trim().max(100).optional(),
  services: z.array(ServiceSchema).min(1, "At least one service is required"),
  customDate: z.string().optional().nullable(),
  sendEmail: z.boolean().optional(),
  status: z.string().optional(),
  taxRateOverride: z.number().optional(),
  /** ISO-4217 code; defaults to the workspace base currency. */
  currency: z.string().trim().toUpperCase().length(3).regex(/^[A-Z]{3}$/).optional(),
  /** Units of base currency per 1 unit of `currency`. Required when currency differs from the base currency. */
  exchangeRate: z.coerce.number().positive().finite().max(1_000_000).optional(),
  source: z.enum(['MANUAL', 'API']).optional(),
  gst: GstOverridesSchema.optional(),
  /** Per-invoice brand colour override (#RRGGBB); empty clears it. */
  accentColor: accentColorField,
  /** Billable expenses added to this invoice as lines; they are marked billed with the invoice. */
  billableExpenseIds: z.array(z.string().min(1)).max(50).optional(),
});
