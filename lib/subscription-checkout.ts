import { PRICING } from "@/lib/pricing";

export type SubscriptionIntervalKey =
  | "MONTHLY"
  | "QUARTERLY"
  | "YEARLY"
  | "TEAM_MONTHLY"
  | "TEAM_YEARLY";

const INTERVAL_ORDER: SubscriptionIntervalKey[] = [
  "MONTHLY",
  "QUARTERLY",
  "YEARLY",
  "TEAM_MONTHLY",
  "TEAM_YEARLY",
];

export function getListPriceInr(interval: SubscriptionIntervalKey): number {
  return PRICING[interval];
}

export function isValidInterval(interval: unknown): interval is SubscriptionIntervalKey {
  return typeof interval === "string" && INTERVAL_ORDER.includes(interval as SubscriptionIntervalKey);
}

/** Razorpay amounts are in paise; round to avoid float drift. */
export function inrToPaise(amountInr: number): number {
  return Math.round(amountInr * 100);
}

export function paiseToInr(paise: number): number {
  return paise / 100;
}

export function applyCustomerDiscountPercent(listInr: number, discountPercent: number): number {
  const pct = Math.min(100, Math.max(0, discountPercent));
  const net = listInr * (1 - pct / 100);
  return Math.max(0, Math.round(net * 100) / 100);
}

export function tierFromInterval(interval: SubscriptionIntervalKey): "PRO" | "TEAM" {
  return interval.startsWith("TEAM") ? "TEAM" : "PRO";
}

/**
 * Minimum acceptable paid amount (INR) for a plan after distributor discount (inclusive).
 */
export function minimumExpectedPaidInr(
  interval: SubscriptionIntervalKey,
  customerDiscountPercent: number,
): number {
  const list = getListPriceInr(interval);
  return applyCustomerDiscountPercent(list, customerDiscountPercent);
}

const PAID_EPS = 0.02;

export function paidMatchesPlan(
  amountPaid: number,
  interval: SubscriptionIntervalKey,
  customerDiscountPercent: number,
): boolean {
  const minDue = minimumExpectedPaidInr(interval, customerDiscountPercent);
  return amountPaid + PAID_EPS >= minDue;
}

/**
 * Infer tier + billing interval from amount paid (INR) when no explicit interval is available
 * (e.g. legacy webhooks). Uses catalog thresholds — ambiguous when discounts make two plans
 * the same price; prefer passing `interval` in payment notes / verify body.
 */
export function inferTierAndIntervalFromPaidAmount(amountPaid: number): {
  interval: SubscriptionIntervalKey;
  tier: "PRO" | "TEAM";
} {
  if (amountPaid >= PRICING.TEAM_YEARLY - PAID_EPS) {
    return { interval: "TEAM_YEARLY", tier: "TEAM" };
  }
  if (amountPaid >= PRICING.YEARLY - PAID_EPS) {
    return { interval: "YEARLY", tier: "PRO" };
  }
  if (amountPaid >= PRICING.QUARTERLY - PAID_EPS) {
    return { interval: "QUARTERLY", tier: "PRO" };
  }
  if (amountPaid >= PRICING.TEAM_MONTHLY - PAID_EPS) {
    return { interval: "TEAM_MONTHLY", tier: "TEAM" };
  }
  if (amountPaid >= PRICING.MONTHLY - PAID_EPS) {
    return { interval: "MONTHLY", tier: "PRO" };
  }
  return { interval: "MONTHLY", tier: "PRO" };
}
