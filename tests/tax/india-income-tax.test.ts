import { describe, expect, it } from 'vitest';
import { estimateTax, TaxEngineValidationError } from '@/lib/tax/engine';

describe('india tax engine validation and calculations', () => {
  it('FY 2024-25 income 10L', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2024-25', revenue: '1000000' });
    expect(r.components.grossSlabTax).toBe('50000.00');
    expect(r.components.rebate).toBe('0.00');
    expect(r.components.cess).toBe('2000.00');
    expect(r.components.finalTaxPayable).toBe('52000.00');
  });
  it('FY 2025-26 income 12.1L marginal relief', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '1210000' });
    expect(r.components.grossSlabTax).toBe('61500.00');
    expect(r.components.marginalRelief).toBe('51500.00');
    expect(r.components.taxAfterRebate).toBe('10000.00');
    expect(r.components.cess).toBe('400.00');
    expect(r.components.finalTaxPayable).toBe('10400.00');
  });
  it('FY 2026-27 carries the 2025-26 slabs and is flagged as carried forward', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2026-27', revenue: '1000000' });
    expect(r.components.grossSlabTax).toBe('40000.00');
    expect(r.components.rebate).toBe('40000.00');
    expect(r.components.finalTaxPayable).toBe('0.00');
    expect(r.basis.ruleStatus).toBe('carried_forward_latest_known');
    expect(r.warnings.join(' ')).toMatch(/Income-tax Act 2025/);
  });
  it('old regime: slabs, 87A rebate and cess', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', taxRegime: 'old', revenue: '1000000' });
    expect(r.components.grossSlabTax).toBe('112500.00');
    expect(r.components.cess).toBe('4500.00');
    expect(r.components.finalTaxPayable).toBe('117000.00');
    const rebated = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', taxRegime: 'old', revenue: '500000' });
    expect(rebated.components.finalTaxPayable).toBe('0.00');
    const senior = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', taxRegime: 'old', revenue: '600000', ageGroup: 'senior' });
    expect(senior.components.grossSlabTax).toBe('30000.00');
  });
  it('old regime deductions reduce taxable income', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', taxRegime: 'old', revenue: '1000000', deductions: '150000' });
    expect(r.basis.taxableIncome).toBe('850000.00');
    expect(r.components.grossSlabTax).toBe('82500.00');
  });
  it('surcharge applies above ₹50 lakh', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '6000000' });
    expect(r.components.grossSlabTax).toBe('1380000.00');
    expect(r.components.surcharge).toBe('138000.00');
    expect(r.components.finalTaxPayable).toBe('1578720.00');
  });
  it('surcharge marginal relief keeps tax growth within the extra income', () => {
    const at = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '5000000' });
    const above = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '5010000' });
    const extra = Number(above.components.finalTaxPayable) - Number(at.components.finalTaxPayable);
    expect(extra).toBeLessThanOrEqual(10000 * 1.04 + 0.01);
  });
  it('company and firm use flat rates', () => {
    const c = estimateTax({ countryCode: 'IN', taxpayerType: 'company', fiscalYear: '2025-26', revenue: '10000000' });
    expect(c.components.finalTaxPayable).toBe('2516800.00');
    const f = estimateTax({ countryCode: 'IN', taxpayerType: 'firm', fiscalYear: '2025-26', revenue: '1000000' });
    expect(f.components.finalTaxPayable).toBe('312000.00');
  });
  it('schedules advance tax and a single instalment for presumptive taxpayers', () => {
    const r = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', taxRegime: 'old', revenue: '2000000' });
    expect(r.advanceTax?.map((a) => a.cumulativePercent)).toEqual([15, 45, 75, 100]);
    expect(r.advanceTax?.[0].dueDate).toBe('2025-06-15');
    const p = estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', taxRegime: 'old', revenue: '2000000', presumptive: true });
    expect(p.advanceTax).toHaveLength(1);
    expect(estimateTax({ countryCode: 'IN', fiscalYear: '2025-26', revenue: '600000' }).advanceTax).toEqual([]);
  });
  it('rejects unsupported and invalid cases', () => {
    expect(() => estimateTax({ countryCode: 'IN', taxpayerType: 'other', revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', specialRateIncome: 1, revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', fiscalYear: 'bad input', revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', fiscalYear: '2023-24', revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', asOfDate: 'bad-date', revenue: 1000 })).toThrow(TaxEngineValidationError);
  });
});
