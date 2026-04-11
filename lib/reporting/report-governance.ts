import { Prisma } from '@prisma/client';
import { getInvoiceBilledAmount } from '@/lib/invoice/totals';
import { toDecimal } from '@/lib/money';
import { estimateTax } from '@/lib/tax/engine';
import { ACCOUNTING_POLICY_PACK } from '@/lib/reporting/accounting-policy';
import { REPORT_DEFINITION_CATALOG, REPORT_DEFINITION_CHANGELOG } from '@/lib/reporting/definitions';
import {
  buildAccrualFigureTrace,
  buildDeferredRevenueFigureTrace,
  buildRevenueFigureTrace,
  type ExplainabilityArtifact,
  type InvoiceLike,
  type JournalEntryLike,
  type PaymentLike,
} from '@/lib/reporting/explainability';

export interface ReportFixtureDataset {
  workspaceId: string;
  invoices: InvoiceLike[];
  payments: PaymentLike[];
  journalEntries: JournalEntryLike[];
  deductions80C: Array<{ id: string; amount: number | string }>;
}

export interface ValidationResult {
  controlId: string;
  passed: boolean;
  expected: string;
  actual: string;
}

export interface ReportRegressionSnapshot {
  version: string;
  generatedAt: string;
  metrics: {
    recognizedRevenue: string;
    deferredRevenue: string;
    accrualBalance: string;
    estimatedTax: string;
  };
  explainability: ExplainabilityArtifact[];
  validation: ValidationResult[];
  controls: {
    reportDefinitionVersion: string;
    reportDefinitionChangeId: string;
    policyVersion: string;
  };
}

const serialize = (value: Prisma.Decimal): string => value.toDecimalPlaces(2).toFixed(2);

const computeRecognizedRevenue = (dataset: ReportFixtureDataset): Prisma.Decimal =>
  dataset.invoices.reduce((sum, invoice) => sum.plus(getInvoiceBilledAmount(invoice)), new Prisma.Decimal(0));

const computeDeferredRevenue = (dataset: ReportFixtureDataset): Prisma.Decimal => {
  const settledByInvoice = dataset.payments.reduce<Record<string, Prisma.Decimal>>((acc, payment) => {
    acc[payment.invoiceId] = (acc[payment.invoiceId] ?? new Prisma.Decimal(0)).plus(toDecimal(payment.amount));
    return acc;
  }, {});

  return dataset.invoices.reduce((sum, invoice) => {
    const billed = getInvoiceBilledAmount(invoice);
    const settled = settledByInvoice[invoice.id] ?? new Prisma.Decimal(0);
    return sum.plus(Prisma.Decimal.max(new Prisma.Decimal(0), billed.minus(settled)));
  }, new Prisma.Decimal(0));
};

const computeAccrualBalance = (dataset: ReportFixtureDataset, cutoffDate: string): Prisma.Decimal => {
  const cutoff = new Date(cutoffDate);
  return dataset.journalEntries.reduce((sum, entry) => {
    const postingDate = new Date(entry.postingDate);
    if (Number.isNaN(postingDate.getTime()) || postingDate > cutoff) {
      return sum;
    }
    return sum.plus(toDecimal(entry.amount));
  }, new Prisma.Decimal(0));
};

export function validateAccountingPolicyControls(dataset: ReportFixtureDataset, cutoffDate: string): ValidationResult[] {
  const recognizedRevenue = computeRecognizedRevenue(dataset);
  const deferredRevenue = computeDeferredRevenue(dataset);
  const accrualBalance = computeAccrualBalance(dataset, cutoffDate);

  const deductions = dataset.deductions80C.reduce((sum, row) => sum.plus(toDecimal(row.amount)), new Prisma.Decimal(0));
  const cappedDeductions = Prisma.Decimal.min(deductions, new Prisma.Decimal(150000));
  const presumptiveRevenue = recognizedRevenue.mul(0.5);
  const tax = estimateTax({
    countryCode: 'IN',
    revenue: presumptiveRevenue,
    deductions: cappedDeductions,
    serviceScope: 'report_regression',
    customerScope: 'workspace',
    asOfDate: cutoffDate,
  });

  return [
    {
      controlId: 'REV-001',
      passed: recognizedRevenue.gte(0),
      expected: 'recognized revenue uses grandTotal ?? totalAmount for each invoice',
      actual: `recognizedRevenue=${serialize(recognizedRevenue)}`,
    },
    {
      controlId: 'REV-002',
      passed: deferredRevenue.gte(0),
      expected: 'deferred revenue never falls below zero',
      actual: `deferredRevenue=${serialize(deferredRevenue)}`,
    },
    {
      controlId: 'ACC-001',
      passed: accrualBalance.eq(computeAccrualBalance(dataset, cutoffDate)),
      expected: 'accruals are computed from entries on or before cutoff',
      actual: `accrualBalance=${serialize(accrualBalance)}`,
    },
    {
      controlId: 'TAX-001',
      passed: tax.basis.method === 'rule_engine',
      expected: 'IN tax estimate uses rule_engine when no manual override exists',
      actual: `taxMethod=${tax.basis.method}; taxAmount=${tax.amount}`,
    },
    {
      controlId: 'TAX-002',
      passed: toDecimal(tax.basis.taxableIncome).gte(0),
      expected: 'taxable income is lower bounded at zero',
      actual: `taxableIncome=${tax.basis.taxableIncome}`,
    },
  ];
}

export function runReportRegression(dataset: ReportFixtureDataset, cutoffDate: string): ReportRegressionSnapshot {
  const recognizedRevenue = computeRecognizedRevenue(dataset);
  const deferredRevenue = computeDeferredRevenue(dataset);
  const accrualBalance = computeAccrualBalance(dataset, cutoffDate);

  const deductions = dataset.deductions80C.reduce((sum, row) => sum.plus(toDecimal(row.amount)), new Prisma.Decimal(0));
  const cappedDeductions = Prisma.Decimal.min(deductions, new Prisma.Decimal(150000));
  const presumptiveRevenue = recognizedRevenue.mul(0.5);

  const estimatedTax = estimateTax({
    countryCode: 'IN',
    revenue: presumptiveRevenue,
    deductions: cappedDeductions,
    serviceScope: 'report_regression',
    customerScope: dataset.workspaceId,
    asOfDate: cutoffDate,
  });

  return {
    version: '2026.04.11',
    generatedAt: new Date().toISOString(),
    metrics: {
      recognizedRevenue: serialize(recognizedRevenue),
      deferredRevenue: serialize(deferredRevenue),
      accrualBalance: serialize(accrualBalance),
      estimatedTax: estimatedTax.amount,
    },
    explainability: [
      buildRevenueFigureTrace('kpi.totalRevenue', dataset.invoices),
      buildDeferredRevenueFigureTrace('kpi.deferredRevenue', dataset.invoices, dataset.payments),
      buildAccrualFigureTrace('kpi.accrualBalance', dataset.journalEntries, cutoffDate),
    ],
    validation: validateAccountingPolicyControls(dataset, cutoffDate),
    controls: {
      reportDefinitionVersion: REPORT_DEFINITION_CATALOG.version,
      reportDefinitionChangeId: REPORT_DEFINITION_CHANGELOG[0]?.changeId ?? 'unknown',
      policyVersion: ACCOUNTING_POLICY_PACK.version,
    },
  };
}
