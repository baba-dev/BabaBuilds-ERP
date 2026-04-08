import { toTaxDeductionBuckets } from '@/lib/tax/rules';
import type { ProviderMetadata, TaxProvider, TaxProviderInput, TaxProviderResult } from '@/lib/tax/providers/types';

const STRIPE_METADATA: ProviderMetadata = {
  mode: 'stripe_tax',
  name: 'stripe-tax-provider',
  ruleVersion: 'stripe-preview',
  estimateModel: 'stripe-tax-api',
};

export class StripeTaxProvider implements TaxProvider {
  getMetadata(): ProviderMetadata {
    return STRIPE_METADATA;
  }

  async getRate(input: TaxProviderInput): Promise<TaxProviderResult> {
    const isEnabled = process.env.FEATURE_TAX_STRIPE === 'true';

    if (!isEnabled) {
      return {
        rate: 0,
        regime: 'pending_provider_setup',
        effectiveFrom: null,
        effectiveTo: null,
        buckets: toTaxDeductionBuckets(input.taxableAmount, 0),
        source: 'provider_adapter',
        metadata: this.getMetadata(),
      };
    }

    return {
      rate: 0,
      regime: 'stripe_tax_not_implemented',
      effectiveFrom: null,
      effectiveTo: null,
      buckets: toTaxDeductionBuckets(input.taxableAmount, 0),
      source: 'provider_adapter',
      metadata: this.getMetadata(),
    };
  }
}
