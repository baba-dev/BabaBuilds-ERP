import { MAX_CATEGORY_LENGTH } from "./categories";

export type ExpenseFieldIssue = { field: string; code: "REQUIRED" | "TOO_LONG" | "AMOUNT" | "DATE" | "DATE_FUTURE" };
export type ExpenseCore = { date: Date; category: string; vendor: string; amount: number; description: string | null };

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();
const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
export const MAX_AMOUNT = 100_000_000_000;
const FUTURE_DAYS = 30;

/** Parses a number a person typed ("1,200.50"). Returns null if it is not a plain number. */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = str(v).replace(/[,\s]/g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * One rule set for every way an expense gets in (form, edit, AI chat, import, file launch).
 * With `partial`, only the keys that are present are checked and returned.
 */
export function normalizeExpenseCore(raw: Record<string, unknown>, opts: { partial?: boolean; now?: Date } = {}): { ok: true; data: Partial<ExpenseCore> } | { ok: false; fields: ExpenseFieldIssue[] } {
  const partial = Boolean(opts.partial);
  const now = opts.now ?? new Date();
  const issues: ExpenseFieldIssue[] = [];
  const out: Partial<ExpenseCore> = {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(raw, k) && raw[k] !== undefined;

  if (has("vendor") || !partial) {
    const vendor = collapse(str(raw.vendor));
    if (!vendor) issues.push({ field: "vendor", code: "REQUIRED" });
    else if (vendor.length > 120) issues.push({ field: "vendor", code: "TOO_LONG" });
    else out.vendor = vendor;
  }
  if (has("category") || !partial) {
    const category = collapse(str(raw.category)) || (partial ? "" : "Other");
    if (!category) issues.push({ field: "category", code: "REQUIRED" });
    else if (category.length > MAX_CATEGORY_LENGTH) issues.push({ field: "category", code: "TOO_LONG" });
    else out.category = category;
  }
  if (has("amount") || !partial) {
    const n = parseAmount(raw.amount);
    if (n === null || n <= 0 || n > MAX_AMOUNT) issues.push({ field: "amount", code: "AMOUNT" });
    else out.amount = Math.round(n * 100) / 100;
  }
  if (has("date") || !partial) {
    const text = str(raw.date).trim();
    const d = text ? new Date(text) : new Date(NaN);
    if (Number.isNaN(d.getTime()) || d.getUTCFullYear() < 2000) issues.push({ field: "date", code: "DATE" });
    else if (d.getTime() > now.getTime() + FUTURE_DAYS * 86_400_000) issues.push({ field: "date", code: "DATE_FUTURE" });
    else out.date = d;
  }
  if (has("description")) {
    const description = collapse(str(raw.description));
    if (description.length > 500) issues.push({ field: "description", code: "TOO_LONG" });
    else out.description = description || null;
  }
  return issues.length ? { ok: false, fields: issues } : { ok: true, data: out };
}
