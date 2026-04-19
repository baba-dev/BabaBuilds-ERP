import { describe, expect, it } from 'vitest';
import { estimateTax } from '@/lib/tax/engine';

describe('tax engine region-aware resolution', () => {
  it('uses regionCode for provider rate and keeps serviceScope semantic', () => {
    const result = estimateTax({
      countryCode: 'US',
      regionCode: 'US-CA',
      serviceScope: 'consulting_services',
      revenue: '1000',
      deductions: '0',
      resolutionMode: 'prefer_provider_rate',
    });

    expect(result.basis.method).toBe('provider_rate');
    expect(result.basis.serviceScope).toBe('consulting_services');
    expect(result.basis.regionCode).toBe('US-CA');
    expect(result.ratePercent).toBe(9.25);
    expect(result.amount).toBe('92.50');
  });
});
