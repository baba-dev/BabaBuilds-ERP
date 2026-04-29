import { Prisma } from '@prisma/client';
import { serializeMoney, toDecimal } from '@/lib/money';
import { estimateTaxFromRules as estimateCountryRateFromRules } from '@/lib/tax/rules';

export type TaxDisclaimerKey = 'AUTO_RULE' | 'MANUAL_OVERRIDE' | 'PROVIDER_RATE' | 'FALLBACK_RULE';
export type TaxType = 'income_tax' | 'gst' | 'vat' | 'sales_tax';
export type TaxRegime = 'new' | 'old';
export type TaxpayerType = 'individual' | 'huf' | 'aop' | 'boi' | 'ajp' | 'company' | 'firm' | 'other';
export type ResidentialStatus = 'resident' | 'non_resident' | 'not_ordinarily_resident';

type IndiaTaxSlab = { floor: number; width: number | null; rate: number };
type IndiaRebateConfig = { threshold: number; maxRebate: number; marginalRelief: boolean };
type IndiaTaxRule = {
  fiscalYear: '2024-25' | '2025-26';
  assessmentYear: '2025-26' | '2026-27';
  regimeKey: 'FY_2024_25_AY_2025_26' | 'FY_2025_26_AY_2026_27_PLUS';
  ruleVersion: string;
  slabs: IndiaTaxSlab[];
  rebate: IndiaRebateConfig;
  standardDeduction: { salariedAmount: number };
  cess: { rate: number };
};

export class TaxEngineValidationError extends Error {
  constructor(public code: 'INVALID_FISCAL_YEAR' | 'UNSUPPORTED_FISCAL_YEAR', message: string, public details?: Record<string, unknown>) {
    super(message);
  }
}

export interface TaxEstimateInput {
  countryCode?: string | null;
  revenue?: Prisma.Decimal | number | string | null;
  deductions?: Prisma.Decimal | number | string | null;
  serviceScope?: string | null;
  regionCode?: string | null;
  customerScope?: string | null;
  asOfDate?: string | Date | null;
  fiscalYear?: string | null;
  taxType?: TaxType | null;
  taxRegime?: TaxRegime | null;
  taxpayerType?: TaxpayerType | null;
  residentialStatus?: ResidentialStatus | null;
  isSalaried?: boolean | null;
  applyStandardDeduction?: boolean | null;
  specialRateIncome?: Prisma.Decimal | number | string | null;
  overrideRatePercent?: number | string | null;
  overrideId?: string | null;
  overrideReason?: string | null;
  resolutionMode?: 'auto' | 'prefer_provider_rate';
}

export interface TaxEstimateResult {
  amount: string;
  ratePercent: number | null;
  warnings: string[];
  components: Record<string, string | boolean>;
  basis: {
    countryCode: string | null; revenue: string; deductions: string; taxableIncome: string; serviceScope: string | null;
    regionCode: string | null; customerScope: string | null; asOfDate: string;
    method: 'rule_engine' | 'provider_rate' | 'manual_override' | 'fallback'; providerRatePercent: number | null;
    fiscalYear: string | null; assessmentYear: string | null; taxType: TaxType; taxRegime: TaxRegime;
    taxpayerType: TaxpayerType; residentialStatus: ResidentialStatus; selectedRuleVersion: string | null;
    ruleStatus: 'exact' | 'carried_forward_latest_known' | 'fallback';
  };
  override: { applied: boolean; overrideId: string | null; reason: string | null };
  disclaimerKey: TaxDisclaimerKey;
}

const DEFAULT_FALLBACK_RATE = 0.3;
const RULE_ENGINE_COUNTRIES = new Set(['IN']);
const INDIA_NEW_REGIME_RULES_BY_FY: Record<'2024-25' | '2025-26', IndiaTaxRule> = {
  '2024-25': {
    fiscalYear: '2024-25', assessmentYear: '2025-26', regimeKey: 'FY_2024_25_AY_2025_26', ruleVersion: 'IN-115BAC-AY2025-26-v1',
    slabs: [{ floor: 300000, width: 400000, rate: 0.05 }, { floor: 700000, width: 300000, rate: 0.10 }, { floor: 1000000, width: 200000, rate: 0.15 }, { floor: 1200000, width: 300000, rate: 0.20 }, { floor: 1500000, width: null, rate: 0.30 }],
    rebate: { threshold: 700000, maxRebate: 25000, marginalRelief: true }, standardDeduction: { salariedAmount: 0 }, cess: { rate: 0.04 },
  },
  '2025-26': {
    fiscalYear: '2025-26', assessmentYear: '2026-27', regimeKey: 'FY_2025_26_AY_2026_27_PLUS', ruleVersion: 'IN-115BAC-AY2026-27-v1',
    slabs: [{ floor: 400000, width: 400000, rate: 0.05 }, { floor: 800000, width: 400000, rate: 0.10 }, { floor: 1200000, width: 400000, rate: 0.15 }, { floor: 1600000, width: 400000, rate: 0.20 }, { floor: 2000000, width: 400000, rate: 0.25 }, { floor: 2400000, width: null, rate: 0.30 }],
    rebate: { threshold: 1200000, maxRebate: 60000, marginalRelief: true }, standardDeduction: { salariedAmount: 75000 }, cess: { rate: 0.04 },
  },
};

const normalizePercent = (value: unknown): number | null => { if (value === null || value === undefined || value === '') return null; const n = Number(value); if (!Number.isFinite(n) || n < 0) return null; return n > 1 ? n : n * 100; };
const resolveProviderRatePercent = (countryCode?: string | null, regionCode?: string | null): number | null => { const c = (countryCode || '').trim().toUpperCase(); if (!c) return null; const rate = estimateCountryRateFromRules({ countryCode: c, regionCode }); return typeof rate === 'number' ? rate * 100 : null; };

const parseFiscalYear = (fiscalYear?: string | null): { startYear: number; endYear: number; label: string } | null => {
  if (!fiscalYear) return null;
  const m = fiscalYear.trim().match(/^(?:FY\s*)?(\d{4})\s*[-/]\s*(\d{2,4})$/i);
  if (!m) throw new TaxEngineValidationError('INVALID_FISCAL_YEAR', 'Invalid fiscalYear format. Use YYYY-YY, FY YYYY-YY, FYYYYY-YY, or YYYY/YY');
  const startYear = Number(m[1]);
  const endYear = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
  if (endYear !== startYear + 1) throw new TaxEngineValidationError('INVALID_FISCAL_YEAR', 'Invalid fiscal year range; end year must equal start year + 1.');
  return { startYear, endYear, label: `${startYear}-${String(endYear).slice(-2)}` };
};

const deriveFiscalYearFromDate = (asOfDate?: string | Date | null): { startYear: number; endYear: number; label: string } => {
  if (typeof asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    const [y, m] = asOfDate.split('-').map(Number); const s = m >= 4 ? y : y - 1; return { startYear: s, endYear: s + 1, label: `${s}-${String(s + 1).slice(-2)}` };
  }
  const d = asOfDate ? new Date(asOfDate) : new Date(); if (Number.isNaN(d.getTime())) throw new TaxEngineValidationError('INVALID_FISCAL_YEAR', 'Invalid asOfDate; unable to derive fiscal year.');
  const y = d.getFullYear(); const m = d.getMonth() + 1; const s = m >= 4 ? y : y - 1; return { startYear: s, endYear: s + 1, label: `${s}-${String(s + 1).slice(-2)}` };
};

const computeSlabTax = (income: Prisma.Decimal, slabs: IndiaTaxSlab[]): Prisma.Decimal => slabs.reduce((tax, slab) => {
  const floor = new Prisma.Decimal(slab.floor); if (income.lte(floor)) return tax;
  const width = slab.width === null ? income.minus(floor) : Prisma.Decimal.min(income.minus(floor), new Prisma.Decimal(slab.width));
  return width.lte(0) ? tax : tax.plus(width.mul(slab.rate));
}, new Prisma.Decimal(0));

export const estimateTax = (input: TaxEstimateInput): TaxEstimateResult => {
  const revenue = toDecimal(input.revenue); const deductions = Prisma.Decimal.max(new Prisma.Decimal(0), toDecimal(input.deductions));
  const taxableIncome = Prisma.Decimal.max(new Prisma.Decimal(0), revenue.minus(deductions));
  const asOfDate = input.asOfDate ? new Date(input.asOfDate) : new Date();
  const asOfDateIso = Number.isNaN(asOfDate.getTime()) ? new Date().toISOString() : asOfDate.toISOString();
  const country = input.countryCode?.trim().toUpperCase() || null;
  const taxType: TaxType = input.taxType ?? (country === 'IN' ? 'income_tax' : 'sales_tax');
  const taxRegime: TaxRegime = input.taxRegime ?? 'new';
  const taxpayerType: TaxpayerType = input.taxpayerType ?? 'individual';
  const residentialStatus: ResidentialStatus = input.residentialStatus ?? 'resident';
  const providerRatePercent = resolveProviderRatePercent(country, input.regionCode);

  const base: Omit<TaxEstimateResult, 'amount' | 'ratePercent' | 'disclaimerKey'> = { warnings: [], components: {}, basis: { countryCode: country, revenue: serializeMoney(revenue), deductions: serializeMoney(deductions), taxableIncome: serializeMoney(taxableIncome), serviceScope: input.serviceScope?.trim() || null, regionCode: input.regionCode?.trim().toUpperCase() || null, customerScope: input.customerScope?.trim() || null, asOfDate: asOfDateIso, method: 'fallback', providerRatePercent, fiscalYear: null, assessmentYear: null, taxType, taxRegime, taxpayerType, residentialStatus, selectedRuleVersion: null, ruleStatus: 'fallback' }, override: { applied: false, overrideId: null, reason: null } };

  const overrideRatePercent = normalizePercent(input.overrideRatePercent);
  if (overrideRatePercent !== null) { const amt = taxableIncome.mul(overrideRatePercent).div(100); return { ...base, amount: serializeMoney(amt), ratePercent: overrideRatePercent, disclaimerKey: 'MANUAL_OVERRIDE', basis: { ...base.basis, method: 'manual_override' }, override: { applied: true, overrideId: input.overrideId || null, reason: input.overrideReason || 'Manual tax rate override provided' } }; }

  const hasRule = Boolean(country && RULE_ENGINE_COUNTRIES.has(country) && taxType === 'income_tax' && taxRegime === 'new');
  if (hasRule && (input.resolutionMode ?? 'auto') !== 'prefer_provider_rate') {
    const fy = parseFiscalYear(input.fiscalYear) ?? deriveFiscalYearFromDate(input.asOfDate);
    if (fy.startYear < 2024) throw new TaxEngineValidationError('UNSUPPORTED_FISCAL_YEAR', `Unsupported fiscal year ${fy.label}`, { supportedFiscalYears: ['2024-25', '2025-26'], latestKnownFiscalYear: '2025-26' });
    const exact = fy.startYear === 2024 || fy.startYear === 2025;
    const rule = fy.startYear === 2024 ? INDIA_NEW_REGIME_RULES_BY_FY['2024-25'] : INDIA_NEW_REGIME_RULES_BY_FY['2025-26'];

    const specialRateIncome = Prisma.Decimal.max(new Prisma.Decimal(0), toDecimal(input.specialRateIncome));
    const standardDeductionEligible = Boolean(input.isSalaried && input.applyStandardDeduction);
    const standardDeductionAmount = standardDeductionEligible ? new Prisma.Decimal(rule.standardDeduction.salariedAmount) : new Prisma.Decimal(0);
    const normalTaxableIncome = Prisma.Decimal.max(new Prisma.Decimal(0), taxableIncome.minus(specialRateIncome).minus(standardDeductionAmount));
    const grossSlabTax = computeSlabTax(normalTaxableIncome, rule.slabs);
    const specialRateTax = new Prisma.Decimal(0);
    const rebateEligible = taxpayerType === 'individual' && residentialStatus === 'resident';
    const threshold = new Prisma.Decimal(rule.rebate.threshold);
    const maxRebate = new Prisma.Decimal(rule.rebate.maxRebate);
    let rebate = new Prisma.Decimal(0);
    if (rebateEligible && specialRateIncome.eq(0) && normalTaxableIncome.lte(threshold)) rebate = Prisma.Decimal.min(grossSlabTax, maxRebate);
    let taxAfterRebate = grossSlabTax.minus(rebate).plus(specialRateTax);
    let marginalRelief = new Prisma.Decimal(0);
    if (rebateEligible && rule.rebate.marginalRelief && normalTaxableIncome.gt(threshold)) {
      const incomeAbove = normalTaxableIncome.minus(threshold);
      if (taxAfterRebate.gt(incomeAbove)) {
        marginalRelief = taxAfterRebate.minus(incomeAbove);
        taxAfterRebate = incomeAbove;
      }
    }
    const surcharge = new Prisma.Decimal(0);
    const cess = taxAfterRebate.plus(surcharge).mul(rule.cess.rate);
    const finalTax = taxAfterRebate.plus(surcharge).plus(cess);
    const effectiveRate = taxableIncome.eq(0) ? 0 : finalTax.div(taxableIncome).mul(100).toDecimalPlaces(2).toNumber();
    const warnings = [...base.warnings];
    warnings.push('Not legal advice. Tax rules, surcharge, and special-rate income treatment must be periodically reviewed.');
    warnings.push('Surcharge is currently set to 0 (TODO: implement surcharge bands).');
    if (specialRateIncome.gt(0)) warnings.push('Special-rate income provided; special-rate tax is not implemented and is currently assumed as 0.');
    if (!exact && fy.startYear > 2025) warnings.push(`Using carried-forward latest known India rule for FY ${fy.label}.`);

    return { ...base, amount: serializeMoney(finalTax), ratePercent: effectiveRate, disclaimerKey: 'AUTO_RULE', warnings,
      basis: { ...base.basis, method: 'rule_engine', fiscalYear: fy.label, assessmentYear: rule.assessmentYear, selectedRuleVersion: rule.ruleVersion, ruleStatus: exact ? 'exact' : 'carried_forward_latest_known' },
      components: { grossSlabTax: serializeMoney(grossSlabTax), standardDeductionApplied: standardDeductionEligible, standardDeductionAmount: serializeMoney(standardDeductionAmount), normalTaxableIncome: serializeMoney(normalTaxableIncome), specialRateIncome: serializeMoney(specialRateIncome), normalIncomeTax: serializeMoney(grossSlabTax), specialRateTax: serializeMoney(specialRateTax), rebate: serializeMoney(rebate), marginalRelief: serializeMoney(marginalRelief), taxAfterRebate: serializeMoney(taxAfterRebate), surcharge: serializeMoney(surcharge), cess: serializeMoney(cess), finalTaxPayable: serializeMoney(finalTax) }
    };
  }

  if (providerRatePercent !== null) { const amt = taxableIncome.mul(providerRatePercent).div(100); return { ...base, amount: serializeMoney(amt), ratePercent: providerRatePercent, disclaimerKey: 'PROVIDER_RATE', basis: { ...base.basis, method: 'provider_rate' } }; }
  const fallback = taxableIncome.mul(DEFAULT_FALLBACK_RATE);
  return { ...base, amount: serializeMoney(fallback), ratePercent: DEFAULT_FALLBACK_RATE * 100, disclaimerKey: 'FALLBACK_RULE', basis: { ...base.basis, method: 'fallback' } };
};
