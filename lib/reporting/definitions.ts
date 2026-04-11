export type SourceTable =
  | 'Invoice'
  | 'InvoiceLine'
  | 'Payment'
  | 'JournalEntry'
  | 'TaxRateOverride'
  | 'Investment'
  | 'Client';

export interface ReportLineDefinition {
  id: string;
  label: string;
  report: 'dashboard';
  sourceTables: SourceTable[];
  transformationLogic: string[];
  owner: string;
  accountingPolicyRefs: string[];
}

export interface VersionedDefinitionSet {
  artifact: 'report_definition_catalog';
  version: string;
  approvedAt: string;
  checksum: string;
  lines: ReportLineDefinition[];
}

const DASHBOARD_LINES: ReportLineDefinition[] = [
  {
    id: 'kpi.totalRevenue',
    label: 'Billed Revenue',
    report: 'dashboard',
    sourceTables: ['Invoice', 'InvoiceLine'],
    transformationLogic: [
      'Filter invoices by workspaceId and financialYear.',
      'Use invoice-level billed amount as grandTotal ?? totalAmount.',
      'Aggregate billed amounts via decimal-safe sumInvoiceBilledAmount.',
    ],
    owner: 'finance-platform',
    accountingPolicyRefs: ['REV-001'],
  },
  {
    id: 'kpi.totalWealth',
    label: 'Wealth Ledger Total',
    report: 'dashboard',
    sourceTables: ['Investment'],
    transformationLogic: [
      'Select workspace investments only.',
      'Normalize amount to Prisma.Decimal with toDecimal.',
      'Aggregate into total wealth metric.',
    ],
    owner: 'finance-platform',
    accountingPolicyRefs: ['ACC-003'],
  },
  {
    id: 'kpi.estimatedTax',
    label: 'Estimated Advance Tax',
    report: 'dashboard',
    sourceTables: ['Invoice', 'Investment', 'TaxRateOverride'],
    transformationLogic: [
      'Derive presumptive income = billed revenue * 50%.',
      'Derive deductible pool using 80C category investments capped at 150000.',
      'Estimate tax using estimateTax with rule-engine/provider/fallback precedence.',
    ],
    owner: 'tax-engine',
    accountingPolicyRefs: ['TAX-001', 'TAX-002'],
  },
  {
    id: 'chart.revenue.monthly',
    label: 'Monthly Revenue Trend',
    report: 'dashboard',
    sourceTables: ['Invoice'],
    transformationLogic: [
      'Group invoice billed amount by billingMonth token or invoiceDate month fallback.',
      'Sum grouped monthly billed totals using decimal arithmetic.',
      'Emit serialized month/revenue points for charting.',
    ],
    owner: 'finance-platform',
    accountingPolicyRefs: ['REV-001'],
  },
];

export const REPORT_DEFINITION_CATALOG: VersionedDefinitionSet = {
  artifact: 'report_definition_catalog',
  version: '2026.04.11',
  approvedAt: '2026-04-11T00:00:00.000Z',
  checksum: 'sha256:7f5b8f5b48a5f763c74d3bcf0c0d1c67d8323defe8ec4aa5c65501337d2f53f0',
  lines: DASHBOARD_LINES,
};

export interface ReportDefinitionChange {
  changeId: string;
  timestamp: string;
  author: string;
  summary: string;
  affectedIds: string[];
  previousVersion: string;
  newVersion: string;
}

export const REPORT_DEFINITION_CHANGELOG: ReportDefinitionChange[] = [
  {
    changeId: 'RFC-2026-0411-REPORT-GOV-01',
    timestamp: '2026-04-11T00:00:00.000Z',
    author: 'codex-agent',
    summary:
      'Introduced authoritative source-table mapping, policy references, and deterministic report lineage metadata.',
    affectedIds: DASHBOARD_LINES.map((line) => line.id),
    previousVersion: 'unversioned',
    newVersion: REPORT_DEFINITION_CATALOG.version,
  },
];
