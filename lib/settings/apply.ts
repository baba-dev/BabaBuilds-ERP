import { validateGstin } from "@/lib/gst/gstin";
import { validateUdyam } from "@/lib/msme/udyam";
import type { SettingsSectionKey } from "./schemas";

type Values = Record<string, unknown>;
type Existing = { gstRegistrationType?: string | null } & Record<string, unknown>;

/** Slug rules for the public shop: lower case letters, digits and dashes, at least 3 characters. */
export function normalizeShopSlug(raw: string | null | undefined): string | null {
  const s = (raw ?? "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return s.length >= 3 ? s : null;
}

/**
 * Columns a section writes, from values that already passed that section's schema. Pure: no database, so the rules
 * (what GSTIN implies, what clears to a default, what is never written as null) can be tested directly.
 */
export function buildSectionUpdate(section: SettingsSectionKey, v: Values, existing: Existing | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const set = (k: string, val: unknown) => { out[k] = val; };
  const has = (k: string) => v[k] !== undefined;
  switch (section) {
    case "business":
      for (const k of ["companyName", "proprietorName", "address", "email"]) if (has(k)) set(k, v[k]);
      if (has("phone")) set("phone", v.phone || null);
      if (has("website")) set("website", v.website || null);
      break;
    case "tax": {
      if (has("panNumber")) set("panNumber", v.panNumber ?? "");
      if (has("gstin")) {
        const gstin = (v.gstin as string | null) || null;
        set("gstin", gstin);
        if (gstin) {
          const check = validateGstin(gstin);
          // A valid GSTIN fixes the state, and a business with one is registered.
          if (check.valid) set("gstStateCode", check.stateCode);
          if (existing?.gstRegistrationType === "UNREGISTERED") set("gstRegistrationType", "REGULAR");
        }
      }
      if (has("udyamNumber")) set("udyamNumber", v.udyamNumber ? validateUdyam(String(v.udyamNumber)).value : null);
      if (has("defaultSacCode")) set("defaultSacCode", (v.defaultSacCode as string) || "998313");
      if (has("defaultTaxRatePercent")) set("defaultTaxRate", v.defaultTaxRatePercent === null || v.defaultTaxRatePercent === undefined ? null : Math.round((v.defaultTaxRatePercent as number) * 100) / 10000);
      if (typeof v.taxLabel === "string" && v.taxLabel) set("taxLabel", v.taxLabel);
      if (typeof v.taxIdLabel === "string" && v.taxIdLabel) set("taxIdLabel", v.taxIdLabel);
      break;
    }
    case "invoicing":
      set("invoiceTheme", v.invoiceTheme);
      if (has("invoiceAccentColor")) set("invoiceAccentColor", (v.invoiceAccentColor as string | null) ?? null);
      set("invoicePrefix", (v.invoicePrefix as string) || "INV");
      set("invoiceTermsDays", v.invoiceTermsDays);
      break;
    case "banking":
      for (const k of ["bankName", "accountName"]) if (has(k)) set(k, v[k]);
      if (has("ifscCode")) set("ifscCode", v.ifscCode ?? "");
      if (has("upiVpa")) set("upiVpa", (v.upiVpa as string | null) ?? null);
      if (has("upiPayeeName")) set("upiPayeeName", (v.upiPayeeName as string | null) ?? null);
      if (typeof v.routingLabel === "string" && v.routingLabel) set("routingLabel", v.routingLabel);
      break;
    case "email":
      if (has("smtpHost")) set("smtpHost", v.smtpHost || null);
      if (has("smtpPort")) set("smtpPort", v.smtpPort ?? null);
      if (has("smtpUser")) set("smtpUser", v.smtpUser || null);
      if (has("smtpFromEmail")) set("smtpFromEmail", v.smtpFromEmail || null);
      break;
    case "payments":
      if (has("razorpayKeyId")) set("razorpayKeyId", v.razorpayKeyId || null);
      if (has("stripePublishableKey")) set("stripePublishableKey", v.stripePublishableKey || null);
      if (v.defaultGateway) set("defaultGateway", v.defaultGateway);
      break;
    case "shop":
      set("shopEnabled", v.shopEnabled);
      set("shopSlug", normalizeShopSlug(v.shopSlug as string | null));
      set("shopTagline", v.shopTagline || null);
      set("shopAccentColor", ((v.shopAccentColor as string) || "#6366f1").toLowerCase());
      break;
    case "automation":
      set("gstRemindersEnabled", v.gstRemindersEnabled);
      break;
  }
  return out;
}

/** Names of the columns whose value actually changed, for the audit log. */
export function changedFields(before: Record<string, unknown> | null, update: Record<string, unknown>): string[] {
  return Object.keys(update).filter((k) => String(before?.[k] ?? "") !== String(update[k] ?? "")).sort();
}
