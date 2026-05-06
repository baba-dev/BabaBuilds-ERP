import { TaxStrategy, TaxEstimateInput, TaxEstimateResult } from './types';
import { Prisma } from '@prisma/client';

type IndiaRule = {
  fiscalYear: string;
  slabs: Array<{ floor: number; width: number | null; rate: number }>;
  rebate: { threshold: number; maxRebate: number };
  standardDeduction: number;
  cessRate: number;
};

const INDIA_RULES: Record<string, IndiaRule> = {
  '2024-25': {
    fiscalYear: '2024-25',
    slabs: [
      { floor: 300000, width: 400000, rate: 0.05 },
      { floor: 700000, width: 300000, rate: 0.10 },
      { floor: 1000000, width: 200000, rate: 0.15 },
      { floor: 1200000, width: 300000, rate: 0.20 },
      { floor: 1500000, width: null, rate: 0.30 }
    ],
    rebate: { threshold: 700000, maxRebate: 25000 },
    standardDeduction: 50000,
    cessRate: 0.04
  },
  '2025-26': {
    fiscalYear: '2025-26',
    slabs: [
      { floor: 400000, width: 400000, rate: 0.05 },
      { floor: 800000, width: 400000, rate: 0.10 },
      { floor: 1200000, width: 400000, rate: 0.15 },
      { floor: 1600000, width: 400000, rate: 0.20 },
      { floor: 2000000, width: 400000, rate: 0.25 },
      { floor: 2400000, width: null, rate: 0.30 }
    ],
    rebate: { threshold: 1200000, maxRebate: 60000 },
    standardDeduction: 75000,
    cessRate: 0.04
  },
};

export class IndiaTaxStrategy implements TaxStrategy {
  countryCode = 'IN';

  estimate(input: TaxEstimateInput): TaxEstimateResult {
    const revenue = new Prisma.Decimal(input.revenue);
    const deductions = new Prisma.Decimal(input.deductions ?? 0);
    const taxableIncome = Prisma.Decimal.max(0, revenue.minus(deductions));
    
    // Resolve Fiscal Year (simplification of logic from engine.ts)
    const fyLabel = input.fiscalYear || '2024-25';
    const rules = INDIA_RULES[fyLabel] || INDIA_RULES['2024-25'];

    const std = input.taxpayerType === 'individual' ? new Prisma.Decimal(rules.standardDeduction) : new Prisma.Decimal(0);
    const normalIncome = Prisma.Decimal.max(0, taxableIncome.minus(std));

    // Slab calculation
    let grossTax = new Prisma.Decimal(0);
    for (const slab of rules.slabs) {
      if (normalIncome.gt(slab.floor)) {
        const taxableInSlab = slab.width === null 
          ? normalIncome.minus(slab.floor) 
          : Prisma.Decimal.min(normalIncome.minus(slab.floor), new Prisma.Decimal(slab.width));
        grossTax = grossTax.plus(taxableInSlab.mul(slab.rate));
      }
    }

    const threshold = new Prisma.Decimal(rules.rebate.threshold);
    const maxRebate = new Prisma.Decimal(rules.rebate.maxRebate);
    const eligibleRebate = normalIncome.lte(threshold) ? Prisma.Decimal.min(grossTax, maxRebate) : new Prisma.Decimal(0);

    let taxAfter = grossTax.minus(eligibleRebate);
    const cess = taxAfter.mul(rules.cessRate);
    const final = taxAfter.plus(cess);

    return {
      amount: final,
      ratePercent: taxableIncome.isZero() ? 0 : final.div(taxableIncome).mul(100).toNumber(),
      warnings: ['Not legal advice.'],
      components: {
        grossTax: grossTax.toString(),
        rebate: eligibleRebate.toString(),
        cess: cess.toString(),
      },
      metadata: {
        countryCode: 'IN',
        ruleVersion: rules.fiscalYear,
        method: 'logic_engine',
      },
    };
  }

  getDepositDueDate(deductedAt: Date): Date {
    // Indian TDS is due on the 7th of the following month
    return new Date(Date.UTC(deductedAt.getUTCFullYear(), deductedAt.getUTCMonth() + 1, 7));
  }
}
