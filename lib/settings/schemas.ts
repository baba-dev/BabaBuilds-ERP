import { z } from "zod";
import { normalizeGstin, validateGstin } from "@/lib/gst/gstin";
import { validateUdyam } from "@/lib/msme/udyam";
import { isSupportedLocale } from "@/i18n/locales";

/**
 * Settings are saved one section at a time. Each section has its own schema, so a bad value in one place never blocks
 * another, and the server only ever touches the columns that section owns. Empty strings clear optional fields.
 */
export const SETTINGS_SECTIONS = ["business", "tax", "invoicing", "banking", "email", "payments", "shop", "automation"] as const;
export type SettingsSectionKey = (typeof SETTINGS_SECTIONS)[number];

const text = (max: number) => z.string().trim().max(max);
const optional = (max: number) => text(max).optional().nullable().transform((v) => (v ? v : null));
const required = (max: number) => text(max).min(1, "REQUIRED");

const PAN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const IFSC = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const HEX = /^#[0-9a-fA-F]{6}$/;

export const businessSchema = z.object({
  companyName: required(120),
  proprietorName: required(120),
  address: required(400),
  email: required(200).pipe(z.string().email("EMAIL")),
  phone: optional(30),
  website: optional(200).refine((v) => !v || /^https?:\/\/[^\s]+\.[^\s]+$/i.test(v), "URL"),
  locale: z.string().refine(isSupportedLocale, "LOCALE").optional(),
});

export const taxSchema = z
  .object({
    panNumber: text(20).transform((v) => v.toUpperCase()),
    gstin: optional(20).transform((v) => (v ? normalizeGstin(v) : null)),
    udyamNumber: optional(30),
    defaultSacCode: text(10).transform((v) => v.replace(/\D/g, "")).refine((v) => v === "" || (v.length >= 4 && v.length <= 8), "SAC"),
    /** Percent, 0-100. */
    defaultTaxRatePercent: z.number().finite().min(0).max(100).optional().nullable(),
    taxLabel: optional(20),
    taxIdLabel: optional(20),
  })
  .superRefine((v, ctx) => {
    if (v.gstin && !validateGstin(v.gstin).valid) ctx.addIssue({ code: "custom", path: ["gstin"], message: "GSTIN" });
    if (v.udyamNumber && !validateUdyam(v.udyamNumber).valid) ctx.addIssue({ code: "custom", path: ["udyamNumber"], message: "UDYAM" });
  });

export const invoicingSchema = z.object({
  invoiceTheme: z.enum(["DESIGN_1", "DESIGN_2"]),
  invoicePrefix: text(10).transform((v) => v.toUpperCase()).refine((v) => v === "" || /^[A-Z0-9][A-Z0-9/_-]{0,9}$/.test(v), "PREFIX"),
  invoiceTermsDays: z.number().int().min(0).max(365),
});

export const bankingSchema = z.object({
  bankName: required(120),
  accountName: required(120),
  /** Only sent when the user typed a new number; the masked value is never posted back. */
  accountNumber: optional(34).refine((v) => !v || /^[0-9A-Za-z -]{5,34}$/.test(v), "ACCOUNT"),
  ifscCode: text(20).transform((v) => v.toUpperCase()),
  routingLabel: optional(30),
});

export const emailSchema = z.object({
  smtpHost: optional(200),
  smtpPort: z.number().int().min(1).max(65535).optional().nullable(),
  smtpUser: optional(200),
  smtpFromEmail: optional(200).refine((v) => !v || z.string().email().safeParse(v).success, "EMAIL"),
});

export const paymentsSchema = z.object({
  razorpayKeyId: optional(80),
  stripePublishableKey: optional(160),
  defaultGateway: z.enum(["RAZORPAY", "STRIPE"]).optional(),
});

export const shopSchema = z.object({
  shopEnabled: z.boolean(),
  shopSlug: optional(40),
  shopTagline: optional(160),
  shopAccentColor: text(7).refine((v) => HEX.test(v), "COLOR"),
});

export const automationSchema = z.object({
  gstRemindersEnabled: z.boolean(),
});

export const SECTION_SCHEMAS = {
  business: businessSchema,
  tax: taxSchema,
  invoicing: invoicingSchema,
  banking: bankingSchema,
  email: emailSchema,
  payments: paymentsSchema,
  shop: shopSchema,
  automation: automationSchema,
} as const;

export const patchSchema = z.object({
  section: z.enum(SETTINGS_SECTIONS),
  values: z.record(z.string(), z.unknown()),
});

export const SECRET_KEYS = ["smtpPassword", "groqApiKey", "razorpayKeySecret", "stripeSecretKey"] as const;
export type SecretKey = (typeof SECRET_KEYS)[number];
export const secretSchema = z.object({
  key: z.enum(SECRET_KEYS),
  /** null clears the secret. */
  value: z.string().min(1).max(500).nullable(),
});

/** PAN and IFSC are country-specific, so they are checked only for Indian workspaces. */
export function validateRegional(section: SettingsSectionKey, values: Record<string, unknown>, countryCode: string): Array<{ field: string; code: string }> {
  if (countryCode.toUpperCase() !== "IN") return [];
  const errors: Array<{ field: string; code: string }> = [];
  if (section === "tax") {
    const pan = typeof values.panNumber === "string" ? values.panNumber.trim().toUpperCase() : "";
    if (pan && !PAN.test(pan)) errors.push({ field: "panNumber", code: "PAN" });
  }
  if (section === "banking") {
    const ifsc = typeof values.ifscCode === "string" ? values.ifscCode.trim().toUpperCase() : "";
    if (ifsc && !IFSC.test(ifsc)) errors.push({ field: "ifscCode", code: "IFSC" });
  }
  return errors;
}

export function zodFieldErrors(error: z.ZodError): Array<{ field: string; code: string }> {
  return error.issues.map((i) => ({ field: String(i.path[0] ?? "form"), code: i.message }));
}
