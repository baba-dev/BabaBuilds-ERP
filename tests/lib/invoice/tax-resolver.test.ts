import { describe, expect, it } from 'vitest';
import { resolveTaxRate } from '@/lib/invoice/tax-resolver';

describe('invoice tax resolver', () => {
  it('applies jurisdiction default for US state and local fallback', () => {
    const result = resolveTaxRate({
      countryCode: 'US',
      regionCode: 'US-CA',
      isTaxExempt: false,
    });

    expect(result.source).toBe('jurisdiction_default');
    expect(result.taxRate).toBe(0.0925);
  });

  it('always allows user correction via override', () => {
    const result = resolveTaxRate({
      countryCode: 'DE',
      isTaxExempt: false,
      taxRateOverride: 7,
    });

    expect(result.source).toBe('override');
    expect(result.taxRate).toBe(0.07);
  });
});
