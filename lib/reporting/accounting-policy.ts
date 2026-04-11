export interface AccountingPolicyRule {
  id: 'REV-001' | 'REV-002' | 'ACC-001' | 'ACC-002' | 'ACC-003' | 'TAX-001' | 'TAX-002';
  domain: 'revenue_recognition' | 'deferred_revenue' | 'accruals' | 'tax';
  title: string;
  statement: string;
  controlChecks: string[];
}

export interface VersionedPolicyPack {
  artifact: 'accounting_policy_pack';
  version: string;
  approvedAt: string;
  approvedBy: string;
  checksum: string;
  rules: AccountingPolicyRule[];
}

export const ACCOUNTING_POLICY_PACK: VersionedPolicyPack = {
  artifact: 'accounting_policy_pack',
  version: '2026.04.11',
  approvedAt: '2026-04-11T00:00:00.000Z',
  approvedBy: 'finance-controller',
  checksum: 'sha256:2968c3c8e4d2e3ceb4c4250ddfd15756e8d5c68482f2042435376850f620f3f5',
  rules: [
    {
      id: 'REV-001',
      domain: 'revenue_recognition',
      title: 'Recognized revenue is based on billed invoice amount',
      statement:
        'Revenue for KPI and trend reporting shall be calculated from the recognized billed amount where grandTotal takes precedence over totalAmount when available.',
      controlChecks: [
        'Every invoice included in revenue aggregation contributes grandTotal ?? totalAmount.',
        'Revenue aggregators in dashboard and ledger share the same billed-amount function.',
      ],
    },
    {
      id: 'REV-002',
      domain: 'deferred_revenue',
      title: 'Unsettled invoice balances are tracked as deferred revenue',
      statement:
        'Deferred revenue equals max(0, recognized billed amount minus settled payments) on each invoice, and cannot be negative.',
      controlChecks: [
        'Deferred revenue is capped at zero lower bound per invoice.',
        'Report total deferred revenue equals sum of per-invoice deferred balances.',
      ],
    },
    {
      id: 'ACC-001',
      domain: 'accruals',
      title: 'Accrual entries are based on posting dates',
      statement:
        'Accrual balances are recognized from journal entries posted on or before report cut-off date with deterministic decimal accumulation.',
      controlChecks: [
        'Exclude journal entries posted after cut-off date.',
        'Use decimal-safe arithmetic for accrual rollups.',
      ],
    },
    {
      id: 'ACC-002',
      domain: 'accruals',
      title: 'Accrual reversals net against original accruals',
      statement:
        'Accrual reversal entries should offset the same account and preserve a transparent net amount trace.',
      controlChecks: [
        'Net accrual equals sum(accrual debits/credits including reversal lines).',
        'Explainability trail includes each contributing journal entry.',
      ],
    },
    {
      id: 'ACC-003',
      domain: 'accruals',
      title: 'Investment ledger supports wealth KPI',
      statement: 'Investment amounts are recorded as ledger-backed assets and summed for wealth reporting.',
      controlChecks: [
        'Wealth KPI only includes workspace investment entries.',
        'Every wealth point is traceable to investment IDs.',
      ],
    },
    {
      id: 'TAX-001',
      domain: 'tax',
      title: 'Tax estimate must follow documented precedence',
      statement:
        'Manual override rate takes precedence over country rule-engine, which takes precedence over provider rate, then fallback rate.',
      controlChecks: [
        'When overrideRatePercent is provided, method is manual_override.',
        'For India without override, method is rule_engine.',
        'Unknown country without override resolves to provider_rate or fallback.',
      ],
    },
    {
      id: 'TAX-002',
      domain: 'tax',
      title: 'Taxable income uses bounded deductions',
      statement:
        'Taxable income equals max(0, revenue - deductions), and deductions cannot be less than zero.',
      controlChecks: [
        'Negative deductions are normalized to zero before tax computation.',
        'Taxable income is lower-bounded at zero.',
      ],
    },
  ],
};

export const ACCOUNTING_POLICY_CHANGELOG = [
  {
    changeId: 'RFC-2026-0411-POLICY-GOV-01',
    timestamp: '2026-04-11T00:00:00.000Z',
    author: 'codex-agent',
    previousVersion: 'unversioned',
    newVersion: ACCOUNTING_POLICY_PACK.version,
    summary: 'Codified revenue recognition, deferred revenue, accrual, and tax policies with control checks.',
  },
];
