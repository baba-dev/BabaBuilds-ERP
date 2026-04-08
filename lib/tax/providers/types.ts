import type { TaxDeductionBucket } from '@/lib/tax/rules';

export interface TaxProviderInput {
  countryCode?: string | null;
  regionCode?: string | null;
  taxableAmount: number;
  traceId: string;
}

export interface ProviderMetadata {
  mode: 'free_fallback' | 'stripe_tax';
  name: string;
  ruleVersion: string;
  estimateModel: string;
}

export interface TaxProviderResult {
  rate: number;
  regime: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  buckets: TaxDeductionBucket[];
  source: 'provider_adapter' | 'rules_fallback';
  metadata: ProviderMetadata;
}

export interface TaxProvider {
  getRate(input: TaxProviderInput): Promise<TaxProviderResult>;
  getMetadata(): ProviderMetadata;
}
