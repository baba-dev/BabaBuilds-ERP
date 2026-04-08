export interface TaxRulesInput {
  countryCode?: string | null;
  regionCode?: string | null;
  taxableAmount: number;
}

export interface TaxDeductionBucket {
  label: string;
  amount: number;
}

const COUNTRY_RULE_RATES: Record<string, number> = {
  IN: 0.18,
  AE: 0.05,
  SA: 0.15,
  GB: 0.2,
  DE: 0.19,
  FR: 0.2,
  ES: 0.21,
  IT: 0.22,
  NL: 0.21,
  IE: 0.23,
  AU: 0.1,
  NZ: 0.15,
  SG: 0.09,
  ZA: 0.15,
  CA: 0.05,
  US: 0.07,
};

export function estimateTaxFromRules(input: TaxRulesInput): number {
  const normalizedCountryCode = (input.countryCode || '').toUpperCase();
  return COUNTRY_RULE_RATES[normalizedCountryCode] ?? 0;
}

export function toTaxDeductionBuckets(taxableAmount: number, rate: number): TaxDeductionBucket[] {
  const safeAmount = Number.isFinite(taxableAmount) ? Math.max(0, taxableAmount) : 0;
  const safeRate = Number.isFinite(rate) ? Math.max(0, rate) : 0;

  return [
    {
      label: 'estimated_tax',
      amount: Number((safeAmount * safeRate).toFixed(2)),
    },
  ];
}
