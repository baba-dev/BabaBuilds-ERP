import fallbackRatesJson from '@/lib/tax/fallback-rates.json';

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

export const COUNTRY_DEFAULT_TAX_RATES = toTaxResolverInputMap(FALLBACK_TAX_RULES);
