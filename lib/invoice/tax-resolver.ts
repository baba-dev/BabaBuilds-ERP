export interface ResolveTaxRateInput {
  countryCode?: string | null;
  isTaxExempt: boolean;
  serviceTaxRates?: Array<number | null | undefined>;
  workspaceDefaultTaxRate?: number | null;
  taxRateOverride?: number | null;
}

export interface TaxRateResolution {
  taxRate: number;
  taxMode: 'taxable' | 'exempt';
  source: 'override' | 'service_code' | 'workspace_default' | 'country_default' | 'exempt';
  requiresUserInput?: boolean;
  reason?: 'MISSING_RATE' | 'MIXED_SERVICE_RATES';
  candidates?: number[];
}

export const COUNTRY_DEFAULT_TAX_RATES: Record<string, number> = {
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
};

export function normalizeTaxRate(raw: unknown): number | null {
  if (raw === null || raw === undefined || raw === '') return null;
  const value = Number(raw);
  if (Number.isNaN(value) || value < 0) return null;
  if (value > 1) return Math.round(value) / 100;
  return value;
}

export function resolveTaxRate({
  countryCode,
  isTaxExempt,
  serviceTaxRates = [],
  workspaceDefaultTaxRate,
  taxRateOverride,
}: ResolveTaxRateInput): TaxRateResolution {
  if (isTaxExempt) {
    return { taxRate: 0, taxMode: 'exempt', source: 'exempt' };
  }

  const normalizedOverride = normalizeTaxRate(taxRateOverride);
  if (normalizedOverride !== null) {
    return { taxRate: normalizedOverride, taxMode: 'taxable', source: 'override' };
  }

  const normalizedServiceRates = Array.from(
    new Set(
      serviceTaxRates
        .map((rate) => normalizeTaxRate(rate))
        .filter((rate): rate is number => rate !== null)
    )
  );

  if (normalizedServiceRates.length === 1) {
    return { taxRate: normalizedServiceRates[0], taxMode: 'taxable', source: 'service_code' };
  }

  if (normalizedServiceRates.length > 1) {
    return {
      taxRate: 0,
      taxMode: 'taxable',
      source: 'service_code',
      requiresUserInput: true,
      reason: 'MIXED_SERVICE_RATES',
      candidates: normalizedServiceRates,
    };
  }

  const normalizedWorkspaceDefault = normalizeTaxRate(workspaceDefaultTaxRate);
  if (normalizedWorkspaceDefault !== null) {
    return { taxRate: normalizedWorkspaceDefault, taxMode: 'taxable', source: 'workspace_default' };
  }

  const normalizedCountryCode = (countryCode || '').toUpperCase();
  const countryRate = COUNTRY_DEFAULT_TAX_RATES[normalizedCountryCode];
  if (typeof countryRate === 'number') {
    return { taxRate: countryRate, taxMode: 'taxable', source: 'country_default' };
  }

  return {
    taxRate: 0,
    taxMode: 'taxable',
    source: 'country_default',
    requiresUserInput: true,
    reason: 'MISSING_RATE',
    candidates: [],
  };
}
