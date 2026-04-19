import fallbackRatesJson from '@/lib/tax/fallback-rates.json';
import { COMPLIANCE_PACK_DEFAULT_RATES, resolveJurisdictionalRate } from '@/lib/tax/compliance-packs';

export interface TaxRuleSourceMetadata {
  sourceName: string;
  sourceUrl: string;
  fetchedAt: string;
  licenseNotes: string;
}

export interface TaxRuleInput extends TaxRuleSourceMetadata {
  countryCode: string;
  rate: number;
}

export interface TaxDeductionBucket {
  label: string;
  amount: number;
  rate: number;
  tax: number;
}

export type TaxRuleRecord = Record<string, TaxRuleInput>;

const normalizeCountryCode = (countryCode: string) => countryCode.trim().toUpperCase();

export const FALLBACK_TAX_RULES: TaxRuleInput[] = (fallbackRatesJson as TaxRuleInput[])
  .map((rule) => ({
    ...rule,
    countryCode: normalizeCountryCode(rule.countryCode),
  }))
  .filter((rule) => Number.isFinite(rule.rate) && rule.rate >= 0);

export const FALLBACK_TAX_RULES_BY_COUNTRY: TaxRuleRecord = FALLBACK_TAX_RULES.reduce<TaxRuleRecord>((acc, rule) => {
  acc[rule.countryCode] = rule;
  return acc;
}, {});

export function toTaxResolverInputMap(rules: TaxRuleInput[]): Record<string, number> {
  return rules.reduce<Record<string, number>>((acc, rule) => {
    acc[normalizeCountryCode(rule.countryCode)] = rule.rate;
    return acc;
  }, {});
}

export const COUNTRY_DEFAULT_TAX_RATES: Record<string, number> = {
  ...toTaxResolverInputMap(FALLBACK_TAX_RULES),
  ...COMPLIANCE_PACK_DEFAULT_RATES,
};

export function estimateTaxFromRules(input: { countryCode?: string | null; regionCode?: string | null; taxableAmount?: number }): number {
  const normalizedCountryCode = normalizeCountryCode(input.countryCode ?? '');
  if (!normalizedCountryCode) return 0;

  const jurisdictionResolution = resolveJurisdictionalRate({
    countryCode: normalizedCountryCode,
    regionCode: input.regionCode,
    includeUSLocalDefault: true,
  });

  if (jurisdictionResolution.rate > 0 || jurisdictionResolution.jurisdictionCode) {
    return jurisdictionResolution.rate;
  }

  const rate = COUNTRY_DEFAULT_TAX_RATES[normalizedCountryCode];
  return typeof rate === 'number' ? rate : 0;
}

export function toTaxDeductionBuckets(taxableAmount: number, rate: number): TaxDeductionBucket[] {
  const safeAmount = Number.isFinite(taxableAmount) ? Math.max(0, taxableAmount) : 0;
  const safeRate = Number.isFinite(rate) ? Math.max(0, rate) : 0;

  return [
    {
      label: 'Standard taxable base',
      amount: safeAmount,
      rate: safeRate,
      tax: safeAmount * safeRate,
    },
  ];
}
