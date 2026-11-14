export type HealthLabel = "NEW" | "EXCELLENT" | "GOOD" | "WATCH" | "AT_RISK";

export type HealthInput = {
  invoiceCount: number;
  outstanding: number;
  overdue: number;
  /** Share of settled invoices paid by the due date, 0-1. */
  onTimeRate: number | null;
  avgDaysToPay: number | null;
  termsDays: number;
};

/**
 * One line a person can act on. It is a simple, explainable rule set, not a model: late payers and big overdue balances
 * lower it; a clean record raises it. `reasons` says why, so the number is never a mystery.
 */
export function clientHealth(i: HealthInput): { score: number | null; label: HealthLabel; reasons: string[] } {
  if (i.invoiceCount === 0) return { score: null, label: "NEW", reasons: [] };
  let score = 100;
  const reasons: string[] = [];
  if (i.outstanding > 0 && i.overdue > 0) {
    const share = Math.min(1, i.overdue / i.outstanding);
    const pen = Math.round(15 + share * 40);
    score -= pen;
    reasons.push("OVERDUE");
  }
  if (i.avgDaysToPay !== null && i.avgDaysToPay > i.termsDays + 14) { score -= 20; reasons.push("SLOW_PAYER"); }
  else if (i.avgDaysToPay !== null && i.avgDaysToPay > i.termsDays + 3) { score -= 8; reasons.push("PAYS_LATE"); }
  if (i.onTimeRate !== null && i.onTimeRate < 0.5) { score -= 20; reasons.push("OFTEN_LATE"); }
  else if (i.onTimeRate !== null && i.onTimeRate < 0.8) { score -= 8; }
  if (i.onTimeRate !== null && i.onTimeRate >= 0.95 && i.overdue === 0) reasons.push("RELIABLE");
  score = Math.max(0, Math.min(100, score));
  const label: HealthLabel = score >= 85 ? "EXCELLENT" : score >= 70 ? "GOOD" : score >= 50 ? "WATCH" : "AT_RISK";
  return { score, label, reasons };
}

export type CreditStatus = { state: "NONE" | "OK" | "NEAR" | "OVER"; limit: number | null; used: number; after: number; headroom: number | null };

/** Compares what the client owes now (plus a new invoice) with their credit limit. 90% or more is "near". */
export function creditStatus(limit: number | null | undefined, outstanding: number, newAmount = 0): CreditStatus {
  const used = Math.max(0, outstanding);
  const after = used + Math.max(0, newAmount);
  if (limit === null || limit === undefined || !(limit > 0)) return { state: "NONE", limit: null, used, after, headroom: null };
  const state = after > limit ? "OVER" : after >= limit * 0.9 ? "NEAR" : "OK";
  return { state, limit, used, after, headroom: Math.round((limit - after) * 100) / 100 };
}

/** Days between an invoice date and when it was fully paid, for settled invoices. Returns average and on-time share. */
export function paymentStats(settled: Array<{ invoiceDate: Date; dueDate: Date | null; paidAt: Date; termsDays: number }>): { avgDaysToPay: number | null; onTimeRate: number | null; sample: number } {
  if (settled.length === 0) return { avgDaysToPay: null, onTimeRate: null, sample: 0 };
  const DAY = 86_400_000;
  let total = 0;
  let onTime = 0;
  for (const s of settled) {
    total += Math.max(0, (s.paidAt.getTime() - s.invoiceDate.getTime()) / DAY);
    const due = s.dueDate ?? new Date(s.invoiceDate.getTime() + s.termsDays * DAY);
    if (s.paidAt.getTime() <= due.getTime() + DAY) onTime += 1;
  }
  return { avgDaysToPay: Math.round((total / settled.length) * 10) / 10, onTimeRate: Math.round((onTime / settled.length) * 100) / 100, sample: settled.length };
}
