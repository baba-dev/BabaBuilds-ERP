export type SourceTable =
  | 'Invoice'
  | 'InvoiceLine'
  | 'Payment'
  | 'JournalEntry'
  | 'TaxRateOverride'
  | 'Investment'
  | 'Client'
  | 'ServiceOrder'
  | 'ServiceTemplate';

export const SHOP_ORDER_STATUSES = ['PAID', 'PENDING', 'FAILED', 'REFUNDED'] as const;
export type ShopOrderStatus = (typeof SHOP_ORDER_STATUSES)[number];

export const SHOP_KPI_CONTRACT = {
  totalOrders: {
    id: 'kpi.shop.totalOrders',
    label: 'Shop Orders',
    sourceTables: ['ServiceOrder'] as SourceTable[],
  },
  paidOrders: {
    id: 'kpi.shop.paidOrders',
    label: 'Paid Shop Orders',
    sourceTables: ['ServiceOrder'] as SourceTable[],
  },
  paidRevenue: {
    id: 'kpi.shop.paidRevenue',
    label: 'Shop Paid Revenue',
    sourceTables: ['ServiceOrder'] as SourceTable[],
  },
  publishedServices: {
    id: 'kpi.shop.publishedServices',
    label: 'Published Shop Services',
    sourceTables: ['ServiceTemplate'] as SourceTable[],
  },
} as const;

export const SHOP_STATUS_COUNT_DEFAULTS: Record<ShopOrderStatus, number> = {
  PAID: 0,
  PENDING: 0,
  FAILED: 0,
  REFUNDED: 0,
};

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
  {
    id: SHOP_KPI_CONTRACT.totalOrders.id,
    label: SHOP_KPI_CONTRACT.totalOrders.label,
    report: 'dashboard',
    sourceTables: SHOP_KPI_CONTRACT.totalOrders.sourceTables,
    transformationLogic: [
      'Select workspace service orders from ServiceOrder.',
      'Count all rows irrespective of payment status.',
      'Expose total order count in shop overview KPI surfaces.',
    ],
    owner: 'commerce-platform',
    accountingPolicyRefs: ['REV-001'],
  },
  {
    id: SHOP_KPI_CONTRACT.paidOrders.id,
    label: SHOP_KPI_CONTRACT.paidOrders.label,
    report: 'dashboard',
    sourceTables: SHOP_KPI_CONTRACT.paidOrders.sourceTables,
    transformationLogic: [
      'Select workspace service orders where status = PAID.',
      'Count paid rows for conversion and settlement KPIs.',
      'Use same status taxonomy defined in SHOP_ORDER_STATUSES.',
    ],
    owner: 'commerce-platform',
    accountingPolicyRefs: ['REV-001'],
  },
  {
    id: SHOP_KPI_CONTRACT.paidRevenue.id,
    label: SHOP_KPI_CONTRACT.paidRevenue.label,
    report: 'dashboard',
    sourceTables: SHOP_KPI_CONTRACT.paidRevenue.sourceTables,
    transformationLogic: [
      'Select workspace service orders where status = PAID.',
      'Aggregate amount via decimal-safe summation.',
      'Expose serialized numeric value in shop + dashboard KPI cards.',
    ],
    owner: 'commerce-platform',
    accountingPolicyRefs: ['REV-001'],
  },
  {
    id: SHOP_KPI_CONTRACT.publishedServices.id,
    label: SHOP_KPI_CONTRACT.publishedServices.label,
    report: 'dashboard',
    sourceTables: SHOP_KPI_CONTRACT.publishedServices.sourceTables,
    transformationLogic: [
      'Select workspace service templates where showInShop = true.',
      'Count published templates to represent live storefront catalog depth.',
      'Reuse for shop catalog and dashboard KPI parity.',
    ],
    owner: 'commerce-platform',
    accountingPolicyRefs: ['REV-001'],
  },
];

export const REPORT_DEFINITION_CATALOG: VersionedDefinitionSet = {
  artifact: 'report_definition_catalog',
  version: '2026.04.11.1',
  approvedAt: '2026-04-11T12:00:00.000Z',
  checksum: 'sha256:a13f9626e2e0f7978e08eef75f766f0016954f51f5d6e0f658f88cb18f7fbb3f',
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
    changeId: 'RFC-2026-0411-SHOP-KPI-CONTRACT-01',
    timestamp: '2026-04-11T12:00:00.000Z',
    author: 'codex-agent',
    summary:
      'Added shared Shop KPI contracts and status taxonomy for total orders, paid orders, paid revenue, and published services.',
    affectedIds: [
      SHOP_KPI_CONTRACT.totalOrders.id,
      SHOP_KPI_CONTRACT.paidOrders.id,
      SHOP_KPI_CONTRACT.paidRevenue.id,
      SHOP_KPI_CONTRACT.publishedServices.id,
    ],
    previousVersion: '2026.04.11',
    newVersion: REPORT_DEFINITION_CATALOG.version,
  },
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
