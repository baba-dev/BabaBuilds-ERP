import { PF_RULES, r2, roundRupee } from './statutory';
import type { SalaryComponent } from './types';

export type CtcStructureOptions = {
  annualCtc: number;
  /** Basic as a share of CTC. Common practice is 40 to 50 percent. */
  basicPercentOfCtc?: number;
  /** House rent allowance as a share of basic. 50 for metro cities, 40 otherwise. */
  hraPercentOfBasic?: number;
  pfEnabled?: boolean;
  pfOnActualBasic?: boolean;
};

/**
 * Splits an annual cost-to-company figure into monthly components. The employer's provident fund sits inside
 * CTC, so it is taken out first; the special allowance balances whatever is left so the parts add back to CTC.
 */
export function buildStructureFromCtc(opts: CtcStructureOptions): { components: SalaryComponent[]; employerPfMonthly: number; monthlyGross: number } {
  const monthlyCtc = opts.annualCtc / 12;
  const basic = roundRupee((monthlyCtc * (opts.basicPercentOfCtc ?? 40)) / 100);
  const hra = roundRupee((basic * (opts.hraPercentOfBasic ?? 50)) / 100);
  const pfEnabled = opts.pfEnabled ?? true;
  const pfWage = opts.pfOnActualBasic ? basic : Math.min(basic, PF_RULES.wageCeiling);
  const employerPf = pfEnabled ? roundRupee(pfWage * PF_RULES.employeeRate) : 0;
  const special = Math.max(0, roundRupee(monthlyCtc - basic - hra - employerPf));
  const components: SalaryComponent[] = [
    { code: 'BASIC', label: 'Basic salary', monthly: basic, taxable: true, prorate: true, pfWage: true },
    { code: 'HRA', label: 'House rent allowance', monthly: hra, taxable: true, prorate: true },
    { code: 'SPECIAL', label: 'Special allowance', monthly: special, taxable: true, prorate: true },
  ].filter((c) => c.monthly > 0);
  return { components, employerPfMonthly: employerPf, monthlyGross: r2(components.reduce((s, c) => s + c.monthly, 0)) };
}

/** Annual cost to the company implied by a set of monthly components plus the employer's statutory share. */
export function annualCostFromComponents(components: SalaryComponent[], employerMonthly: number): number {
  return r2((components.reduce((s, c) => s + c.monthly, 0) + employerMonthly) * 12);
}
