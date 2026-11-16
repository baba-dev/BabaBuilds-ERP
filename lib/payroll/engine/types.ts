/**
 * Pure payroll types. Amounts are rupees (two decimals). No database or framework imports here.
 */

export const PAYROLL_RULE_VERSION = 'IN-PAYROLL-2026-27-v1';

export type TaxRegime = 'new' | 'old';

/** One recurring monthly pay component from the employee's structure. */
export type SalaryComponent = {
  code: string;
  label: string;
  monthly: number;
  /** Counts towards taxable income. Reimbursements and some allowances are not. */
  taxable: boolean;
  /** Reduced when the employee has loss-of-pay days or joins/leaves mid-month. */
  prorate: boolean;
  /** Counts as PF wages (basic and dearness allowance). */
  pfWage?: boolean;
};

export type AdjustmentKind = 'EARNING' | 'BONUS' | 'ARREARS' | 'REIMBURSEMENT' | 'DEDUCTION' | 'LOP_DAYS';

export type PayrollAdjustmentInput = {
  kind: AdjustmentKind;
  code: string;
  label: string;
  /** Rupees, or days when kind is LOP_DAYS. */
  amount: number;
  taxable: boolean;
};

export type PayslipInput = {
  /** First day of the pay month, ISO date. */
  periodStart: string;
  /** Last day of the pay month, ISO date. */
  periodEnd: string;
  /** Indian financial year of the period, e.g. "2026-27". */
  fy: string;
  /** 1 for April ... 12 for March. */
  fyMonth: number;
  joinDate?: string | null;
  exitDate?: string | null;
  components: SalaryComponent[];
  adjustments: PayrollAdjustmentInput[];
  /** Loan instalments due this month. */
  loanInstalments: { label: string; amount: number }[];
  statutory: {
    pfEnabled: boolean;
    pfOnActualBasic: boolean;
    esiEnabled: boolean;
    ptState: string | null;
    hasPan: boolean;
  };
  tax: {
    regime: TaxRegime;
    /** Declared yearly deductions for the old regime (80C, 80D, home-loan interest...). */
    oldRegimeDeductions: number;
    /** Earned so far in the financial year before this month. */
    ytdTaxableEarnings: number;
    ytdTds: number;
    ytdProfessionalTax: number;
    ytdEmployeePf: number;
  };
  /** How a day of pay is worked out for loss of pay. */
  lopBasis: 'CALENDAR_DAYS' | 'FIXED_30';
};

export type PayLine = {
  code: string;
  label: string;
  amount: number;
  /** Plain-language working so an employee or auditor can follow it. */
  formula: string;
};

export type PayslipResult = {
  ruleVersion: string;
  period: { daysInMonth: number; lopDays: number; notEmployedDays: number; payableDays: number; factor: number };
  earnings: PayLine[];
  deductions: PayLine[];
  employer: PayLine[];
  totals: {
    gross: number;
    taxableGross: number;
    totalDeductions: number;
    employerCost: number;
    netPay: number;
    /** Deductions that could not be taken because net pay would go below zero. */
    shortfall: number;
  };
  statutory: {
    pf: { wage: number; employee: number; epf: number; eps: number; admin: number; edli: number };
    esi: { applicable: boolean; wage: number; employee: number; employer: number };
    pt: number;
    tds: {
      monthly: number;
      projectedAnnualTaxableIncome: number;
      annualTax: number;
      monthsLeft: number;
      higherRateNoPan: boolean;
    };
  };
  warnings: string[];
};
