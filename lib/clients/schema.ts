import { parseClientGstInput } from "@/lib/gst/client-state";
import { countryName, isForeignTo, matchCountry } from "./country";
import { serializeTags } from "./tags";

export const CLIENT_STATUSES = ["ACTIVE", "VIP", "INACTIVE"] as const;
export type ClientStatus = (typeof CLIENT_STATUSES)[number];

export type FieldIssue = { field: string; code: string };

export type ClientColumns = {
  name: string; address: string; country: string; countryCode: string | null; taxId: string | null;
  gstStateCode: string | null; gstSupplyOverride: "SEZ_WP" | "SEZ_WOP" | null; gstReverseCharge: boolean;
  email: string | null; phone: string | null; website: string | null; industry: string | null; currency: string | null;
  paymentTermsDays: number | null; creditLimit: number | null; tags: string; status: ClientStatus; ownerUserId: string | null; isExport: boolean;
};

export type NormalizeResult =
  | { ok: true; data: Partial<ClientColumns> }
  | { ok: false; fields: FieldIssue[]; suggestion?: { field: "country"; code: string; name: string } };

type Raw = Record<string, unknown>;
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : v === null || v === undefined ? undefined : String(v));
const has = (raw: Raw, k: string) => raw[k] !== undefined;
const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const bool = (v: unknown): boolean | undefined => (v === true || v === "true" ? true : v === false || v === "false" ? false : undefined);

const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]{2,}$/;

export function normalizePhone(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  if (!/^[+(\d][\d\s().-]*$/.test(t)) return null;
  const digits = t.replace(/\D/g, "");
  if (digits.length < 6 || digits.length > 15) return null;
  return t.replace(/[\s().-]+/g, " ").trim();
}

export function normalizeWebsite(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(withScheme);
    return u.hostname.includes(".") ? u.toString().replace(/\/$/, "") : null;
  } catch { return null; }
}

/**
 * The one place client input is cleaned and checked, for the form, the import, the AI assistant and the API.
 * `partial` (an edit) only touches the fields that were sent. Empty optional values clear the field.
 */
export function normalizeClientInput(raw: Raw, opts: { workspaceCountry: string; partial?: boolean; walkIn?: boolean; existing?: { countryCode: string | null; country: string; taxId: string | null; isExport: boolean } | null }): NormalizeResult {
  const issues: FieldIssue[] = [];
  const out: Partial<ClientColumns> = {};
  const partial = !!opts.partial;
  const need = (k: string) => !partial && !opts.walkIn && !has(raw, k);

  if (has(raw, "name") || need("name")) {
    const name = collapse(str(raw.name) ?? "");
    if (!name) issues.push({ field: "name", code: "REQUIRED" });
    else if (name.length > 120) issues.push({ field: "name", code: "TOO_LONG" });
    else out.name = name;
  }
  if (has(raw, "address") || need("address")) {
    const address = collapse(str(raw.address) ?? "");
    if (!address && !opts.walkIn) issues.push({ field: "address", code: "REQUIRED" });
    else if (address.length > 300) issues.push({ field: "address", code: "TOO_LONG" });
    else out.address = address;
  }

  let countryCode: string | null | undefined = undefined;
  let suggestion: { field: "country"; code: string; name: string } | undefined;
  if (has(raw, "country") || need("country")) {
    const text = str(raw.country) ?? "";
    if (!text.trim()) { if (!opts.walkIn) issues.push({ field: "country", code: "REQUIRED" }); }
    else {
      const m = matchCountry(text);
      if (!m) issues.push({ field: "country", code: "COUNTRY_UNKNOWN" });
      else if (!m.exact) { issues.push({ field: "country", code: "COUNTRY_UNSURE" }); suggestion = { field: "country", code: m.code, name: countryName(m.code) }; }
      else { countryCode = m.code; out.country = countryName(m.code); out.countryCode = m.code; }
    }
  } else if (opts.existing) countryCode = opts.existing.countryCode;

  const effectiveCode = countryCode ?? opts.existing?.countryCode ?? null;
  const domesticIndia = effectiveCode === "IN";

  const taxSent = has(raw, "taxId");
  const taxId = taxSent ? collapse(str(raw.taxId) ?? "").toUpperCase() : (opts.existing?.taxId ?? "");
  if (taxSent) {
    if (taxId.length > 40) issues.push({ field: "taxId", code: "TOO_LONG" });
    else out.taxId = taxId || null;
  }
  // GST treatment is derived from the (now reliable) country code and the tax id.
  if (has(raw, "gstStateCode") || has(raw, "gstSupplyOverride") || has(raw, "gstReverseCharge") || taxSent || has(raw, "country") || (!partial && domesticIndia)) {
    const gst = parseClientGstInput({ country: effectiveCode ?? "", taxId, state: str(raw.gstStateCode) ?? "", supplyOverride: str(raw.gstSupplyOverride) ?? "", reverseCharge: raw.gstReverseCharge === true ? "true" : str(raw.gstReverseCharge) ?? "" });
    if (!gst.ok) issues.push({ field: gst.code === "SEZ_NEEDS_GSTIN" ? "gstSupplyOverride" : "taxId", code: gst.code });
    else { out.gstStateCode = gst.data.gstStateCode; out.gstSupplyOverride = gst.data.gstSupplyOverride; out.gstReverseCharge = gst.data.gstReverseCharge; }
  }

  if (has(raw, "email")) {
    const e = (str(raw.email) ?? "").trim().toLowerCase();
    if (!e) out.email = null; else if (!EMAIL.test(e) || e.length > 200) issues.push({ field: "email", code: "EMAIL" }); else out.email = e;
  }
  if (has(raw, "phone")) {
    const p = str(raw.phone) ?? "";
    if (!p.trim()) out.phone = null; else { const n = normalizePhone(p); if (!n) issues.push({ field: "phone", code: "PHONE" }); else out.phone = n; }
  }
  if (has(raw, "website")) {
    const w = str(raw.website) ?? "";
    if (!w.trim()) out.website = null; else { const n = normalizeWebsite(w); if (!n) issues.push({ field: "website", code: "URL" }); else out.website = n; }
  }
  if (has(raw, "industry")) { const i = collapse(str(raw.industry) ?? ""); if (i.length > 60) issues.push({ field: "industry", code: "TOO_LONG" }); else out.industry = i || null; }
  if (has(raw, "currency")) {
    const c = (str(raw.currency) ?? "").trim().toUpperCase();
    if (!c) out.currency = null; else if (!/^[A-Z]{3}$/.test(c)) issues.push({ field: "currency", code: "CURRENCY" }); else out.currency = c;
  }
  if (has(raw, "paymentTermsDays")) {
    const t = str(raw.paymentTermsDays)?.trim() ?? "";
    if (t === "") out.paymentTermsDays = null; else { const n = Number(t); if (!Number.isInteger(n) || n < 0 || n > 365) issues.push({ field: "paymentTermsDays", code: "TERMS" }); else out.paymentTermsDays = n; }
  }
  if (has(raw, "creditLimit")) {
    const c = str(raw.creditLimit)?.trim() ?? "";
    if (c === "") out.creditLimit = null; else { const n = Number(c); if (!Number.isFinite(n) || n < 0 || n > 1e12) issues.push({ field: "creditLimit", code: "CREDIT" }); else out.creditLimit = n === 0 ? null : n; }
  }
  if (has(raw, "tags")) {
    const list = Array.isArray(raw.tags) ? (raw.tags as unknown[]).map(String) : (str(raw.tags) ?? "").split(/[|,]/);
    out.tags = serializeTags(list);
  }
  if (has(raw, "status")) {
    const s = (str(raw.status) ?? "").toUpperCase();
    if (!(CLIENT_STATUSES as readonly string[]).includes(s)) issues.push({ field: "status", code: "STATUS" }); else out.status = s as ClientStatus;
  }
  if (has(raw, "ownerUserId")) out.ownerUserId = (str(raw.ownerUserId) ?? "").trim() || null;

  // Tax treatment: explicit choice wins; otherwise a foreign country means export and a domestic one does not.
  const explicit = bool(raw.isExport ?? raw.taxExempt);
  if (explicit !== undefined) out.isExport = explicit;
  else if (has(raw, "country") && countryCode !== undefined && countryCode !== null) out.isExport = isForeignTo(opts.workspaceCountry, countryCode);

  if (issues.length) return { ok: false, fields: issues, ...(suggestion ? { suggestion } : {}) };
  return { ok: true, data: out };
}

/** Which columns actually differ, for the audit trail. */
export function diffClient(before: Record<string, unknown>, patch: Record<string, unknown>): string[] {
  return Object.keys(patch).filter((k) => String(before[k] ?? "") !== String(patch[k] ?? "")).sort();
}
