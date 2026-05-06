import { Prisma } from '@prisma/client';
import { serializeMoney, toDecimal } from '@/lib/money';
import { getTaxStrategy } from '@/lib/tax/strategies';

export type TaxDisclaimerKey = 'AUTO_RULE' | 'MANUAL_OVERRIDE' | 'PROVIDER_RATE' | 'FALLBACK_RULE';
export type TaxType = 'income_tax' | 'gst' | 'vat' | 'sales_tax';
export type TaxRegime = 'new' | 'old';
export type TaxpayerType = 'individual' | 'huf' | 'aop' | 'boi' | 'ajp' | 'company' | 'firm' | 'other';
export type ResidentialStatus = 'resident' | 'non_resident' | 'not_ordinarily_resident';
export type TaxEngineValidationCode = 'INVALID_FISCAL_YEAR' | 'UNSUPPORTED_FISCAL_YEAR' | 'UNSUPPORTED_TAX_REGIME' | 'UNSUPPORTED_TAXPAYER_TYPE' | 'UNSUPPORTED_SPECIAL_RATE_INCOME' | 'INVALID_SPECIAL_RATE_INCOME' | 'UNSUPPORTED_TAX_TYPE' | 'INVALID_AS_OF_DATE';

export class TaxEngineValidationError extends Error {
  constructor(public code: TaxEngineValidationCode, message: string, public details?: Record<string, unknown>) { super(message); }
}

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
const parseAsOfDate = (asOfDate?: string | Date | null) => { if (!asOfDate) return new Date(); const d = new Date(asOfDate); if (Number.isNaN(d.getTime())) throw new TaxEngineValidationError('INVALID_AS_OF_DATE', 'Invalid asOfDate.'); return d; };

export const estimateTax = (input: TaxEstimateInput): TaxEstimateResult => {
  const revenue = toDecimal(input.revenue); 
  const deductions = Prisma.Decimal.max(dec0, toDecimal(input.deductions)); 
  const taxableIncome = Prisma.Decimal.max(dec0, revenue.minus(deductions));
  const asOf = parseAsOfDate(input.asOfDate); 
  const asOfIso = asOf.toISOString();
  
  const country = input.countryCode?.trim().toUpperCase() || 'IN'; 
  const taxType: TaxType = input.taxType ?? (country === 'IN' ? 'income_tax' : 'sales_tax'); 
  const taxRegime: TaxRegime = input.taxRegime ?? 'new'; 
  const taxpayerType: TaxpayerType = input.taxpayerType ?? 'individual'; 
  const residentialStatus: ResidentialStatus = input.residentialStatus ?? 'resident';

  const op = normPercent(input.overrideRatePercent); 
  if (op !== null) { 
    const amt = taxableIncome.mul(op).div(100); 
    return { amount: serializeMoney(amt), ratePercent: op, warnings: [], components: emptyComponents(amt), basis: { countryCode: country, revenue: serializeMoney(revenue), deductions: serializeMoney(deductions), taxableIncome: serializeMoney(taxableIncome), serviceScope: input.serviceScope?.trim() || null, regionCode: input.regionCode?.trim().toUpperCase() || null, customerScope: input.customerScope?.trim() || null, asOfDate: asOfIso, method: 'manual_override', providerRatePercent: null, fiscalYear: null, assessmentYear: null, sourceRuleFiscalYear: null, sourceRuleAssessmentYear: null, taxType, taxRegime, taxpayerType, residentialStatus, selectedRuleVersion: null, ruleStatus: 'fallback' }, override: { applied: true, overrideId: input.overrideId || null, reason: input.overrideReason || 'Manual tax rate override provided' }, disclaimerKey: 'MANUAL_OVERRIDE' }; 
  }

  // Delegate to strategy
  const strategy = getTaxStrategy(country);
  const strategyResult = strategy.estimate({
    countryCode: country,
    revenue: revenue.toString(),
    deductions: deductions.toString(),
    taxType: taxType as any,
    asOfDate: asOfIso,
    fiscalYear: input.fiscalYear || undefined,
    regionCode: input.regionCode || undefined,
    taxpayerType: taxpayerType,
    taxRegime: taxRegime,
  });

  return {
    amount: serializeMoney(strategyResult.amount),
    ratePercent: strategyResult.ratePercent,
    warnings: strategyResult.warnings,
    components: {
      ...emptyComponents(strategyResult.amount),
      ...strategyResult.components
    },
    basis: {
      countryCode: country,
      revenue: serializeMoney(revenue),
      deductions: serializeMoney(deductions),
      taxableIncome: serializeMoney(taxableIncome),
      serviceScope: input.serviceScope?.trim() || null,
      regionCode: input.regionCode?.trim().toUpperCase() || null,
      customerScope: input.customerScope?.trim() || null,
      asOfDate: asOfIso,
      method: strategyResult.metadata.method === 'logic_engine' ? 'rule_engine' : 'fallback',
      providerRatePercent: null,
      fiscalYear: input.fiscalYear || null,
      assessmentYear: null,
      sourceRuleFiscalYear: null,
      sourceRuleAssessmentYear: null,
      taxType,
      taxRegime,
      taxpayerType,
      residentialStatus,
      selectedRuleVersion: strategyResult.metadata.ruleVersion,
      ruleStatus: 'fallback'
    },
    override: { applied: false, overrideId: null, reason: null },
    disclaimerKey: strategyResult.metadata.method === 'logic_engine' ? 'AUTO_RULE' : 'FALLBACK_RULE',
  };
};
