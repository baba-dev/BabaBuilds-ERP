import { Prisma } from '@prisma/client';
import { serializeMoney, toDecimal } from '@/lib/money';
import { estimateTaxFromRules as estimateCountryRateFromRules } from '@/lib/tax/rules';

export type TaxDisclaimerKey = 'AUTO_RULE' | 'MANUAL_OVERRIDE' | 'PROVIDER_RATE' | 'FALLBACK_RULE';
export type TaxType = 'income_tax' | 'gst' | 'vat' | 'sales_tax';
export type TaxRegime = 'new' | 'old';
export type TaxpayerType = 'individual' | 'huf' | 'aop' | 'boi' | 'ajp' | 'company' | 'firm' | 'other';
export type ResidentialStatus = 'resident' | 'non_resident' | 'not_ordinarily_resident';
export type TaxEngineValidationCode = 'INVALID_FISCAL_YEAR' | 'UNSUPPORTED_FISCAL_YEAR' | 'UNSUPPORTED_TAX_REGIME' | 'UNSUPPORTED_TAXPAYER_TYPE' | 'UNSUPPORTED_SPECIAL_RATE_INCOME' | 'INVALID_SPECIAL_RATE_INCOME' | 'UNSUPPORTED_TAX_TYPE' | 'INVALID_AS_OF_DATE';

export class TaxEngineValidationError extends Error {
  constructor(public code: TaxEngineValidationCode, message: string, public details?: Record<string, unknown>) { super(message); }
}

type IndiaRule = { fiscalYear: '2024-25' | '2025-26'; assessmentYear: '2025-26' | '2026-27'; ruleVersion: string; slabs: Array<{ floor: number; width: number | null; rate: number }>; rebate: { threshold: number; maxRebate: number }; standardDeduction: number; cessRate: number };
const INDIA_RULES: Record<'2024-25' | '2025-26', IndiaRule> = {
  '2024-25': { fiscalYear: '2024-25', assessmentYear: '2025-26', ruleVersion: 'IN-115BAC-AY2025-26-v1', slabs: [{ floor: 300000, width: 400000, rate: 0.05 }, { floor: 700000, width: 300000, rate: 0.10 }, { floor: 1000000, width: 200000, rate: 0.15 }, { floor: 1200000, width: 300000, rate: 0.20 }, { floor: 1500000, width: null, rate: 0.30 }], rebate: { threshold: 700000, maxRebate: 25000 }, standardDeduction: 50000, cessRate: 0.04 },
  '2025-26': { fiscalYear: '2025-26', assessmentYear: '2026-27', ruleVersion: 'IN-115BAC-AY2026-27-v1', slabs: [{ floor: 400000, width: 400000, rate: 0.05 }, { floor: 800000, width: 400000, rate: 0.10 }, { floor: 1200000, width: 400000, rate: 0.15 }, { floor: 1600000, width: 400000, rate: 0.20 }, { floor: 2000000, width: 400000, rate: 0.25 }, { floor: 2400000, width: null, rate: 0.30 }], rebate: { threshold: 1200000, maxRebate: 60000 }, standardDeduction: 75000, cessRate: 0.04 },
};
const INDIA_ALLOWED_TYPES = new Set<TaxpayerType>(['individual', 'huf', 'aop', 'boi', 'ajp']);

export type TaxEstimateComponents = { grossSlabTax: string; standardDeductionApplied: boolean; standardDeductionAmount: string; normalTaxableIncome: string; specialRateIncome: string; normalIncomeTax: string; specialRateTax: string; rebate: string; marginalRelief: string; taxAfterRebate: string; surcharge: string; cess: string; finalTaxPayable: string };
export interface TaxEstimateInput { countryCode?: string | null; revenue?: Prisma.Decimal | number | string | null; deductions?: Prisma.Decimal | number | string | null; serviceScope?: string | null; regionCode?: string | null; customerScope?: string | null; asOfDate?: string | Date | null; fiscalYear?: string | null; taxType?: TaxType | null; taxRegime?: TaxRegime | null; taxpayerType?: TaxpayerType | null; residentialStatus?: ResidentialStatus | null; isSalaried?: boolean | null; applyStandardDeduction?: boolean | null; specialRateIncome?: Prisma.Decimal | number | string | null; overrideRatePercent?: number | string | null; overrideId?: string | null; overrideReason?: string | null; resolutionMode?: 'auto' | 'prefer_provider_rate'; }
export interface TaxEstimateResult { amount: string; ratePercent: number | null; warnings: string[]; components: TaxEstimateComponents; basis: { countryCode: string | null; revenue: string; deductions: string; taxableIncome: string; serviceScope: string | null; regionCode: string | null; customerScope: string | null; asOfDate: string; method: 'rule_engine' | 'provider_rate' | 'manual_override' | 'fallback'; providerRatePercent: number | null; fiscalYear: string | null; assessmentYear: string | null; sourceRuleFiscalYear: string | null; sourceRuleAssessmentYear: string | null; taxType: TaxType; taxRegime: TaxRegime; taxpayerType: TaxpayerType; residentialStatus: ResidentialStatus; selectedRuleVersion: string | null; ruleStatus: 'exact' | 'carried_forward_latest_known' | 'fallback' }; override: { applied: boolean; overrideId: string | null; reason: string | null }; disclaimerKey: TaxDisclaimerKey }

const dec0 = new Prisma.Decimal(0);
const emptyComponents = (amount = dec0): TaxEstimateComponents => ({ grossSlabTax: '0.00', standardDeductionApplied: false, standardDeductionAmount: '0.00', normalTaxableIncome: '0.00', specialRateIncome: '0.00', normalIncomeTax: '0.00', specialRateTax: '0.00', rebate: '0.00', marginalRelief: '0.00', taxAfterRebate: serializeMoney(amount), surcharge: '0.00', cess: '0.00', finalTaxPayable: serializeMoney(amount) });
const normPercent = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const parsed = Number(v);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed > 1 ? parsed : parsed * 100;
};
const parse2or4 = (t: string) => t.length === 2 ? (Number(t) >= 50 ? 1900 + Number(t) : 2000 + Number(t)) : Number(t);
const parseFiscalYear = (fy?: string | null) => { if (!fy) return null; const m = fy.trim().match(/^(?:FY\s*)?(\d{2,4})\s*[-/]\s*(\d{2,4})$/i); if (!m) throw new TaxEngineValidationError('INVALID_FISCAL_YEAR', 'Invalid fiscal year format.'); const s = parse2or4(m[1]); const e = parse2or4(m[2]); if (e !== s + 1) throw new TaxEngineValidationError('INVALID_FISCAL_YEAR', 'Invalid fiscal year range.'); return { startYear: s, endYear: e, label: `${s}-${String(e).slice(-2)}` }; };
const assessmentYearFromFiscalYear = (fy: { endYear: number }) => `${fy.endYear}-${String(fy.endYear + 1).slice(-2)}`;
const parseAsOfDate = (asOfDate?: string | Date | null) => { if (!asOfDate) return new Date(); const d = new Date(asOfDate); if (Number.isNaN(d.getTime())) throw new TaxEngineValidationError('INVALID_AS_OF_DATE', 'Invalid asOfDate.'); return d; };
const deriveFY = (asOfDate?: string | Date | null) => { if (typeof asOfDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) { const [y, m] = asOfDate.split('-').map(Number); const s = m >= 4 ? y : y - 1; return { startYear: s, endYear: s + 1, label: `${s}-${String(s + 1).slice(-2)}` }; } const d = parseAsOfDate(asOfDate); const s = d.getMonth() + 1 >= 4 ? d.getFullYear() : d.getFullYear() - 1; return { startYear: s, endYear: s + 1, label: `${s}-${String(s + 1).slice(-2)}` }; };
const slabTax = (income: Prisma.Decimal, slabs: IndiaRule['slabs']) => slabs.reduce((t, s) => income.lte(s.floor) ? t : t.plus((s.width === null ? income.minus(s.floor) : Prisma.Decimal.min(income.minus(s.floor), new Prisma.Decimal(s.width))).mul(s.rate)), dec0);

export const estimateTax = (input: TaxEstimateInput): TaxEstimateResult => {
  const revenue = toDecimal(input.revenue); const deductions = Prisma.Decimal.max(dec0, toDecimal(input.deductions)); const taxableIncome = Prisma.Decimal.max(dec0, revenue.minus(deductions));
  const asOf = parseAsOfDate(input.asOfDate); const asOfIso = asOf.toISOString();
  const country = input.countryCode?.trim().toUpperCase() || null; const taxType: TaxType = input.taxType ?? (country === 'IN' ? 'income_tax' : 'sales_tax'); const taxRegime: TaxRegime = input.taxRegime ?? 'new'; const taxpayerType: TaxpayerType = input.taxpayerType ?? 'individual'; const residentialStatus: ResidentialStatus = input.residentialStatus ?? 'resident';
  const providerRate = (() => { const c = (country || '').trim().toUpperCase(); if (!c) return null; const r = estimateCountryRateFromRules({ countryCode: c, regionCode: input.regionCode }); return typeof r === 'number' ? r * 100 : null; })();
  const base = { warnings: [] as string[], components: emptyComponents(), basis: { countryCode: country, revenue: serializeMoney(revenue), deductions: serializeMoney(deductions), taxableIncome: serializeMoney(taxableIncome), serviceScope: input.serviceScope?.trim() || null, regionCode: input.regionCode?.trim().toUpperCase() || null, customerScope: input.customerScope?.trim() || null, asOfDate: asOfIso, method: 'fallback' as const, providerRatePercent: providerRate, fiscalYear: null, assessmentYear: null, sourceRuleFiscalYear: null, sourceRuleAssessmentYear: null, taxType, taxRegime, taxpayerType, residentialStatus, selectedRuleVersion: null, ruleStatus: 'fallback' as const }, override: { applied: false, overrideId: null, reason: null } };

  const op = normPercent(input.overrideRatePercent); if (op !== null) { const amt = taxableIncome.mul(op).div(100); return { ...base, amount: serializeMoney(amt), ratePercent: op, components: emptyComponents(amt), basis: { ...base.basis, method: 'manual_override' }, override: { applied: true, overrideId: input.overrideId || null, reason: input.overrideReason || 'Manual tax rate override provided' }, disclaimerKey: 'MANUAL_OVERRIDE' }; }
  if (country === 'IN' && taxType === 'income_tax' && taxRegime !== 'new') throw new TaxEngineValidationError('UNSUPPORTED_TAX_REGIME', 'India old-regime income-tax estimation is not supported yet.', { supportedTaxRegimes: ['new'] });
  if (country === 'IN' && taxType === 'income_tax' && !INDIA_ALLOWED_TYPES.has(taxpayerType)) throw new TaxEngineValidationError('UNSUPPORTED_TAXPAYER_TYPE', `Taxpayer type ${taxpayerType} is not supported by the India new-regime slab estimator.`, { supportedTaxpayerTypes: Array.from(INDIA_ALLOWED_TYPES) });

  if (country === 'IN' && taxType === 'income_tax' && (input.resolutionMode ?? 'auto') !== 'prefer_provider_rate') {
    const fy = parseFiscalYear(input.fiscalYear) ?? deriveFY(input.asOfDate); if (fy.startYear < 2024) throw new TaxEngineValidationError('UNSUPPORTED_FISCAL_YEAR', `Unsupported fiscal year ${fy.label}`, { supportedFiscalYears: ['2024-25', '2025-26'], latestKnownFiscalYear: '2025-26' });
    const rawSpecialRateIncome = toDecimal(input.specialRateIncome);
    if (rawSpecialRateIncome.lt(0)) {
      throw new TaxEngineValidationError('INVALID_SPECIAL_RATE_INCOME', 'specialRateIncome cannot be negative.');
    }
    const specialRateIncome = rawSpecialRateIncome;
    if (specialRateIncome.gt(0)) throw new TaxEngineValidationError('UNSUPPORTED_SPECIAL_RATE_INCOME', 'Special-rate income is not yet supported for final India income-tax payable estimates.', { reason: 'Section 87A rebate cannot be applied against special-rate income tax; a dedicated special-rate calculator is required.' });
    const sourceRule = fy.startYear === 2024 ? INDIA_RULES['2024-25'] : INDIA_RULES['2025-26']; const exact = fy.startYear === 2024 || fy.startYear === 2025;
    const std = input.isSalaried && input.applyStandardDeduction ? new Prisma.Decimal(sourceRule.standardDeduction) : dec0; const normalIncome = Prisma.Decimal.max(dec0, taxableIncome.minus(std));
    const gross = slabTax(normalIncome, sourceRule.slabs); const threshold = new Prisma.Decimal(sourceRule.rebate.threshold); const maxRebate = new Prisma.Decimal(sourceRule.rebate.maxRebate);
    const eligibleRebate = taxpayerType === 'individual' && residentialStatus === 'resident' && normalIncome.lte(threshold) ? Prisma.Decimal.min(gross, maxRebate) : dec0;
    let taxAfter = gross.minus(eligibleRebate); let marginal = dec0; if (taxpayerType === 'individual' && residentialStatus === 'resident' && normalIncome.gt(threshold)) { const above = normalIncome.minus(threshold); if (taxAfter.gt(above)) { marginal = taxAfter.minus(above); taxAfter = above; } }
    const surcharge = dec0; const cess = taxAfter.mul(sourceRule.cessRate); const final = taxAfter.plus(cess); const effective = taxableIncome.eq(0) ? 0 : final.div(taxableIncome).mul(100).toDecimalPlaces(2).toNumber();
    const warnings = ['Not legal advice. Rules must be reviewed yearly.', 'Surcharge not implemented; assumed as 0.']; if (!exact) warnings.push(`Using carried-forward latest known India rule set (sourced from FY ${sourceRule.fiscalYear} / AY ${sourceRule.assessmentYear}) for requested FY ${fy.label}.`);
    return { ...base, amount: serializeMoney(final), ratePercent: effective, warnings, disclaimerKey: 'AUTO_RULE', basis: { ...base.basis, method: 'rule_engine', fiscalYear: fy.label, assessmentYear: assessmentYearFromFiscalYear(fy), sourceRuleFiscalYear: sourceRule.fiscalYear, sourceRuleAssessmentYear: sourceRule.assessmentYear, selectedRuleVersion: sourceRule.ruleVersion, ruleStatus: exact ? 'exact' : 'carried_forward_latest_known' }, components: { grossSlabTax: serializeMoney(gross), standardDeductionApplied: std.gt(0), standardDeductionAmount: serializeMoney(std), normalTaxableIncome: serializeMoney(normalIncome), specialRateIncome: '0.00', normalIncomeTax: serializeMoney(gross), specialRateTax: '0.00', rebate: serializeMoney(eligibleRebate), marginalRelief: serializeMoney(marginal), taxAfterRebate: serializeMoney(taxAfter), surcharge: '0.00', cess: serializeMoney(cess), finalTaxPayable: serializeMoney(final) } };
  }

  if (providerRate !== null) { const amount = taxableIncome.mul(providerRate).div(100); return { ...base, amount: serializeMoney(amount), ratePercent: providerRate, components: emptyComponents(amount), basis: { ...base.basis, method: 'provider_rate' }, disclaimerKey: 'PROVIDER_RATE' }; }
  const amount = taxableIncome.mul(0.3); return { ...base, amount: serializeMoney(amount), ratePercent: 30, components: emptyComponents(amount), basis: { ...base.basis, method: 'fallback' }, disclaimerKey: 'FALLBACK_RULE' };
};
