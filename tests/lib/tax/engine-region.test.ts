import { describe, expect, it } from 'vitest';
import { estimateTax, TaxEngineValidationError } from '@/lib/tax/engine';

describe('tax engine region-aware resolution', () => {
  it('uses regionCode for provider rate and keeps serviceScope semantic', () => {
    const result = estimateTax({ countryCode: 'US', regionCode: 'US-CA', serviceScope: 'consulting_services', revenue: '1000', deductions: '0', resolutionMode: 'prefer_provider_rate' });
    expect(result.basis.method).toBe('provider_rate');
    expect(result.basis.serviceScope).toBe('consulting_services');
    expect(result.basis.regionCode).toBe('US-CA');
    expect(result.ratePercent).toBe(9.25);
    expect(result.amount).toBe('92.50');
  });
});

describe('india fiscal-year-aware income tax', () => {
  it('FY2024-25 @10L -> gross 50k, cess 2k, final 52k', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2024-25', revenue: '1000000' });
    expect(r.components.grossSlabTax).toBe('50000.00'); expect(r.components.rebate).toBe('0.00'); expect(r.components.cess).toBe('2000.00'); expect(r.amount).toBe('52000.00');
  });
  it('FY2024-25 @7L -> rebate to zero', () => { const r = estimateTax({ countryCode: 'IN', fiscalYear: 'FY 2024-25', revenue: '700000' }); expect(r.components.grossSlabTax).toBe('20000.00'); expect(r.components.rebate).toBe('20000.00'); expect(r.amount).toBe('0.00'); });
  it('FY2025-26 @7L -> gross 15k, rebate 15k, final 0', () => { const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025/26', revenue: '700000' }); expect(r.components.grossSlabTax).toBe('15000.00'); expect(r.components.rebate).toBe('15000.00'); expect(r.amount).toBe('0.00'); });
  it('FY2025-26 @12L -> gross 60k, rebate 60k, final 0', () => { const r = estimateTax({ countryCode: 'IN', fiscalYear: 'FY2025-26', revenue: '1200000' }); expect(r.components.grossSlabTax).toBe('60000.00'); expect(r.components.rebate).toBe('60000.00'); expect(r.amount).toBe('0.00'); });
  it('FY2025-26 @12.1L -> marginal relief and cess', () => { const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '1210000' }); expect(r.components.grossSlabTax).toBe('61500.00'); expect(r.components.taxAfterRebate).toBe('10000.00'); expect(r.components.finalTaxPayable).toBe('10400.00'); });
  it('FY2025-26 salaried 12.75L with std deduction -> final 0', () => { const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '1275000', isSalaried: true, applyStandardDeduction: true }); expect(r.components.standardDeductionAmount).toBe('75000.00'); expect(r.components.normalTaxableIncome).toBe('1200000.00'); expect(r.amount).toBe('0.00'); });
  it('FY2025-26 @13L gross 75k', () => { const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '1300000' }); expect(r.components.grossSlabTax).toBe('75000.00'); });
  it('special-rate income is rejected until supported', () => { expect(() => estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '1200000', specialRateIncome: '200000' })).toThrow(TaxEngineValidationError); });
  it('invalid/unsupported fiscal years error', () => { expect(() => estimateTax({ countryCode: 'IN', fiscalYear: 'bad input', revenue: 1000 })).toThrow(TaxEngineValidationError); expect(() => estimateTax({ countryCode: 'IN', fiscalYear: '2023-24', revenue: 1000 })).toThrow(TaxEngineValidationError); });
  it('future fiscal year carried forward with warning', () => { const r = estimateTax({ countryCode: 'IN', fiscalYear: '2027-28', revenue: 1000 }); expect(r.basis.fiscalYear).toBe('2027-28'); expect(r.basis.assessmentYear).toBe('2028-29'); expect(r.basis.sourceRuleFiscalYear).toBe('2025-26'); expect(r.basis.sourceRuleAssessmentYear).toBe('2026-27'); expect(r.basis.ruleStatus).toBe('carried_forward_latest_known'); expect(r.warnings.some((w) => w.includes('carried-forward'))).toBe(true); });
  it('IN GST does not use income tax rule engine', () => { const r = estimateTax({ countryCode: 'IN', taxType: 'gst', revenue: 100000 }); expect(r.basis.method).not.toBe('rule_engine'); });
  it('manual override still wins', () => { const r = estimateTax({ countryCode: 'IN', revenue: '1000000', overrideRatePercent: 22 }); expect(r.basis.method).toBe('manual_override'); expect(r.amount).toBe('220000.00'); });
  it('unknown country still fallback', () => { const r = estimateTax({ revenue: '1000000' }); expect(r.basis.method).toBe('fallback'); });
});
