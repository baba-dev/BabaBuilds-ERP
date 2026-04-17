import { describe, expect, it } from 'vitest';
import { runPayrollCalculation, type PayrollCalcInput } from './calc-engine';

const baseInput: PayrollCalcInput = {
  periodStart: '2026-04-01',
  periodEnd: '2026-04-30',
  unpaidLeaveDays: 0,
  earnings: [
    { code: 'BASE', label: 'Base Salary', amount: 3000, prorate: true },
    { code: 'BONUS', label: 'Fixed Bonus', amount: 500, prorate: false },
  ],
  preTaxDeductions: [{ code: 'RET401K', label: '401(k)', amount: 200, prorate: true }],
  rules: {
    version: 'us-ca-demo-v2026.04.01',
    employeeWithholdingRates: {
      incomeTaxRate: 0.1,
      socialSecurityRate: 0.05,
      socialSecurityWageCap: 2500,
    },
    employerBurdenRates: {
      socialSecurityRate: 0.06,
      insuranceRate: 0.02,
    },
  },
};

describe('runPayrollCalculation', () => {
  it('is repeatable for identical inputs', () => {
    const run1 = runPayrollCalculation(baseInput);
    const run2 = runPayrollCalculation(baseInput);

    expect(run1).toEqual(run2);
  });

  it('handles mid-period join, unpaid leave, and partial period proration', () => {
    const result = runPayrollCalculation({
      ...baseInput,
      employmentStart: '2026-04-11',
      employmentEnd: '2026-04-25',
      unpaidLeaveDays: 2,
    });

    expect(result.period.totalDays).toBe(30);
    expect(result.period.eligibleDays).toBe(15);
    expect(result.period.payableDays).toBe(13);
    expect(result.period.prorationFactor).toBe(13 / 30);

    expect(result.totals.grossEarnings).toBe(1800);
    expect(result.totals.preTaxDeductions).toBe(86.67);
    expect(result.totals.taxableBase).toBe(1713.33);
    expect(result.totals.statutoryWithholdings).toBe(257);
    expect(result.totals.employerBurden).toBe(137.07);
    expect(result.totals.netPay).toBe(1456.33);
  });

  it('supports configurable rounding policy for deterministic payroll rounding', () => {
    const halfUp = runPayrollCalculation({
      ...baseInput,
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      earnings: [{ code: 'BASE', label: 'Base Salary', amount: 100.005, prorate: false }],
      preTaxDeductions: [],
      rules: {
        ...baseInput.rules,
        employeeWithholdingRates: {
          ...baseInput.rules.employeeWithholdingRates,
          incomeTaxRate: 0,
          socialSecurityRate: 0,
        },
        employerBurdenRates: {
          socialSecurityRate: 0,
          insuranceRate: 0,
        },
      },
      roundingPolicy: 'HALF_UP',
    });

    const down = runPayrollCalculation({
      ...baseInput,
      periodStart: '2026-02-01',
      periodEnd: '2026-02-28',
      earnings: [{ code: 'BASE', label: 'Base Salary', amount: 100.005, prorate: false }],
      preTaxDeductions: [],
      rules: {
        ...baseInput.rules,
        employeeWithholdingRates: {
          ...baseInput.rules.employeeWithholdingRates,
          incomeTaxRate: 0,
          socialSecurityRate: 0,
        },
        employerBurdenRates: {
          socialSecurityRate: 0,
          insuranceRate: 0,
        },
      },
      roundingPolicy: 'DOWN',
    });

    expect(halfUp.totals.grossEarnings).toBe(100.01);
    expect(down.totals.grossEarnings).toBe(100);
  });

  it('captures explainability metadata and rule-set versioning', () => {
    const result = runPayrollCalculation(baseInput);

    expect(result.ruleSetVersion).toBe('us-ca-demo-v2026.04.01');

    const taxableBaseLine = result.lineItems.find((line) => line.code === 'taxable_base');
    expect(taxableBaseLine).toBeDefined();
    expect(taxableBaseLine?.rule.version).toBe('us-ca-demo-v2026.04.01');
    expect(taxableBaseLine?.formula).toBe('max(0, grossEarnings - preTaxDeductions)');
    expect(taxableBaseLine?.inputs.grossEarnings).toBe(3500);
    expect(taxableBaseLine?.inputs.preTaxDeductions).toBe(200);
  });
});
