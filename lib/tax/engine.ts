import { randomUUID } from 'crypto';

import { selectTaxProvider, type TaxWorkspaceConfig } from '@/lib/tax/providers';
import { toTaxDeductionBuckets, estimateTaxFromRules, type TaxDeductionBucket } from '@/lib/tax/rules';

export interface TaxBasisPayload {
  source: 'manual_override' | 'workspace_rule' | 'provider_adapter' | 'rules_fallback';
  countryCode: string | null;
  regionCode: string | null;
  regime: string;
  ruleVersion: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  estimateModel: string;
  traceId: string;
}

export interface TaxEngineInput {
  taxableAmount: number;
  countryCode?: string | null;
  regionCode?: string | null;
  traceId?: string;
  manualOverrideRate?: number | null;
  workspaceRuleRate?: number | null;
  workspaceConfig?: TaxWorkspaceConfig | null;
}

export interface TaxEngineResult {
  rate: number;
  buckets: TaxDeductionBucket[];
  basis: TaxBasisPayload;
}

function normalizeRate(rate: number | null | undefined): number | null {
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
    return null;
  }

  if (rate > 1) {
    return Math.round(rate) / 100;
  }

  return rate;
}

export async function resolveTax(input: TaxEngineInput): Promise<TaxEngineResult> {
  const traceId = input.traceId ?? randomUUID();
  const countryCode = (input.countryCode || null)?.toUpperCase() ?? null;
  const regionCode = input.regionCode ?? null;

  const normalizedManualOverride = normalizeRate(input.manualOverrideRate);
  if (normalizedManualOverride !== null) {
    return {
      rate: normalizedManualOverride,
      buckets: toTaxDeductionBuckets(input.taxableAmount, normalizedManualOverride),
      basis: {
        source: 'manual_override',
        countryCode,
        regionCode,
        regime: 'manual',
        ruleVersion: 'manual-v1',
        effectiveFrom: null,
        effectiveTo: null,
        estimateModel: 'manual-override-rate',
        traceId,
      },
    };
  }

  const normalizedWorkspaceRule = normalizeRate(input.workspaceRuleRate);
  if (normalizedWorkspaceRule !== null) {
    return {
      rate: normalizedWorkspaceRule,
      buckets: toTaxDeductionBuckets(input.taxableAmount, normalizedWorkspaceRule),
      basis: {
        source: 'workspace_rule',
        countryCode,
        regionCode,
        regime: 'workspace',
        ruleVersion: 'workspace-v1',
        effectiveFrom: null,
        effectiveTo: null,
        estimateModel: 'workspace-configured-rate',
        traceId,
      },
    };
  }

  const provider = selectTaxProvider(input.workspaceConfig);
  const providerResult = await provider.getRate({
    countryCode,
    regionCode,
    taxableAmount: input.taxableAmount,
    traceId,
  });

  const normalizedProviderRate = normalizeRate(providerResult.rate);
  if (normalizedProviderRate !== null) {
    return {
      rate: normalizedProviderRate,
      buckets: providerResult.buckets,
      basis: {
        source: 'provider_adapter',
        countryCode,
        regionCode,
        regime: providerResult.regime,
        ruleVersion: providerResult.metadata.ruleVersion,
        effectiveFrom: providerResult.effectiveFrom,
        effectiveTo: providerResult.effectiveTo,
        estimateModel: providerResult.metadata.estimateModel,
        traceId,
      },
    };
  }

  const fallbackRate = estimateTaxFromRules({
    countryCode,
    regionCode,
    taxableAmount: input.taxableAmount,
  });

  return {
    rate: fallbackRate,
    buckets: toTaxDeductionBuckets(input.taxableAmount, fallbackRate),
    basis: {
      source: 'rules_fallback',
      countryCode,
      regionCode,
      regime: fallbackRate > 0 ? 'standard' : 'none',
      ruleVersion: 'rules-v1',
      effectiveFrom: null,
      effectiveTo: null,
      estimateModel: 'country-default-rate',
      traceId,
    },
  };
}
