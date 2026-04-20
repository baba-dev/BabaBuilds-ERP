import {
  PRICING,
  getPlanPriceFromInterval,
  majorAmountToRazorpayMinor,
  roundMajorAmount,
  type PlanPrice,
  type PricingRegion,
  type SupportedCurrency,
} from "@/lib/pricing";

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

export function getListPriceForInterval(interval: SubscriptionIntervalKey, region: PricingRegion): PlanPrice {
  return getPlanPriceFromInterval({ interval, region });
}

/** @deprecated Use getListPriceForInterval — kept for call sites that assume India INR. */
export function getListPriceInr(interval: SubscriptionIntervalKey): number {
  return getListPriceForInterval(interval, "IN").amountMajor;
}

export function isValidInterval(interval: unknown): interval is SubscriptionIntervalKey {
  return typeof interval === "string" && INTERVAL_ORDER.includes(interval as SubscriptionIntervalKey);
}

/** Razorpay order amount uses smallest currency units (paise/cents/baisa). */
export function amountMajorToGatewayMinor(amountMajor: number, currency: PlanPrice["currency"]): number {
  return majorAmountToRazorpayMinor(amountMajor, currency);
}

export function applyCustomerDiscountPercent(
  listMajor: number,
  discountPercent: number,
  currency: SupportedCurrency,
): number {
  const pct = Math.min(100, Math.max(0, discountPercent));
  const net = listMajor * (1 - pct / 100);
  return roundMajorAmount(net, currency);
}

export function tierFromInterval(interval: SubscriptionIntervalKey): "PRO" | "TEAM" {
  return interval.startsWith("TEAM") ? "TEAM" : "PRO";
}

/**
 * Minimum acceptable paid amount (major units, gateway currency) after distributor discount (inclusive).
 */
export function minimumExpectedPaidMajor(
  interval: SubscriptionIntervalKey,
  customerDiscountPercent: number,
  region: PricingRegion,
): number {
  const price = getListPriceForInterval(interval, region);
  return applyCustomerDiscountPercent(price.amountMajor, customerDiscountPercent, price.currency);
}

function paidEpsilon(currency: SupportedCurrency): number {
  return currency === "OMR" ? 0.005 : 0.02;
}

export function paidMatchesPlan(
  amountPaidMajor: number,
  interval: SubscriptionIntervalKey,
  customerDiscountPercent: number,
  region: PricingRegion,
): boolean {
  const price = getListPriceForInterval(interval, region);
  const minDue = minimumExpectedPaidMajor(interval, customerDiscountPercent, region);
  return amountPaidMajor + paidEpsilon(price.currency) >= minDue;
}

/**
 * Infer tier + billing interval from amount paid (major units, INR) when no explicit interval is available.
 * Uses India catalog only — prefer passing `interval` in payment notes.
 */
const LEGACY_INR_EPS = 0.02;

export function inferTierAndIntervalFromPaidAmount(amountPaidInr: number): {
  interval: SubscriptionIntervalKey;
  tier: "PRO" | "TEAM";
} {
  if (amountPaidInr >= PRICING.TEAM_YEARLY - LEGACY_INR_EPS) {
    return { interval: "TEAM_YEARLY", tier: "TEAM" };
  }
  if (amountPaidInr >= PRICING.YEARLY - LEGACY_INR_EPS) {
    return { interval: "YEARLY", tier: "PRO" };
  }
  if (amountPaidInr >= PRICING.QUARTERLY - LEGACY_INR_EPS) {
    return { interval: "QUARTERLY", tier: "PRO" };
  }
  if (amountPaidInr >= PRICING.TEAM_MONTHLY - LEGACY_INR_EPS) {
    return { interval: "TEAM_MONTHLY", tier: "TEAM" };
  }
  if (amountPaidInr >= PRICING.MONTHLY - LEGACY_INR_EPS) {
    return { interval: "MONTHLY", tier: "PRO" };
  }
  return { interval: "MONTHLY", tier: "PRO" };
}
