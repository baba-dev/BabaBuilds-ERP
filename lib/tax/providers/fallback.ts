import { estimateTaxFromRules, toTaxDeductionBuckets } from '@/lib/tax/rules';
import type { ProviderMetadata, TaxProvider, TaxProviderInput, TaxProviderResult } from '@/lib/tax/providers/types';

const FALLBACK_METADATA: ProviderMetadata = {
  mode: 'free_fallback',
  name: 'rules-fallback-provider',
  ruleVersion: 'rules-v1',
  estimateModel: 'country-default-rate',
};

export class FallbackTaxProvider implements TaxProvider {
  getMetadata(): ProviderMetadata {
    return FALLBACK_METADATA;
  }

  async getRate(input: TaxProviderInput): Promise<TaxProviderResult> {
    const rate = estimateTaxFromRules({
      countryCode: input.countryCode,
      regionCode: input.regionCode,
      taxableAmount: input.taxableAmount,
    });

    return {
      rate,
      regime: rate > 0 ? 'standard' : 'none',
      effectiveFrom: null,
      effectiveTo: null,
      buckets: toTaxDeductionBuckets(input.taxableAmount, rate),
      source: 'rules_fallback',
      metadata: this.getMetadata(),
    };
  }
}
