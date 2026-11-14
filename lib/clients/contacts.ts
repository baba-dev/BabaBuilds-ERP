import { z } from "zod";
import { normalizePhone } from "./schema";

const optional = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const contactSchema = z.object({
  name: z.string().trim().min(1, "REQUIRED").max(120, "TOO_LONG"),
  role: optional(80),
  email: z.string().trim().toLowerCase().max(200).optional().nullable().transform((v) => (v ? v : null)).refine((v) => !v || /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/.test(v), "EMAIL"),
  phone: z.string().trim().optional().nullable().transform((v) => (v ? v : null)).refine((v) => !v || normalizePhone(v) !== null, "PHONE").transform((v) => (v ? normalizePhone(v) : null)),
  isPrimary: z.boolean().optional().default(false),
  receivesInvoices: z.boolean().optional().default(true),
  receivesReminders: z.boolean().optional().default(true),
});

export const contactPatchSchema = contactSchema.partial();
