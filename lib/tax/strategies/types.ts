import { Prisma } from '@prisma/client';

export type TaxType = 'income_tax' | 'gst' | 'vat' | 'sales_tax' | 'withholding';

export interface TaxEstimateInput {
  countryCode: string;
  revenue: Prisma.Decimal | number | string;
  deductions?: Prisma.Decimal | number | string;
  taxType?: TaxType;
  asOfDate?: string | Date;
  fiscalYear?: string;
  // Metadata for complex rules
  regionCode?: string;
  taxpayerType?: string;
  taxRegime?: string;
}

export interface TaxEstimateResult {
  amount: Prisma.Decimal;
  ratePercent: number;
  warnings: string[];
  components: Record<string, unknown>;
  metadata: {
    countryCode: string;
    ruleVersion: string;
    method: 'logic_engine' | 'flat_rate' | 'manual_override';
  };
}

export interface TaxStrategy {
  countryCode: string;
  estimate(input: TaxEstimateInput): TaxEstimateResult;
  getDepositDueDate(deductedAt: Date): Date;
}
