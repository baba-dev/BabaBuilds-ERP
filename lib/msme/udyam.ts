import { MSME_RULES } from "./rules";

export type MsmeClass = "MICRO" | "SMALL" | "MEDIUM" | "NONE";

/** Uppercases and trims a pasted Udyam number; accepts a missing "UDYAM-" prefix and spaces or underscores as separators. */
export function normalizeUdyam(raw: string | null | undefined): string {
  const s = (raw ?? "").toUpperCase().trim().replace(/[\s_/]+/g, "-");
  if (!s) return "";
  const body = s.replace(/^UDYAM-?/, "");
  return /^[A-Z]{2}-?\d{2}-?\d{7}$/.test(body) ? `UDYAM-${body.replace(/-/g, "").replace(/^([A-Z]{2})(\d{2})(\d{7})$/, "$1-$2-$3")}` : s;
}

export function validateUdyam(raw: string | null | undefined): { valid: boolean; value: string; reason?: "EMPTY" | "FORMAT" } {
  const value = normalizeUdyam(raw);
  if (!value) return { valid: false, value, reason: "EMPTY" };
  return MSME_RULES.udyamPattern.test(value) ? { valid: true, value } : { valid: false, value, reason: "FORMAT" };
}

/** Udyam number prefix carries the state code, e.g. UDYAM-MH-12-0000001. Only the format can be checked offline. */
export function udyamState(value: string): string | null {
  const m = /^UDYAM-([A-Z]{2})-/.exec(value);
  return m ? m[1] : null;
}

/**
 * Classifies an enterprise from the 2025 limits. An enterprise sits in the smallest band that fits BOTH tests.
 * `investment` is optional: without it only turnover is tested and the result is flagged as turnover-only.
 */
export function classifyMsme(args: { turnover: number; investment?: number | null }): { class: MsmeClass; basis: "BOTH" | "TURNOVER_ONLY" } {
  const c = MSME_RULES.classification;
  const hasInv = args.investment !== null && args.investment !== undefined && Number.isFinite(args.investment);
  const fits = (band: { investment: number; turnover: number }) => args.turnover <= band.turnover && (!hasInv || (args.investment as number) <= band.investment);
  const klass: MsmeClass = fits(c.micro) ? "MICRO" : fits(c.small) ? "SMALL" : fits(c.medium) ? "MEDIUM" : "NONE";
  return { class: klass, basis: hasInv ? "BOTH" : "TURNOVER_ONLY" };
}

export const isMicroOrSmall = (k: string | null | undefined) => k === "MICRO" || k === "SMALL";
