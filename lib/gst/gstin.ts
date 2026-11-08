import { isStateCode } from "./states";

const CHARSET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export type GstinCheck =
  | { valid: true; stateCode: string; pan: string }
  | { valid: false; reason: "LENGTH" | "FORMAT" | "STATE" | "CHECKSUM" };

/** The 15th GSTIN character: a base-36 mod-36 checksum over the first 14. */
export function gstinChecksumChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const value = CHARSET.indexOf(first14[i]);
    if (value < 0) return "?";
    const product = value * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return CHARSET[(36 - (sum % 36)) % 36];
}

export function normalizeGstin(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, "").toUpperCase();
}

export function validateGstin(raw: string | null | undefined): GstinCheck {
  const gstin = normalizeGstin(raw);
  if (gstin.length !== 15) return { valid: false, reason: "LENGTH" };
  if (!GSTIN_SHAPE.test(gstin)) return { valid: false, reason: "FORMAT" };
  const stateCode = gstin.slice(0, 2);
  if (!isStateCode(stateCode)) return { valid: false, reason: "STATE" };
  if (gstinChecksumChar(gstin.slice(0, 14)) !== gstin[14]) return { valid: false, reason: "CHECKSUM" };
  return { valid: true, stateCode, pan: gstin.slice(2, 12) };
}

export function isValidGstin(raw: string | null | undefined): boolean {
  return validateGstin(raw).valid;
}

/** Same checks on a PAN-shaped value (used to reject a PAN typed into the GSTIN field). */
export function looksLikePan(raw: string | null | undefined): boolean {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(normalizeGstin(raw));
}
