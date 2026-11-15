/**
 * Indian payroll statutory rules: provident fund, ESI and professional tax.
 * Rates are kept in one place so a rule change is a one-line edit with a bumped rule version.
 */

export const PF_RULES = {
  wageCeiling: 15_000,
  employeeRate: 0.12,
  /** Employer share is 12% in total: 8.33% goes to the pension scheme (capped), the rest to the provident fund. */
  epsRate: 0.0833,
  epsMaxMonthly: 1_250,
  adminRate: 0.005,
  edliRate: 0.005,
  edliMaxMonthly: 75,
} as const;

export const ESI_RULES = {
  /** Monthly wage limit for coverage. */
  wageLimit: 21_000,
  employeeRate: 0.0075,
  employerRate: 0.0325,
} as const;

export const roundRupee = (n: number): number => Math.round(n);
export const roundUpRupee = (n: number): number => Math.ceil(n - 1e-9);
export const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export type PfResult = { wage: number; employee: number; epf: number; eps: number; admin: number; edli: number };

export function computePf(pfWagesActual: number, opts: { enabled: boolean; onActualBasic: boolean }): PfResult {
  const zero: PfResult = { wage: 0, employee: 0, epf: 0, eps: 0, admin: 0, edli: 0 };
  if (!opts.enabled || pfWagesActual <= 0) return zero;
  const wage = opts.onActualBasic ? pfWagesActual : Math.min(pfWagesActual, PF_RULES.wageCeiling);
  const employee = roundRupee(wage * PF_RULES.employeeRate);
  const employerTotal = roundRupee(wage * PF_RULES.employeeRate);
  const epsWage = Math.min(wage, PF_RULES.wageCeiling);
  const eps = Math.min(roundRupee(epsWage * PF_RULES.epsRate), PF_RULES.epsMaxMonthly);
  const epf = employerTotal - eps;
  const admin = roundRupee(wage * PF_RULES.adminRate);
  const edli = Math.min(roundRupee(Math.min(wage, PF_RULES.wageCeiling) * PF_RULES.edliRate), PF_RULES.edliMaxMonthly);
  return { wage, employee, epf, eps, admin, edli };
}

export type EsiResult = { applicable: boolean; wage: number; employee: number; employer: number };

/** ESI is worked out on gross wages and rounded up to the next rupee. */
export function computeEsi(grossWages: number, opts: { enabled: boolean }): EsiResult {
  if (!opts.enabled || grossWages <= 0 || grossWages > ESI_RULES.wageLimit) return { applicable: false, wage: 0, employee: 0, employer: 0 };
  return {
    applicable: true,
    wage: grossWages,
    employee: roundUpRupee(grossWages * ESI_RULES.employeeRate),
    employer: roundUpRupee(grossWages * ESI_RULES.employerRate),
  };
}

type PtSlab = { upTo: number | null; amount: number };

/**
 * Monthly professional tax slabs for states that collect it monthly. States that collect half-yearly or
 * annually, and states with no tax, are not modelled: the preflight tells the user to add it by hand.
 */
const PT_SLABS: Record<string, { name: string; slabs: PtSlab[]; februaryExtra?: number }> = {
  MH: { name: 'Maharashtra', slabs: [{ upTo: 7_500, amount: 0 }, { upTo: 10_000, amount: 175 }, { upTo: null, amount: 200 }], februaryExtra: 100 },
  KA: { name: 'Karnataka', slabs: [{ upTo: 24_999, amount: 0 }, { upTo: null, amount: 200 }] },
  WB: { name: 'West Bengal', slabs: [{ upTo: 10_000, amount: 0 }, { upTo: 15_000, amount: 110 }, { upTo: 25_000, amount: 130 }, { upTo: 40_000, amount: 150 }, { upTo: null, amount: 200 }] },
  TS: { name: 'Telangana', slabs: [{ upTo: 15_000, amount: 0 }, { upTo: 20_000, amount: 150 }, { upTo: null, amount: 200 }] },
  AP: { name: 'Andhra Pradesh', slabs: [{ upTo: 15_000, amount: 0 }, { upTo: 20_000, amount: 150 }, { upTo: null, amount: 200 }] },
  GJ: { name: 'Gujarat', slabs: [{ upTo: 12_000, amount: 0 }, { upTo: null, amount: 200 }] },
  OD: { name: 'Odisha', slabs: [{ upTo: 13_304, amount: 0 }, { upTo: 25_000, amount: 125 }, { upTo: null, amount: 200 }] },
  AS: { name: 'Assam', slabs: [{ upTo: 10_000, amount: 0 }, { upTo: 15_000, amount: 150 }, { upTo: 25_000, amount: 180 }, { upTo: null, amount: 208 }] },
};

/** States where no professional tax applies. */
const PT_NONE = new Set(['DL', 'HR', 'UP', 'RJ', 'PB', 'UK', 'HP', 'JK', 'GA', 'BR', 'CH']);

export const PT_STATE_OPTIONS = [
  ...Object.entries(PT_SLABS).map(([code, v]) => ({ code, name: v.name, supported: true })),
];

export type PtResult = { amount: number; supported: boolean; reason: 'NO_STATE' | 'NO_TAX' | 'NOT_MODELLED' | 'SLAB' };

/** `month` is the calendar month, 1 to 12. */
export function computeProfessionalTax(grossMonthly: number, stateCode: string | null, month: number): PtResult {
  if (!stateCode) return { amount: 0, supported: false, reason: 'NO_STATE' };
  const code = stateCode.toUpperCase();
  if (PT_NONE.has(code)) return { amount: 0, supported: true, reason: 'NO_TAX' };
  const rule = PT_SLABS[code];
  if (!rule) return { amount: 0, supported: false, reason: 'NOT_MODELLED' };
  const slab = rule.slabs.find((s) => s.upTo === null || grossMonthly <= s.upTo) ?? rule.slabs[rule.slabs.length - 1]!;
  const extra = rule.februaryExtra && month === 2 && slab.amount > 0 ? rule.februaryExtra : 0;
  return { amount: slab.amount + extra, supported: true, reason: 'SLAB' };
}
