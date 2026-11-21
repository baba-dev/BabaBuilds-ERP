import { r2 } from "@/lib/gst/money";

export type TdsInput = { section?: string | null; ratePercent?: number | null };

/**
 * Expected TDS (tax deducted at source) the client will withhold. It is taken on the amount BEFORE GST, because TDS is
 * on the fee itself; GST is paid in full. Null when nothing will be deducted (no rate, a zero subtotal, or an export).
 */
export const computeTds = (args: {
  subtotal: number;
  ratePercent: number | null | undefined;
  isExport?: boolean;
}): { ratePercent: number; amount: number } | null => {
  const { subtotal, ratePercent, isExport } = args;
  if (isExport) return null;
  if (!Number.isFinite(subtotal) || subtotal <= 0) return null;
  if (typeof ratePercent !== "number" || !Number.isFinite(ratePercent) || ratePercent <= 0) return null;
  const rate = Math.min(100, ratePercent);
  return { ratePercent: rate, amount: r2((subtotal * rate) / 100) };
};

/** What the client actually pays: the invoice total less TDS, never below zero. */
export const netPayable = (total: number, tdsAmount: number | null | undefined): number => Math.max(0, r2(total - (tdsAmount ?? 0)));

/** Section code such as "194J" or "194J(b)": up to 12 letters, digits, brackets or spaces. Anything else is null. */
export const normalizeTdsSection = (input: unknown): string | null => {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value || value.length > 12 || !/^[A-Za-z0-9() ]+$/.test(value)) return null;
  return value;
};
