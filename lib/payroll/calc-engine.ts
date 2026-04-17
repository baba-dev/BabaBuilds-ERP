export type RoundingPolicy = 'HALF_UP' | 'DOWN' | 'BANKERS';

export type RuleReference = {
  key: string;
  version: string;
};

export type RuleSet = {
  version: string;
  employeeWithholdingRates: {
    incomeTaxRate: number;
    socialSecurityRate: number;
    socialSecurityWageCap?: number;
  };
  employerBurdenRates: {
    socialSecurityRate: number;
    insuranceRate: number;
  };
};

export type PayLineType =
  | 'earning'
  | 'pre_tax_deduction'
  | 'employee_withholding'
  | 'employer_burden'
  | 'derived';

export type ExplainabilityLineItem = {
  code: string;
  label: string;
  type: PayLineType;
  amount: number;
  formula: string;
  inputs: Record<string, number | string | boolean | undefined>;
  rule: RuleReference;
};

export type PayrollLineInput = {
  code: string;
  label: string;
  amount: number;
  prorate?: boolean;
};

export type PayrollCalcInput = {
  periodStart: string;
  periodEnd: string;
  employmentStart?: string;
  employmentEnd?: string;
  unpaidLeaveDays?: number;
  roundingPolicy?: RoundingPolicy;
  currencyScale?: number;
  earnings: PayrollLineInput[];
  preTaxDeductions: PayrollLineInput[];
  rules: RuleSet;
};

export type PayrollCalcResult = {
  totals: {
    grossEarnings: number;
    preTaxDeductions: number;
    taxableBase: number;
    statutoryWithholdings: number;
    employerBurden: number;
    netPay: number;
  };
  period: {
    totalDays: number;
    eligibleDays: number;
    payableDays: number;
    prorationFactor: number;
  };
  roundingPolicy: RoundingPolicy;
  ruleSetVersion: string;
  lineItems: ExplainabilityLineItem[];
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max);

const toUtcDate = (isoDate: string): Date => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1));
};

const dayDiffInclusive = (start: Date, end: Date): number => {
  if (end.getTime() < start.getTime()) return 0;
  return Math.floor((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
};

const overlapDays = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): number => {
  const start = new Date(Math.max(aStart.getTime(), bStart.getTime()));
  const end = new Date(Math.min(aEnd.getTime(), bEnd.getTime()));
  return dayDiffInclusive(start, end);
};

const roundByPolicy = (value: number, scale: number, policy: RoundingPolicy): number => {
  const factor = 10 ** scale;
  const scaled = value * factor;

  if (policy === 'DOWN') {
    return Math.trunc(scaled) / factor;
  }

  if (policy === 'BANKERS') {
    const floor = Math.floor(scaled);
    const fraction = scaled - floor;

    if (fraction > 0.5) return (floor + 1) / factor;
    if (fraction < 0.5) return floor / factor;
    return floor % 2 === 0 ? floor / factor : (floor + 1) / factor;
  }

  return Math.round(scaled) / factor;
};

const sum = (values: number[]): number => values.reduce((acc, next) => acc + next, 0);

const prorateAmount = (amount: number, prorationFactor: number, prorate: boolean): number => {
  if (!prorate) return amount;
  return amount * prorationFactor;
};

export const runPayrollCalculation = (input: PayrollCalcInput): PayrollCalcResult => {
  const roundingPolicy = input.roundingPolicy ?? 'HALF_UP';
  const scale = input.currencyScale ?? 2;

  const periodStart = toUtcDate(input.periodStart);
  const periodEnd = toUtcDate(input.periodEnd);
  const employmentStart = input.employmentStart ? toUtcDate(input.employmentStart) : periodStart;
  const employmentEnd = input.employmentEnd ? toUtcDate(input.employmentEnd) : periodEnd;

  const totalDays = dayDiffInclusive(periodStart, periodEnd);
  const eligibleDays = overlapDays(periodStart, periodEnd, employmentStart, employmentEnd);
  const unpaidLeaveDays = clamp(input.unpaidLeaveDays ?? 0, 0, eligibleDays);
  const payableDays = Math.max(0, eligibleDays - unpaidLeaveDays);
  const prorationFactor = totalDays === 0 ? 0 : payableDays / totalDays;

  const lineItems: ExplainabilityLineItem[] = [];

  const earningAmounts = input.earnings.map((line) => {
    const effectiveAmount = roundByPolicy(
      prorateAmount(line.amount, prorationFactor, line.prorate ?? true),
      scale,
      roundingPolicy,
    );

    lineItems.push({
      code: line.code,
      label: line.label,
      type: 'earning',
      amount: effectiveAmount,
      formula: line.prorate === false ? 'amount' : 'amount × prorationFactor',
      inputs: {
        amount: line.amount,
        prorate: line.prorate ?? true,
        prorationFactor,
      },
      rule: { key: 'earnings.proration', version: input.rules.version },
    });

    return effectiveAmount;
  });

  const preTaxDeductionAmounts = input.preTaxDeductions.map((line) => {
    const effectiveAmount = roundByPolicy(
      prorateAmount(line.amount, prorationFactor, line.prorate ?? true),
      scale,
      roundingPolicy,
    );

    lineItems.push({
      code: line.code,
      label: line.label,
      type: 'pre_tax_deduction',
      amount: effectiveAmount,
      formula: line.prorate === false ? 'amount' : 'amount × prorationFactor',
      inputs: {
        amount: line.amount,
        prorate: line.prorate ?? true,
        prorationFactor,
      },
      rule: { key: 'deductions.proration', version: input.rules.version },
    });

    return effectiveAmount;
  });

  const grossEarnings = roundByPolicy(sum(earningAmounts), scale, roundingPolicy);
  const preTaxDeductions = roundByPolicy(sum(preTaxDeductionAmounts), scale, roundingPolicy);
  const taxableBase = roundByPolicy(Math.max(0, grossEarnings - preTaxDeductions), scale, roundingPolicy);

  lineItems.push({
    code: 'taxable_base',
    label: 'Taxable Base',
    type: 'derived',
    amount: taxableBase,
    formula: 'max(0, grossEarnings - preTaxDeductions)',
    inputs: { grossEarnings, preTaxDeductions },
    rule: { key: 'taxable_base.default', version: input.rules.version },
  });

  const taxableForSocialSecurity =
    input.rules.employeeWithholdingRates.socialSecurityWageCap === undefined
      ? taxableBase
      : Math.min(taxableBase, input.rules.employeeWithholdingRates.socialSecurityWageCap);

  const incomeTax = roundByPolicy(
    taxableBase * input.rules.employeeWithholdingRates.incomeTaxRate,
    scale,
    roundingPolicy,
  );

  const employeeSocialSecurity = roundByPolicy(
    taxableForSocialSecurity * input.rules.employeeWithholdingRates.socialSecurityRate,
    scale,
    roundingPolicy,
  );

  const statutoryWithholdings = roundByPolicy(incomeTax + employeeSocialSecurity, scale, roundingPolicy);

  lineItems.push({
    code: 'income_tax',
    label: 'Income Tax',
    type: 'employee_withholding',
    amount: incomeTax,
    formula: 'taxableBase × incomeTaxRate',
    inputs: {
      taxableBase,
      incomeTaxRate: input.rules.employeeWithholdingRates.incomeTaxRate,
    },
    rule: { key: 'withholding.income_tax', version: input.rules.version },
  });

  lineItems.push({
    code: 'employee_social_security',
    label: 'Employee Social Security',
    type: 'employee_withholding',
    amount: employeeSocialSecurity,
    formula: 'min(taxableBase, socialSecurityWageCap?) × socialSecurityRate',
    inputs: {
      taxableBase,
      socialSecurityWageCap: input.rules.employeeWithholdingRates.socialSecurityWageCap,
      socialSecurityRate: input.rules.employeeWithholdingRates.socialSecurityRate,
    },
    rule: { key: 'withholding.employee_social_security', version: input.rules.version },
  });

  const employerSocialSecurity = roundByPolicy(
    taxableForSocialSecurity * input.rules.employerBurdenRates.socialSecurityRate,
    scale,
    roundingPolicy,
  );

  const employerInsurance = roundByPolicy(
    taxableBase * input.rules.employerBurdenRates.insuranceRate,
    scale,
    roundingPolicy,
  );

  const employerBurden = roundByPolicy(employerSocialSecurity + employerInsurance, scale, roundingPolicy);

  lineItems.push({
    code: 'employer_social_security',
    label: 'Employer Social Security',
    type: 'employer_burden',
    amount: employerSocialSecurity,
    formula: 'min(taxableBase, socialSecurityWageCap?) × employerSocialSecurityRate',
    inputs: {
      taxableBase,
      socialSecurityWageCap: input.rules.employeeWithholdingRates.socialSecurityWageCap,
      employerSocialSecurityRate: input.rules.employerBurdenRates.socialSecurityRate,
    },
    rule: { key: 'employer.social_security', version: input.rules.version },
  });

  lineItems.push({
    code: 'employer_insurance',
    label: 'Employer Insurance',
    type: 'employer_burden',
    amount: employerInsurance,
    formula: 'taxableBase × employerInsuranceRate',
    inputs: {
      taxableBase,
      employerInsuranceRate: input.rules.employerBurdenRates.insuranceRate,
    },
    rule: { key: 'employer.insurance', version: input.rules.version },
  });

  const netPay = roundByPolicy(grossEarnings - preTaxDeductions - statutoryWithholdings, scale, roundingPolicy);

  return {
    totals: {
      grossEarnings,
      preTaxDeductions,
      taxableBase,
      statutoryWithholdings,
      employerBurden,
      netPay,
    },
    period: {
      totalDays,
      eligibleDays,
      payableDays,
      prorationFactor,
    },
    roundingPolicy,
    ruleSetVersion: input.rules.version,
    lineItems,
  };
};
