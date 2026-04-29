import { describe, expect, it } from 'vitest';
import { estimateTax, TaxEngineValidationError } from './engine';

describe('India tax engine', () => {
  it('FY 2024-25 income 10L computes gross 50k and final 52k with cess', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2024-25', revenue: '1000000', deductions: '0' });
    expect(r.components.grossSlabTax).toBe('50000.00');
    expect(r.components.rebate).toBe('0.00');
    expect(r.components.cess).toBe('2000.00');
    expect(r.components.finalTaxPayable).toBe('52000.00');
    expect(r.amount).toBe('52000.00');
  });

  it('FY 2024-25 income 7L resident individual gets full rebate and nil final tax', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: 'FY 2024-25', revenue: '700000' });
    expect(r.components.grossSlabTax).toBe('20000.00');
    expect(r.components.rebate).toBe('20000.00');
    expect(r.components.finalTaxPayable).toBe('0.00');
  });

  it('FY 2025-26 income 7L has gross 15k, rebate 15k, final 0', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025/26', revenue: '700000' });
    expect(r.components.grossSlabTax).toBe('15000.00');
    expect(r.components.rebate).toBe('15000.00');
    expect(r.amount).toBe('0.00');
  });

  it('FY 2025-26 income 12L has gross 60k, rebate 60k, final 0', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: 'FY2025-26', revenue: '1200000' });
    expect(r.components.grossSlabTax).toBe('60000.00');
    expect(r.components.rebate).toBe('60000.00');
    expect(r.amount).toBe('0.00');
  });

  it('FY 2025-26 income 12.1L applies marginal relief and cess', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '1210000' });
    expect(r.components.grossSlabTax).toBe('61500.00');
    expect(r.components.marginalRelief).toBe('51500.00');
    expect(r.components.taxAfterRebate).toBe('10000.00');
    expect(r.components.finalTaxPayable).toBe('10400.00');
  });

  it('FY 2025-26 salaried 12.75L with standard deduction gets nil final tax', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '1275000', isSalaried: true, applyStandardDeduction: true });
    expect(r.components.standardDeductionAmount).toBe('75000.00');
    expect(r.components.normalTaxableIncome).toBe('1200000.00');
    expect(r.components.rebate).toBe('60000.00');
    expect(r.components.finalTaxPayable).toBe('0.00');
  });

  it('FY 2025-26 income 13L gross slab tax 75k', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '1300000' });
    expect(r.components.grossSlabTax).toBe('75000.00');
  });

  it('special-rate income does not zero out final tax and adds warning', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '1200000', specialRateIncome: '200000' });
    expect(r.warnings.some((w) => w.includes('Special-rate income'))).toBe(true);
    expect(r.amount).not.toBe('0.00');
  });

  it('invalid and unsupported fiscal year throw validation errors', () => {
    expect(() => estimateTax({ countryCode: 'IN', fiscalYear: 'bad input', revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', fiscalYear: '2023-24', revenue: 1000 })).toThrow(TaxEngineValidationError);
  });

  it('future FY is carried forward with warning', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2027-28', revenue: 1000 });
    expect(r.basis.ruleStatus).toBe('carried_forward_latest_known');
    expect(r.warnings.some((w) => w.includes('carried-forward'))).toBe(true);
  });

  it('IN GST does not use income-tax rule engine', () => {
    const r = estimateTax({ countryCode: 'IN', taxType: 'gst', revenue: 100000 });
    expect(r.basis.method).not.toBe('rule_engine');
  });
});
