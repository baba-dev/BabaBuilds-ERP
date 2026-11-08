import { Prisma } from '@prisma/client';

/**
 * India income-tax computation (individuals, HUF, AOP/BOI, firms and companies).
 *
 * Rates follow the Finance Acts through Budget 2025 and are carried unchanged into FY / tax year 2026-27, the first
 * year of the Income-tax Act 2025 (which renumbers the sections but keeps the slabs). Review each Budget: change the
 * tables below, nothing else. Output is an estimate, not advice.
 */
export type IndiaRegime = 'new' | 'old';
export type AgeGroup = 'below60' | 'senior' | 'super_senior';
export type IndiaSlab = { floor: number; width: number | null; rate: number };

export type IndiaNewRegimeRule = {
  fiscalYear: string;
  ruleVersion: string;
  assessmentYear: string;
  slabs: IndiaSlab[];
  rebate: { threshold: number; maxRebate: number };
  standardDeduction: number;
  cessRate: number;
  /** True when the year's figures are carried forward rather than confirmed from the Finance Act. */
  carriedForward?: boolean;
};

const NEW_SLABS_2025: IndiaSlab[] = [
  { floor: 400000, width: 400000, rate: 0.05 },
  { floor: 800000, width: 400000, rate: 0.1 },
  { floor: 1200000, width: 400000, rate: 0.15 },
  { floor: 1600000, width: 400000, rate: 0.2 },
  { floor: 2000000, width: 400000, rate: 0.25 },
  { floor: 2400000, width: null, rate: 0.3 },
];

export const INDIA_NEW_REGIME: Record<string, IndiaNewRegimeRule> = {
  '2024-25': {
    fiscalYear: '2024-25', assessmentYear: '2025-26', ruleVersion: 'IN-115BAC-AY2025-26-v1',
    slabs: [
      { floor: 300000, width: 400000, rate: 0.05 }, { floor: 700000, width: 300000, rate: 0.1 }, { floor: 1000000, width: 200000, rate: 0.15 },
      { floor: 1200000, width: 300000, rate: 0.2 }, { floor: 1500000, width: null, rate: 0.3 },
    ],
    rebate: { threshold: 700000, maxRebate: 25000 }, standardDeduction: 50000, cessRate: 0.04,
  },
  '2025-26': {
    fiscalYear: '2025-26', assessmentYear: '2026-27', ruleVersion: 'IN-115BAC-AY2026-27-v1',
    slabs: NEW_SLABS_2025, rebate: { threshold: 1200000, maxRebate: 60000 }, standardDeduction: 75000, cessRate: 0.04,
  },
  '2026-27': {
    fiscalYear: '2026-27', assessmentYear: '2027-28', ruleVersion: 'IN-ITA2025-TY2026-27-v1',
    slabs: NEW_SLABS_2025, rebate: { threshold: 1200000, maxRebate: 60000 }, standardDeduction: 75000, cessRate: 0.04,
    carriedForward: true,
  },
};

export const LATEST_INDIA_FY = '2026-27';
export const SUPPORTED_INDIA_FYS = Object.keys(INDIA_NEW_REGIME);

/** Old regime (section 115BA-free default regime): basic exemption depends on age. */
export const INDIA_OLD_REGIME = {
  exemption: { below60: 250000, senior: 300000, super_senior: 500000 } as Record<AgeGroup, number>,
  slabs: [{ above: 250000, upTo: 500000, rate: 0.05 }, { above: 500000, upTo: 1000000, rate: 0.2 }, { above: 1000000, upTo: null, rate: 0.3 }] as Array<{ above: number; upTo: number | null; rate: number }>,
  rebate: { threshold: 500000, maxRebate: 12500 },
  standardDeduction: 50000,
  cessRate: 0.04,
};

const SURCHARGE_BANDS_NEW = [{ above: 5000000, rate: 0.1 }, { above: 10000000, rate: 0.15 }, { above: 20000000, rate: 0.25 }];
const SURCHARGE_BANDS_OLD = [...SURCHARGE_BANDS_NEW, { above: 50000000, rate: 0.37 }];

const D = (n: number | string) => new Prisma.Decimal(n);
const ZERO = D(0);

function slabTaxNew(income: Prisma.Decimal, slabs: IndiaSlab[]) {
  return slabs.reduce((t, s) => (income.lte(s.floor) ? t : t.plus((s.width === null ? income.minus(s.floor) : Prisma.Decimal.min(income.minus(s.floor), D(s.width))).mul(s.rate))), ZERO);
}

function slabTaxOld(income: Prisma.Decimal, age: AgeGroup) {
  const exempt = INDIA_OLD_REGIME.exemption[age];
  if (income.lte(exempt)) return ZERO;
  // Senior citizens are exempt higher, so the 5% slab starts at their exemption limit.
  const slabs = INDIA_OLD_REGIME.slabs.map((s, i) => (i === 0 ? { ...s, above: exempt } : s)).filter((s) => s.upTo === null || s.upTo > exempt);
  return slabs.reduce((t, s) => (income.lte(s.above) ? t : t.plus((s.upTo === null ? income.minus(s.above) : Prisma.Decimal.min(income.minus(s.above), D(s.upTo - s.above))).mul(s.rate))), ZERO);
}

function bandRate(income: Prisma.Decimal, bands: Array<{ above: number; rate: number }>) {
  let r = 0;
  for (const b of bands) if (income.gt(b.above)) r = b.rate;
  return r;
}

/** Surcharge with marginal relief: total tax never rises by more than the income above the band threshold. */
function surchargeWithRelief(tax: Prisma.Decimal, income: Prisma.Decimal, bands: Array<{ above: number; rate: number }>, taxAt: (i: Prisma.Decimal) => Prisma.Decimal) {
  const rate = bandRate(income, bands);
  if (rate === 0) return ZERO;
  const threshold = [...bands].reverse().find((b) => income.gt(b.above))!;
  const prevRate = bandRate(D(threshold.above), bands);
  const taxAtThreshold = taxAt(D(threshold.above));
  const atThreshold = taxAtThreshold.plus(taxAtThreshold.mul(prevRate));
  const raw = tax.mul(rate);
  const limit = atThreshold.plus(income.minus(threshold.above)).minus(tax);
  return Prisma.Decimal.max(ZERO, Prisma.Decimal.min(raw, limit));
}

export type IndiaTaxpayerType = 'individual' | 'huf' | 'aop' | 'boi' | 'ajp' | 'firm' | 'company';

export type IndiaTaxInput = {
  fy: string;
  regime: IndiaRegime;
  taxpayerType: IndiaTaxpayerType;
  residentIndividual: boolean;
  ageGroup: AgeGroup;
  /** Income before the standard deduction (deductions already subtracted). */
  taxableIncome: Prisma.Decimal;
  standardDeduction: boolean;
};

export type IndiaTaxResult = {
  gross: Prisma.Decimal; std: Prisma.Decimal; normalIncome: Prisma.Decimal; rebate: Prisma.Decimal; marginal: Prisma.Decimal;
  taxAfter: Prisma.Decimal; surcharge: Prisma.Decimal; cess: Prisma.Decimal; final: Prisma.Decimal;
  rule: IndiaNewRegimeRule; warnings: string[];
};

export function computeIndiaTax(input: IndiaTaxInput): IndiaTaxResult {
  const rule = INDIA_NEW_REGIME[input.fy] ?? INDIA_NEW_REGIME[LATEST_INDIA_FY];
  const warnings: string[] = [];
  const isCompany = input.taxpayerType === 'company';
  const isFirm = input.taxpayerType === 'firm';

  if (isCompany || isFirm) {
    const income = input.taxableIncome;
    const gross = income.mul(isCompany ? 0.22 : 0.3);
    const surchargeRate = isCompany ? 0.1 : income.gt(10000000) ? 0.12 : 0;
    const surcharge = gross.mul(surchargeRate);
    const taxAfter = gross;
    const cess = taxAfter.plus(surcharge).mul(rule.cessRate);
    warnings.push(isCompany
      ? 'Company tax assumes the concessional regime (22% + 10% surcharge + 4% cess = 25.17%). Other regimes, MAT and minimum alternate tax are not modelled.'
      : 'Firm tax is 30% plus 12% surcharge above ₹1 crore and 4% cess. Marginal relief and AMT are not modelled.');
    return { gross, std: ZERO, normalIncome: income, rebate: ZERO, marginal: ZERO, taxAfter, surcharge, cess, final: taxAfter.plus(surcharge).plus(cess), rule, warnings };
  }

  const stdAmount = input.regime === 'old' ? INDIA_OLD_REGIME.standardDeduction : rule.standardDeduction;
  const std = input.standardDeduction ? D(stdAmount) : ZERO;
  const normalIncome = Prisma.Decimal.max(ZERO, input.taxableIncome.minus(std));
  const individualResident = input.taxpayerType === 'individual' && input.residentIndividual;
  const cessRate = input.regime === 'old' ? INDIA_OLD_REGIME.cessRate : rule.cessRate;

  const taxFor = (i: Prisma.Decimal) => (input.regime === 'old' ? slabTaxOld(i, input.taxpayerType === 'individual' ? input.ageGroup : 'below60') : slabTaxNew(i, rule.slabs));
  const gross = taxFor(normalIncome);

  const rebateRule = input.regime === 'old' ? INDIA_OLD_REGIME.rebate : rule.rebate;
  const eligibleRebate = individualResident && normalIncome.lte(rebateRule.threshold) ? Prisma.Decimal.min(gross, D(rebateRule.maxRebate)) : ZERO;
  let taxAfter = gross.minus(eligibleRebate);
  let marginal = ZERO;
  // Marginal relief: just above the rebate threshold, tax cannot exceed the income above it.
  if (individualResident && normalIncome.gt(rebateRule.threshold)) {
    const above = normalIncome.minus(rebateRule.threshold);
    if (input.regime === 'new' && taxAfter.gt(above)) { marginal = taxAfter.minus(above); taxAfter = above; }
  }

  const bands = input.regime === 'old' ? SURCHARGE_BANDS_OLD : SURCHARGE_BANDS_NEW;
  const surcharge = surchargeWithRelief(taxAfter, normalIncome, bands, (i) => {
    const t = taxFor(i);
    return t;
  });
  const cess = taxAfter.plus(surcharge).mul(cessRate);
  if (!individualResident) warnings.push('Section 87A rebate (section 202 of the Income-tax Act 2025) applies only to resident individuals.');
  if (input.regime === 'old') warnings.push('Old regime: enter your 80C, 80D, HRA and home-loan deductions in the deductions field; they are not inferred.');
  if (rule.carriedForward) warnings.push(`FY ${rule.fiscalYear} uses the FY 2025-26 slabs, which the Income-tax Act 2025 carries forward. Confirm against the latest Finance Act.`);
  return { gross, std, normalIncome, rebate: eligibleRebate, marginal, taxAfter, surcharge, cess, final: taxAfter.plus(surcharge).plus(cess), rule, warnings };
}

export type AdvanceTaxInstalment = { dueDate: string; cumulativePercent: number; amount: string };

/**
 * Advance-tax schedule (15 Jun 15%, 15 Sep 45%, 15 Dec 75%, 15 Mar 100%). Not due when the year's liability is under
 * ₹10,000. Presumptive-scheme taxpayers (44AD/44ADA) pay a single instalment by 15 March.
 */
export function advanceTaxSchedule(fy: string, finalTax: Prisma.Decimal, presumptive = false): AdvanceTaxInstalment[] {
  if (finalTax.lt(10000)) return [];
  const start = Number(fy.slice(0, 4));
  const rows = presumptive
    ? [{ d: `${start + 1}-03-15`, p: 100 }]
    : [{ d: `${start}-06-15`, p: 15 }, { d: `${start}-09-15`, p: 45 }, { d: `${start}-12-15`, p: 75 }, { d: `${start + 1}-03-15`, p: 100 }];
  return rows.map((r) => ({ dueDate: r.d, cumulativePercent: r.p, amount: finalTax.mul(r.p).div(100).toDecimalPlaces(2).toString() }));
}
