import { classifyInvoice, normalizeHsn, type GstIssueCode, type InvoiceInput, type SupplyType } from "./classify";
import { validateGstin, normalizeGstin } from "./gstin";
import { FOREIGN_POS, isStateCode } from "./states";
import { r2 } from "./money";

/**
 * GST at the source: everything a form needs to show the tax treatment of a sale while it is being typed,
 * and to carry the customer's standing treatment (SEZ, reverse charge) onto the invoices created from it.
 * Pure functions only, so composers, API routes, retainers and POS all reach the same answer.
 */

// ── Tax codes ───────────────────────────────────────────────────────────────────────────────────────────────────

export type TaxCodeCheck =
  | { valid: true; kind: "HSN" | "SAC"; code: string }
  | { valid: false; kind: null; code: string; reason: "EMPTY" | "NOT_DIGITS" | "LENGTH" | "SAC_LENGTH" };

/** HSN is 4, 6 or 8 digits. A SAC starts with 99 and is 4 (heading) or 6 digits. */
export function validateTaxCode(raw: string | number | null | undefined): TaxCodeCheck {
  const code = String(raw ?? "").replace(/\s+/g, "");
  if (!code) return { valid: false, kind: null, code, reason: "EMPTY" };
  if (!/^\d+$/.test(code)) return { valid: false, kind: null, code, reason: "NOT_DIGITS" };
  if (code.startsWith("99")) {
    if (code.length !== 4 && code.length !== 6) return { valid: false, kind: null, code, reason: "SAC_LENGTH" };
    return { valid: true, kind: "SAC", code };
  }
  if (![4, 6, 8].includes(code.length)) return { valid: false, kind: null, code, reason: "LENGTH" };
  return { valid: true, kind: "HSN", code };
}

// ── Rates ───────────────────────────────────────────────────────────────────────────────────────────────────────

/** Rates in force since the 22 Sep 2025 restructuring (plus the special low rates on precious goods). */
export const CURRENT_GST_RATES = [0, 0.25, 1, 1.5, 3, 5, 18, 40] as const;
/** Slabs the 56th GST Council meeting removed; a catalogue entry still on one of these is probably stale. */
export const LEGACY_GST_RATES = [12, 28] as const;

export type RateStatus = "OK" | "LEGACY" | "UNUSUAL";

export function rateStatus(rate: number | null | undefined): RateStatus {
  if (rate === null || rate === undefined || !Number.isFinite(rate)) return "UNUSUAL";
  if ((LEGACY_GST_RATES as readonly number[]).includes(rate)) return "LEGACY";
  if ((CURRENT_GST_RATES as readonly number[]).includes(rate)) return "OK";
  return "UNUSUAL";
}

export type CatalogCodeStatus = { code: string; check: TaxCodeCheck; rate: number | null; rateStatus: RateStatus | null };

/** What the service catalogue shows beside a SAC/HSN and its stored rate. */
export function catalogCodeStatus(code: string | null | undefined, rate: number | null | undefined): CatalogCodeStatus {
  const check = validateTaxCode(code);
  return { code: check.code, check, rate: rate ?? null, rateStatus: rate === null || rate === undefined ? null : rateStatus(rate) };
}

// ── Treatment carried from the customer ─────────────────────────────────────────────────────────────────────────

export type SupplyOverride = "SEZ_WP" | "SEZ_WOP";
export const isSupplyOverride = (v: unknown): v is SupplyOverride => v === "SEZ_WP" || v === "SEZ_WOP";

export type ClientGstDefaults = { gstSupplyOverride?: string | null; gstReverseCharge?: boolean | null };
export type InvoiceGstOverrides = { placeOfSupply?: string | null; supplyOverride?: string | null; reverseCharge?: boolean | null };

/** Invoice-level choice wins; otherwise the customer's standing treatment applies. */
export function resolveTreatment(client: ClientGstDefaults | null | undefined, overrides?: InvoiceGstOverrides | null) {
  const pos = overrides?.placeOfSupply && (overrides.placeOfSupply === FOREIGN_POS || isStateCode(overrides.placeOfSupply)) ? overrides.placeOfSupply : null;
  const supply = overrides?.supplyOverride !== undefined && overrides?.supplyOverride !== null ? overrides.supplyOverride : client?.gstSupplyOverride;
  const reverse = overrides?.reverseCharge !== undefined && overrides?.reverseCharge !== null ? overrides.reverseCharge : client?.gstReverseCharge;
  return { placeOfSupply: pos, supplyOverride: isSupplyOverride(supply) ? supply : null, reverseCharge: !!reverse };
}

/** Columns to write on a new Invoice so the treatment is frozen at the time of sale. Empty object when nothing applies. */
export function snapshotGstFields(client: ClientGstDefaults | null | undefined, overrides?: InvoiceGstOverrides | null) {
  const t = resolveTreatment(client, overrides);
  return {
    ...(t.placeOfSupply ? { gstPlaceOfSupply: t.placeOfSupply } : {}),
    ...(t.supplyOverride ? { gstSupplyOverride: t.supplyOverride } : {}),
    ...(t.reverseCharge ? { gstReverseCharge: true } : {}),
  };
}

/**
 * Over-the-counter sales: the buyer is not asked for an address, so the supply is treated as made where the goods
 * are handed over (the supplier's state, intra-state B2C). Returns that state for a domestic buyer with no state
 * or GSTIN on file, otherwise null (the buyer's own details decide).
 */
export function counterSalePlace(client: { country?: string | null; gstStateCode?: string | null; taxId?: string | null }, supplierState: string | null): string | null {
  if (!supplierState) return null;
  const country = (client.country ?? "").trim().toUpperCase();
  if (country !== "" && country !== "IN" && country !== "INDIA") return null;
  if (client.gstStateCode || validateGstin(client.taxId).valid) return null;
  return supplierState;
}

// ── Live preview ────────────────────────────────────────────────────────────────────────────────────────────────

export type SourceLine = {
  description?: string;
  /** Pre-tax line amount, in the invoice currency. */
  amount: number;
  quantity?: number;
  /** Rate in percent. Null = not decided: the line takes `defaultRate`. */
  ratePercent: number | null;
  sacCode: string | null;
  goods?: boolean;
};

export type SourceParty = {
  country: string | null;
  gstin: string | null;
  stateCode: string | null;
  taxExempt?: boolean;
} & ClientGstDefaults;

export type PreviewWarningCode =
  | "SUPPLIER_STATE_MISSING"
  | "CLIENT_STATE_MISSING"
  | "GSTIN_INVALID"
  | "GSTIN_STATE_MISMATCH"
  | "SAC_MISSING"
  | "SAC_INVALID"
  | "LEGACY_RATE"
  | "EXPORT"
  | "EXPORT_WITH_TAX"
  | "SEZ"
  | "SEZ_NEEDS_GSTIN"
  | "REVERSE_CHARGE"
  | "TAX_EXEMPT_CLIENT";

export type PreviewWarning = { code: PreviewWarningCode; severity: "info" | "warn"; line?: number };

export type GstPreview = {
  applicable: boolean;
  supplyType: SupplyType;
  placeOfSupply: string;
  interState: boolean;
  taxable: number;
  tax: number;
  total: number;
  split: { cgst: number; sgst: number; igst: number };
  lines: Array<{ rate: number; taxable: number; tax: number }>;
  warnings: PreviewWarning[];
};

export type PreviewInput = {
  supplierState: string | null;
  /** False when the business is unregistered or outside India: the preview then only reports "not applicable". */
  applicable: boolean;
  party: SourceParty;
  lines: SourceLine[];
  /** Used for lines with no rate of their own (percent). */
  defaultRate: number;
  overrides?: InvoiceGstOverrides | null;
  exchangeRate?: number;
  date?: Date;
};

const ISSUE_TO_WARNING: Partial<Record<GstIssueCode, PreviewWarningCode>> = {
  STATE_ASSUMED: "CLIENT_STATE_MISSING",
  GSTIN_INVALID: "GSTIN_INVALID",
  GSTIN_STATE_MISMATCH: "GSTIN_STATE_MISMATCH",
  EXPORT_WITH_TAX: "EXPORT_WITH_TAX",
  SEZ_NEEDS_GSTIN: "SEZ_NEEDS_GSTIN",
};

export function previewGst(input: PreviewInput): GstPreview {
  const empty: GstPreview = { applicable: false, supplyType: "B2CS", placeOfSupply: input.supplierState ?? "", interState: false, taxable: 0, tax: 0, total: 0, split: { cgst: 0, sgst: 0, igst: 0 }, lines: [], warnings: [] };
  if (!input.applicable) return empty;

  const t = resolveTreatment(input.party, input.overrides);
  const warnings: PreviewWarning[] = [];
  const exempt = !!input.party.taxExempt;
  if (!input.supplierState) warnings.push({ code: "SUPPLIER_STATE_MISSING", severity: "warn" });

  const items = input.lines.map((l) => {
    const percent = exempt ? 0 : l.ratePercent ?? input.defaultRate;
    return { description: l.description ?? "", quantity: l.quantity ?? 1, amount: Math.max(0, l.amount), taxRate: percent / 100, sacCode: l.sacCode, goods: l.goods, percent };
  });
  const subtotal = r2(items.reduce((s, l) => s + l.amount, 0));
  const taxAmount = r2(items.reduce((s, l) => s + l.amount * l.taxRate, 0));

  items.forEach((l, i) => {
    const raw = l.sacCode ?? "";
    if (!normalizeHsn(raw) && !raw.trim()) warnings.push({ code: "SAC_MISSING", severity: "warn", line: i });
    else if (!validateTaxCode(raw).valid) warnings.push({ code: "SAC_INVALID", severity: "warn", line: i });
    if (rateStatus(l.percent) === "LEGACY") warnings.push({ code: "LEGACY_RATE", severity: "warn", line: i });
  });

  const inv: InvoiceInput = {
    id: "preview",
    number: "preview",
    date: input.date ?? new Date(),
    voided: false,
    voidedAt: null,
    exchangeRate: input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : 1,
    subtotal,
    taxAmount,
    total: r2(subtotal + taxAmount),
    taxRate: items[0]?.taxRate ?? 0,
    sacCode: items[0]?.sacCode ?? null,
    isExemptMode: exempt,
    items: items.map((l) => ({ description: l.description, quantity: l.quantity, amount: l.amount, taxRate: l.taxRate, sacCode: l.sacCode, goods: l.goods })),
    clientId: null,
    clientName: "",
    recipientGstin: input.party.gstin ? normalizeGstin(input.party.gstin) : null,
    clientCountry: input.party.country,
    clientStateCode: input.party.stateCode,
    placeOfSupplyOverride: t.placeOfSupply,
    reverseCharge: t.reverseCharge,
    supplyOverride: t.supplyOverride,
  };
  const c = classifyInvoice(inv, input.supplierState);

  for (const issue of c.issues) {
    const code = ISSUE_TO_WARNING[issue];
    if (code && !warnings.some((w) => w.code === code)) warnings.push({ code, severity: "warn" });
  }
  // "Tax-exempt" is only worth saying for a domestic customer; an export is zero-rated by nature.
  if (exempt && c.placeOfSupply !== FOREIGN_POS) warnings.push({ code: "TAX_EXEMPT_CLIENT", severity: "info" });
  // The classifier already flags SAC_MISSING per line; the form reports it with the line index instead.
  if (c.placeOfSupply === FOREIGN_POS) warnings.push({ code: "EXPORT", severity: "info" });
  if (c.supplyType === "SEZWP" || c.supplyType === "SEZWOP") warnings.push({ code: "SEZ", severity: "info" });
  if (t.reverseCharge) warnings.push({ code: "REVERSE_CHARGE", severity: "info" });
  if (t.supplyOverride && !validateGstin(input.party.gstin).valid && !warnings.some((w) => w.code === "SEZ_NEEDS_GSTIN")) warnings.push({ code: "SEZ_NEEDS_GSTIN", severity: "warn" });

  const sum = (k: "igst" | "cgst" | "sgst") => r2(c.lines.reduce((s, l) => s + l[k], 0));
  return {
    applicable: true,
    supplyType: c.supplyType,
    placeOfSupply: c.placeOfSupply,
    interState: c.interState,
    taxable: c.taxable,
    tax: c.tax,
    total: c.value,
    split: { cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst") },
    lines: c.lines.map((l) => ({ rate: l.rate, taxable: l.taxable, tax: r2(l.igst + l.cgst + l.sgst + l.cess) })),
    warnings,
  };
}

export type ProductGstInput =
  | { ok: true; hsnCode: string | null; gstRate: number | null }
  | { ok: false; code: "HSN_INVALID" | "RATE_INVALID"; message: string };

/** HSN and rate typed on a product form. Blank is allowed (it simply stays unset); anything typed must be well formed. */
export function parseProductGst(hsn: FormDataEntryValue | string | null | undefined, rate: FormDataEntryValue | string | null | undefined): ProductGstInput {
  const code = typeof hsn === "string" ? hsn.replace(/\s+/g, "") : "";
  let hsnCode: string | null = null;
  if (code) {
    const check = validateTaxCode(code);
    if (!check.valid || check.kind !== "HSN") return { ok: false, code: "HSN_INVALID", message: "HSN must be 4, 6 or 8 digits. Codes starting 99 are service codes (SAC)." };
    hsnCode = check.code;
  }
  const raw = typeof rate === "string" ? rate.trim() : "";
  let gstRate: number | null = null;
  if (raw !== "") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, code: "RATE_INVALID", message: "GST rate must be between 0 and 100." };
    gstRate = n;
  }
  return { ok: true, hsnCode, gstRate };
}
