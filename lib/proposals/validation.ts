import { z } from "zod";

const text = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((v) => {
      const trimmed = typeof v === "string" ? v.trim() : "";
      return trimmed.length > 0 ? trimmed : null;
    });

const isoDate = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(Date.parse(v)), "Enter a valid date.");

/** Only http(s) links or app-relative paths may be embedded in a proposal. */
const safeUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https?:\/\//i.test(v) || v.startsWith("/"), "Use a link that starts with https:// or /");

export const proposalItemSchema = z.object({
  serviceTemplateId: z.string().trim().max(64).nullish().transform((v) => (v ? v : null)),
  title: text(200).min(1, "Every line needs a title."),
  description: optionalText(1000),
  quantity: z.coerce.number({ message: "Enter a quantity." }).int("Quantity must be a whole number.").min(1, "Quantity must be at least 1.").max(100_000),
  unitPrice: z.coerce.number({ message: "Enter a price." }).finite().min(0, "Price cannot be negative.").max(1_000_000_000),
  isOptional: z.boolean().optional().default(false),
  isRecurring: z.boolean().optional().default(false),
});

export const proposalSectionSchema = z.object({
  title: text(200).min(1),
  body: z.string().max(10_000).optional().default(""),
  mediaUrl: z.union([safeUrl, z.literal("")]).nullish().transform((v) => v ?? ""),
});

export const proposalMediaSchema = z.object({
  type: z.enum(["image", "video"]),
  url: safeUrl,
  title: z.string().trim().max(200).optional().default(""),
});

export const proposalMilestoneSchema = z.object({
  title: text(200).min(1, "Every milestone needs a title."),
  description: optionalText(500),
  amount: z.coerce.number().finite().min(0).max(1_000_000_000),
  dueDate: isoDate.nullish().transform((v) => v || null),
});

export const proposalInputSchema = z.object({
  clientId: text(64).min(1, "Choose a client."),
  title: text(200).min(1, "Give the proposal a title."),
  validUntil: isoDate,
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code.").optional(),
  exchangeRate: z.coerce.number().positive().finite().max(1_000_000).optional(),
  items: z.array(proposalItemSchema).min(1, "Add at least one line.").max(100),
  richSections: z.array(proposalSectionSchema).max(30).optional().default([]),
  richMedia: z.array(proposalMediaSchema).max(20).optional().default([]),
  milestones: z.array(proposalMilestoneSchema).max(24).optional().default([]),
  taxRateOverride: z.coerce.number().min(0).max(100).optional(),
});

export type ProposalInput = z.infer<typeof proposalInputSchema>;

export const previewInputSchema = proposalInputSchema.pick({ clientId: true, items: true, taxRateOverride: true });

export const statusChangeSchema = z.object({
  status: z.enum(["DRAFT", "DECLINED", "ACCEPTED"]),
  note: z.string().trim().max(500).optional(),
});

export const convertInputSchema = z.object({
  billingMonth: z.string().trim().max(60).optional(),
  invoiceDate: isoDate.optional(),
  createRetainer: z.boolean().optional().default(false),
});
