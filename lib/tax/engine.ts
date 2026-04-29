import { Prisma } from '@prisma/client';
import { serializeMoney, toDecimal } from '@/lib/money';
import { estimateTaxFromRules as estimateCountryRateFromRules } from '@/lib/tax/rules';

export type TaxDisclaimerKey = 'AUTO_RULE' | 'MANUAL_OVERRIDE' | 'PROVIDER_RATE' | 'FALLBACK_RULE';

export interface TaxEstimateInput {
  countryCode?: string | null;
  revenue?: Prisma.Decimal | number | string | null;
  deductions?: Prisma.Decimal | number | string | null;
  serviceScope?: string | null;
  regionCode?: string | null;
  customerScope?: string | null;
  asOfDate?: string | Date | null;
  fiscalYear?: string | null;
  overrideRatePercent?: number | string | null;
  overrideId?: string | null;
  overrideReason?: string | null;
  resolutionMode?: 'auto' | 'prefer_provider_rate';
}

export interface TaxEstimateResult {
  amount: string;
  ratePercent: number | null;
  basis: {
    countryCode: string | null;
    revenue: string;
    deductions: string;
    taxableIncome: string;
    serviceScope: string | null;
    regionCode: string | null;
    customerScope: string | null;
    asOfDate: string;
    method: 'rule_engine' | 'provider_rate' | 'manual_override' | 'fallback';
    providerRatePercent: number | null;
  };
  override: {
    applied: boolean;
    overrideId: string | null;
    reason: string | null;
  };
  disclaimerKey: TaxDisclaimerKey;
}

const DEFAULT_FALLBACK_RATE = 0.3;
const RULE_ENGINE_COUNTRIES = new Set(['IN']);

type IndiaTaxRegimeKey = 'FY_2025_26' | 'FY_2026_27_PLUS';
type IndiaTaxSlab = { floor: number; width: number | null; rate: number };

const INDIA_TAX_SLABS_BY_REGIME: Record<IndiaTaxRegimeKey, IndiaTaxSlab[]> = {
  // Effective for FY 2025-26 (AY 2026-27): up to 4L exempt and 4L slab widths through 24L.
  FY_2025_26: [
    { floor: 400000, width: 400000, rate: 0.05 },
    { floor: 800000, width: 400000, rate: 0.10 },
    { floor: 1200000, width: 400000, rate: 0.15 },
    { floor: 1600000, width: 400000, rate: 0.20 },
    { floor: 2000000, width: 400000, rate: 0.25 },
    { floor: 2400000, width: null, rate: 0.30 },
  ],
  // Effective from FY 2026-27 onward until superseded.
  FY_2026_27_PLUS: [
    { floor: 400000, width: 400000, rate: 0.05 },
    { floor: 800000, width: 400000, rate: 0.10 },
    { floor: 1200000, width: 400000, rate: 0.15 },
    { floor: 1600000, width: 400000, rate: 0.20 },
    { floor: 2000000, width: 400000, rate: 0.25 },
    { floor: 2400000, width: null, rate: 0.30 },
  ],
};

const normalizePercent = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) return null;
  return normalized > 1 ? normalized : normalized * 100;
};

const resolveProviderRatePercent = (countryCode?: string | null, regionCode?: string | null): number | null => {
  const normalized = (countryCode || '').trim().toUpperCase();
  if (!normalized) return null;
  const providerRate = estimateCountryRateFromRules({ countryCode: normalized, regionCode });
  if (typeof providerRate !== 'number') return null;
  return providerRate * 100;
};

const parseIndiaFiscalYearStart = (fiscalYear?: string | null): number | null => {
  if (!fiscalYear) return null;
  const normalized = fiscalYear.trim();
  const match = normalized.match(/^(?:FY\s*)?(\d{2,4})\s*[-/]\s*(\d{2,4})$/i);
  if (!match) return null;
  const parseYear = (token: string): number => {
    if (token.length === 4) return Number(token);
    const year = Number(token);
    return year >= 50 ? 1900 + year : 2000 + year;
  };
  const startYear = parseYear(match[1]);
  return Number.isFinite(startYear) ? startYear : null;
};

const resolveIndiaTaxRegime = (input: Pick<TaxEstimateInput, 'asOfDate' | 'fiscalYear'>): IndiaTaxRegimeKey => {
  const fiscalYearStart = parseIndiaFiscalYearStart(input.fiscalYear);
  if (fiscalYearStart !== null) return fiscalYearStart >= 2026 ? 'FY_2026_27_PLUS' : 'FY_2025_26';

  const effectiveDate = input.asOfDate ? new Date(input.asOfDate) : new Date();
  const safeDate = Number.isNaN(effectiveDate.getTime()) ? new Date() : effectiveDate;
  const fiscalYearFromDate = safeDate.getUTCMonth() >= 3 ? safeDate.getUTCFullYear() : safeDate.getUTCFullYear() - 1;
  return fiscalYearFromDate >= 2026 ? 'FY_2026_27_PLUS' : 'FY_2025_26';
};

export const estimateIndiaIncomeTaxFromRules = (
  taxableIncome: Prisma.Decimal,
  context?: Pick<TaxEstimateInput, 'asOfDate' | 'fiscalYear'>,
): { amount: Prisma.Decimal; ratePercent: number } => {
  const regime = resolveIndiaTaxRegime(context ?? {});
  const slabs = INDIA_TAX_SLABS_BY_REGIME[regime];

  const amount = slabs.reduce((tax, slab) => {
    const floor = new Prisma.Decimal(slab.floor);
    if (taxableIncome.lte(floor)) return tax;

    const slabWidth = slab.width === null
      ? taxableIncome.minus(floor)
      : Prisma.Decimal.min(taxableIncome.minus(floor), new Prisma.Decimal(slab.width));

    if (slabWidth.lte(0)) return tax;
    return tax.plus(slabWidth.mul(slab.rate));
  }, new Prisma.Decimal(0));

  const effectiveRate = taxableIncome.eq(0) ? 0 : amount.div(taxableIncome).mul(100).toDecimalPlaces(2).toNumber();
  return { amount, ratePercent: effectiveRate };
};

export const estimateTax = (input: TaxEstimateInput): TaxEstimateResult => {
  const revenue = toDecimal(input.revenue);
  const deductions = Prisma.Decimal.max(new Prisma.Decimal(0), toDecimal(input.deductions));
  const taxableIncome = Prisma.Decimal.max(new Prisma.Decimal(0), revenue.minus(deductions));
  const asOfDate = input.asOfDate ? new Date(input.asOfDate) : new Date();
  const asOfDateIso = Number.isNaN(asOfDate.getTime()) ? new Date().toISOString() : asOfDate.toISOString();

  const overrideRatePercent = normalizePercent(input.overrideRatePercent);
  const normalizedCountryCode = input.countryCode?.trim().toUpperCase() || null;
  const providerRatePercent = resolveProviderRatePercent(normalizedCountryCode, input.regionCode);
  const resolutionMode = input.resolutionMode ?? 'auto';
  const hasCountryRuleEngine = Boolean(normalizedCountryCode && RULE_ENGINE_COUNTRIES.has(normalizedCountryCode));

  const baseResult = {
    basis: {
      countryCode: normalizedCountryCode,
      revenue: serializeMoney(revenue),
      deductions: serializeMoney(deductions),
      taxableIncome: serializeMoney(taxableIncome),
      serviceScope: input.serviceScope?.trim() || null,
      regionCode: input.regionCode?.trim().toUpperCase() || null,
      customerScope: input.customerScope?.trim() || null,
      asOfDate: asOfDateIso,
      method: 'rule_engine' as const,
      providerRatePercent,
    },
    override: {
      applied: false,
      overrideId: null,
      reason: null,
    },
  };

  try {
    if (overrideRatePercent !== null) {
      const amount = taxableIncome.mul(overrideRatePercent).div(100);
      return {
        amount: serializeMoney(amount),
        ratePercent: overrideRatePercent,
        basis: {
          ...baseResult.basis,
          method: 'manual_override',
        },
        override: {
          applied: true,
          overrideId: input.overrideId || null,
          reason: input.overrideReason || 'Manual tax rate override provided',
        },
        disclaimerKey: 'MANUAL_OVERRIDE',
      };
    }

    if (hasCountryRuleEngine && resolutionMode !== 'prefer_provider_rate') {
      const fromRules = estimateIndiaIncomeTaxFromRules(taxableIncome, {
        asOfDate: input.asOfDate,
        fiscalYear: input.fiscalYear,
      });
      return {
        amount: serializeMoney(fromRules.amount),
        ratePercent: fromRules.ratePercent,
        basis: {
          ...baseResult.basis,
          method: 'rule_engine',
        },
        override: baseResult.override,
        disclaimerKey: 'AUTO_RULE',
      };
    }

    if (providerRatePercent !== null) {
      const amount = taxableIncome.mul(providerRatePercent).div(100);
      return {
        amount: serializeMoney(amount),
        ratePercent: providerRatePercent,
        basis: {
          ...baseResult.basis,
          method: 'provider_rate',
        },
        override: baseResult.override,
        disclaimerKey: 'PROVIDER_RATE',
      };
    }

    const amount = taxableIncome.mul(DEFAULT_FALLBACK_RATE);
    return {
      amount: serializeMoney(amount),
      ratePercent: DEFAULT_FALLBACK_RATE * 100,
      basis: {
        ...baseResult.basis,
        method: 'fallback',
      },
      override: baseResult.override,
      disclaimerKey: 'FALLBACK_RULE',
    };
  } catch {
    const amount = taxableIncome.mul(DEFAULT_FALLBACK_RATE);
    return {
      amount: serializeMoney(amount),
      ratePercent: DEFAULT_FALLBACK_RATE * 100,
      basis: {
        ...baseResult.basis,
        method: 'fallback',
      },
      override: baseResult.override,
      disclaimerKey: 'FALLBACK_RULE',
    };
  }
};
