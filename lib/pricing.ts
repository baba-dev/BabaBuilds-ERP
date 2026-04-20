export const PRICING = {
  MONTHLY: 200,
  QUARTERLY: 550,
  YEARLY: 2300,
  TEAM_MONTHLY: 400,
  TEAM_YEARLY: 4500,
};

export type PricingInterval = keyof typeof PRICING;

const PLAN_INTERVAL_MONTHS: Record<PricingInterval, number> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
  TEAM_MONTHLY: 1,
  TEAM_YEARLY: 12,
};

export const resolvePricingIntervalByAmount = (amount: number): PricingInterval | null => {
  const roundedAmount = Math.round(amount);
  const entry = (Object.entries(PRICING) as Array<[PricingInterval, number]>).find(
    ([, price]) => price === roundedAmount,
  );
  return entry?.[0] ?? null;
};

export const getMonthlyPriceForInterval = (interval: string | null | undefined) => {
  if (!interval || !(interval in PRICING)) {
    return PRICING.MONTHLY;
  }
  const typedInterval = interval as PricingInterval;
  return PRICING[typedInterval] / PLAN_INTERVAL_MONTHS[typedInterval];
};

/** Max active CRM clients on Free (non-trial). */
export const FREE_TIER_CLIENT_LIMIT = 3;

/** Max invoices created per calendar month (UTC) on Free (non-trial). */
export const FREE_TIER_MONTHLY_INVOICE_LIMIT = 5;

/** Max shop-published services on Free (non-trial). */
export const FREE_TIER_PUBLISHED_SERVICES_LIMIT = 3;
