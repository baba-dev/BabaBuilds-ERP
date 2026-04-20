/**
 * Central catalog for subscription pricing by region. Amounts are in major units (e.g. INR rupees, USD dollars).
 * Annual = 10× monthly (two months free vs paying monthly for a year).
 */

export const PRICING_REGIONS = ["IN", "US", "EU", "OM", "ROW"] as const;
export type PricingRegion = (typeof PRICING_REGIONS)[number];

export const BILLING_CYCLES = ["monthly", "annual"] as const;
export type BillingCycle = (typeof BILLING_CYCLES)[number];

export const PLAN_IDS = ["pro", "team"] as const;
export type PlanId = (typeof PLAN_IDS)[number];

export const PLAN_INTERVALS = ["MONTHLY", "YEARLY", "TEAM_MONTHLY", "TEAM_YEARLY", "QUARTERLY"] as const;
export type PlanInterval = (typeof PLAN_INTERVALS)[number];

export const CURRENCIES = ["INR", "USD", "EUR", "OMR"] as const;
export type SupportedCurrency = (typeof CURRENCIES)[number];

const EU_COUNTRY_CODES = new Set<string>([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
]);

const PRICING_MATRIX: Record<
  PricingRegion,
  {
    currency: SupportedCurrency;
    monthly: Record<PlanId, number>;
  }
> = {
  IN: { currency: "INR", monthly: { pro: 1499, team: 3499 } },
  US: { currency: "USD", monthly: { pro: 5, team: 15 } },
  EU: { currency: "EUR", monthly: { pro: 5, team: 15 } },
  OM: { currency: "OMR", monthly: { pro: 3, team: 9 } },
  ROW: { currency: "USD", monthly: { pro: 5, team: 15 } },
};

/** Razorpay "amount" field uses the smallest currency unit; OMR uses 3 decimal places (×1000). */
export const MINOR_UNITS_PER_MAJOR_UNIT: Record<SupportedCurrency, number> = {
  INR: 100,
  USD: 100,
  EUR: 100,
  OMR: 1000,
};

const DEFAULT_REGION: PricingRegion = "ROW";

const isSupportedCurrency = (value: string | null | undefined): value is SupportedCurrency =>
  Boolean(value && CURRENCIES.includes(value.toUpperCase() as SupportedCurrency));

const normalizeCountryCode = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toUpperCase();
  return normalized.length >= 2 ? normalized.slice(0, 2) : null;
};

export function getPricingRegionFromCountry(countryCode: string | null | undefined): PricingRegion {
  const normalized = normalizeCountryCode(countryCode);
  if (!normalized) return DEFAULT_REGION;
  if (normalized === "IN") return "IN";
  if (normalized === "US") return "US";
  if (normalized === "OM") return "OM";
  if (EU_COUNTRY_CODES.has(normalized)) return "EU";
  return "ROW";
}

/**
 * Map a workspace/account currency to a pricing region when unambiguous.
 * USD is ambiguous (US vs ROW share USD); prefer explicit country via getPricingRegion.
 */
export function getPricingRegionFromCurrency(currency: string | null | undefined): PricingRegion | null {
  const normalized = currency?.toUpperCase();
  if (normalized === "INR") return "IN";
  if (normalized === "EUR") return "EU";
  if (normalized === "OMR") return "OM";
  return null;
}

export function getPricingRegionFromLocale(locale: string | null | undefined): PricingRegion | null {
  if (!locale) return null;
  const countrySegment = locale.split("-")[1] ?? null;
  return countrySegment ? getPricingRegionFromCountry(countrySegment) : null;
}

export function getPricingRegion(input?: {
  explicitRegion?: PricingRegion | null;
  explicitCountryCode?: string | null;
  explicitCurrency?: string | null;
  billingCountryCode?: string | null;
  detectedCountryCode?: string | null;
  locale?: string | null;
}): PricingRegion {
  if (input?.explicitRegion && PRICING_REGIONS.includes(input.explicitRegion)) {
    return input.explicitRegion;
  }

  const regionFromExplicitCountry = getPricingRegionFromCountry(input?.explicitCountryCode);
  if (input?.explicitCountryCode && regionFromExplicitCountry !== DEFAULT_REGION) {
    return regionFromExplicitCountry;
  }

  const regionFromExplicitCurrency = getPricingRegionFromCurrency(input?.explicitCurrency);
  if (regionFromExplicitCurrency) {
    return regionFromExplicitCurrency;
  }

  const regionFromBillingCountry = getPricingRegionFromCountry(input?.billingCountryCode);
  if (input?.billingCountryCode && regionFromBillingCountry !== DEFAULT_REGION) {
    return regionFromBillingCountry;
  }

  const regionFromDetectedCountry = getPricingRegionFromCountry(input?.detectedCountryCode);
  if (input?.detectedCountryCode && regionFromDetectedCountry !== DEFAULT_REGION) {
    return regionFromDetectedCountry;
  }

  const regionFromLocale = getPricingRegionFromLocale(input?.locale);
  if (regionFromLocale && regionFromLocale !== DEFAULT_REGION) {
    return regionFromLocale;
  }

  return DEFAULT_REGION;
}

export function getRegionFromRequestHeaders(headers: Headers): PricingRegion {
  const detectedCountry =
    headers.get("x-pricing-country") ||
    headers.get("x-billing-country") ||
    headers.get("x-vercel-ip-country") ||
    headers.get("cf-ipcountry") ||
    headers.get("x-country-code") ||
    null;

  return getPricingRegion({ detectedCountryCode: detectedCountry });
}

export function getPlanInterval(planId: PlanId, billingCycle: BillingCycle): PlanInterval {
  if (planId === "team") {
    return billingCycle === "annual" ? "TEAM_YEARLY" : "TEAM_MONTHLY";
  }
  return billingCycle === "annual" ? "YEARLY" : "MONTHLY";
}

export function parsePlanInterval(interval: string | null | undefined): { planId: PlanId; billingCycle: BillingCycle } {
  if (interval === "TEAM_MONTHLY") return { planId: "team", billingCycle: "monthly" };
  if (interval === "TEAM_YEARLY") return { planId: "team", billingCycle: "annual" };
  if (interval === "YEARLY") return { planId: "pro", billingCycle: "annual" };
  if (interval === "QUARTERLY") return { planId: "pro", billingCycle: "monthly" };
  return { planId: "pro", billingCycle: "monthly" };
}

export type PlanPrice = {
  region: PricingRegion;
  planId: PlanId;
  billingCycle: BillingCycle;
  interval: PlanInterval;
  currency: SupportedCurrency;
  amountMajor: number;
  amountMinor: number;
};

export function getPlanPrice(input: {
  planId: PlanId;
  billingCycle: BillingCycle;
  region?: PricingRegion;
  explicitRegion?: PricingRegion | null;
  explicitCountryCode?: string | null;
  explicitCurrency?: string | null;
  billingCountryCode?: string | null;
  detectedCountryCode?: string | null;
  locale?: string | null;
}): PlanPrice {
  const region =
    input.region ??
    getPricingRegion({
      explicitRegion: input.explicitRegion,
      explicitCountryCode: input.explicitCountryCode,
      explicitCurrency: input.explicitCurrency,
      billingCountryCode: input.billingCountryCode,
      detectedCountryCode: input.detectedCountryCode,
      locale: input.locale,
    });

  const regionConfig = PRICING_MATRIX[region];
  const monthlyAmount = regionConfig.monthly[input.planId];
  const amountMajor = input.billingCycle === "annual" ? monthlyAmount * 10 : monthlyAmount;
  const amountMinor = Math.round(amountMajor * MINOR_UNITS_PER_MAJOR_UNIT[regionConfig.currency]);

  return {
    region,
    planId: input.planId,
    billingCycle: input.billingCycle,
    interval: getPlanInterval(input.planId, input.billingCycle),
    currency: regionConfig.currency,
    amountMajor,
    amountMinor,
  };
}

export function getPlanPriceFromInterval(input: {
  interval: string | null | undefined;
  region?: PricingRegion;
  explicitRegion?: PricingRegion | null;
  explicitCountryCode?: string | null;
  explicitCurrency?: string | null;
  billingCountryCode?: string | null;
  detectedCountryCode?: string | null;
  locale?: string | null;
}): PlanPrice {
  const { planId, billingCycle } = parsePlanInterval(input.interval);
  return getPlanPrice({
    planId,
    billingCycle,
    region: input.region,
    explicitRegion: input.explicitRegion,
    explicitCountryCode: input.explicitCountryCode,
    explicitCurrency: input.explicitCurrency,
    billingCountryCode: input.billingCountryCode,
    detectedCountryCode: input.detectedCountryCode,
    locale: input.locale,
  });
}

export function resolvePricingIntervalByAmount(input: {
  amountMajor: number;
  currency?: string | null;
  region?: PricingRegion;
  explicitRegion?: PricingRegion | null;
  explicitCountryCode?: string | null;
  explicitCurrency?: string | null;
  billingCountryCode?: string | null;
  detectedCountryCode?: string | null;
  locale?: string | null;
}): PlanInterval | null {
  const region =
    input.region ??
    getPricingRegion({
      explicitRegion: input.explicitRegion,
      explicitCountryCode: input.explicitCountryCode,
      explicitCurrency: input.explicitCurrency ?? input.currency,
      billingCountryCode: input.billingCountryCode,
      detectedCountryCode: input.detectedCountryCode,
      locale: input.locale,
    });

  const resolvedCurrency = isSupportedCurrency(input.currency) ? input.currency : PRICING_MATRIX[region].currency;
  const amount = Math.round(input.amountMajor * 1000) / 1000;

  for (const planId of PLAN_IDS) {
    for (const billingCycle of BILLING_CYCLES) {
      const price = getPlanPrice({ planId, billingCycle, region });
      if (price.currency === resolvedCurrency && Math.round(price.amountMajor * 1000) / 1000 === amount) {
        return price.interval;
      }
    }
  }

  return null;
}

export function formatMajorInCurrency(amountMajor: number, currency: SupportedCurrency, locale?: string): string {
  if (currency === "OMR") {
    return `OMR ${amountMajor.toLocaleString(locale ?? "en-OM", { maximumFractionDigits: 3 })}`;
  }
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: currency === "INR" ? 0 : 2,
  }).format(amountMajor);
}

export function formatPlanPrice(price: PlanPrice, locale?: string): string {
  return formatMajorInCurrency(price.amountMajor, price.currency, locale);
}

export function normalizeGatewayCurrency(code: string | null | undefined): SupportedCurrency {
  const u = String(code ?? "INR").toUpperCase();
  if (isSupportedCurrency(u)) return u;
  return "INR";
}

/** Convert Razorpay payment.amount (integer minor units) to major units for the given currency. */
export function razorpayMinorAmountToMajor(amountMinorRaw: number, currency: SupportedCurrency): number {
  const divisor = MINOR_UNITS_PER_MAJOR_UNIT[currency];
  return amountMinorRaw / divisor;
}

export function majorAmountToRazorpayMinor(amountMajor: number, currency: SupportedCurrency): number {
  return Math.round(amountMajor * MINOR_UNITS_PER_MAJOR_UNIT[currency]);
}

/** Round list/charge amounts for stable gateway totals (OMR uses millimes). */
export function roundMajorAmount(amount: number, currency: SupportedCurrency): number {
  if (currency === "OMR") return Math.max(0, Math.round(amount * 1000) / 1000);
  return Math.max(0, Math.round(amount * 100) / 100);
}

/** India catalog (INR) — backward compatible with previous `PRICING` export. */
export const PRICING = {
  MONTHLY: PRICING_MATRIX.IN.monthly.pro,
  QUARTERLY: PRICING_MATRIX.IN.monthly.pro * 3,
  YEARLY: PRICING_MATRIX.IN.monthly.pro * 10,
  TEAM_MONTHLY: PRICING_MATRIX.IN.monthly.team,
  TEAM_YEARLY: PRICING_MATRIX.IN.monthly.team * 10,
} as const;

export type PricingInterval = keyof typeof PRICING;

export const getMonthlyPriceForInterval = (interval: string | null | undefined, region: PricingRegion = "IN") => {
  const typedInterval = PLAN_INTERVALS.includes((interval ?? "") as PlanInterval)
    ? (interval as PlanInterval)
    : "MONTHLY";

  if (typedInterval === "TEAM_MONTHLY") return getPlanPrice({ planId: "team", billingCycle: "monthly", region }).amountMajor;
  if (typedInterval === "TEAM_YEARLY")
    return getPlanPrice({ planId: "team", billingCycle: "annual", region }).amountMajor / 12;
  if (typedInterval === "YEARLY") return getPlanPrice({ planId: "pro", billingCycle: "annual", region }).amountMajor / 12;
  if (typedInterval === "QUARTERLY") return getPlanPrice({ planId: "pro", billingCycle: "monthly", region }).amountMajor;
  return getPlanPrice({ planId: "pro", billingCycle: "monthly", region }).amountMajor;
};

/** Max active CRM clients on Free (non-trial). */
export const FREE_TIER_CLIENT_LIMIT = 3;

/** Max invoices created per calendar month (UTC) on Free (non-trial). */
export const FREE_TIER_MONTHLY_INVOICE_LIMIT = 5;

/** Max shop-published services on Free (non-trial). */
export const FREE_TIER_PUBLISHED_SERVICES_LIMIT = 3;
