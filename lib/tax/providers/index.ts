import { FallbackTaxProvider } from '@/lib/tax/providers/fallback';
import { StripeTaxProvider } from '@/lib/tax/providers/stripe-tax';
import type { TaxProvider } from '@/lib/tax/providers/types';

export type TaxEngineMode = 'free_fallback' | 'stripe_tax';

export interface TaxWorkspaceConfig {
  TAX_ENGINE_MODE?: TaxEngineMode | null;
}

export function selectTaxProvider(workspaceConfig?: TaxWorkspaceConfig | null): TaxProvider {
  const mode = workspaceConfig?.TAX_ENGINE_MODE ?? 'free_fallback';

  if (mode === 'stripe_tax') {
    return new StripeTaxProvider();
  }

  return new FallbackTaxProvider();
}
