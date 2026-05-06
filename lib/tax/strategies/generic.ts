import { TaxStrategy, TaxEstimateInput, TaxEstimateResult } from './types';
import { Prisma } from '@prisma/client';
import { estimateTaxFromRules } from '@/lib/tax/rules';

export class GenericTaxStrategy implements TaxStrategy {
  constructor(public countryCode: string) {}

  estimate(input: TaxEstimateInput): TaxEstimateResult {
    const revenue = new Prisma.Decimal(input.revenue);
    const deductions = new Prisma.Decimal(input.deductions ?? 0);
    const taxableIncome = Prisma.Decimal.max(0, revenue.minus(deductions));
    
    const rate = estimateTaxFromRules({
      countryCode: this.countryCode,
      regionCode: input.regionCode,
    });
    
    const amount = taxableIncome.mul(rate);

    return {
      amount,
      ratePercent: rate * 100,
      warnings: [`Using generic rate for ${this.countryCode} (${rate * 100}%).`],
      components: {
        taxableIncome: taxableIncome.toString(),
        rateApplied: rate.toString(),
      },
      metadata: {
        countryCode: this.countryCode,
        ruleVersion: 'GENERIC-DYNAMIC-v1',
        method: 'flat_rate',
      },
    };
  }

  getDepositDueDate(deductedAt: Date): Date {
    // Default to end of next month
    return new Date(Date.UTC(deductedAt.getUTCFullYear(), deductedAt.getUTCMonth() + 2, 0));
  }
}
