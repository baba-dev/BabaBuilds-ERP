import { describe, expect, it } from 'vitest';
import { estimateTax, TaxEngineValidationError } from './engine';

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
  it('rejects unsupported and invalid cases', () => {
    expect(() => estimateTax({ countryCode: 'IN', taxRegime: 'old', revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', taxpayerType: 'company', revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', taxpayerType: 'firm', revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', specialRateIncome: 1, revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', fiscalYear: 'bad input', revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', fiscalYear: '2023-24', revenue: 1000 })).toThrow(TaxEngineValidationError);
    expect(() => estimateTax({ countryCode: 'IN', asOfDate: 'bad-date', revenue: 1000 })).toThrow(TaxEngineValidationError);
  });
});
