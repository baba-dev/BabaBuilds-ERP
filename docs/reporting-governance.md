# Reporting Governance & Explainability

## Scope
This document records governance controls for dashboard KPI/report lines and accounting policy checks introduced in version `2026.04.11`.

## Authoritative report line mapping
Source of truth is implemented in `lib/reporting/definitions.ts` as `REPORT_DEFINITION_CATALOG`.

- `kpi.totalRevenue` → `Invoice`, `InvoiceLine` with billed amount transformation `grandTotal ?? totalAmount`.
- `kpi.totalWealth` → `Investment` aggregated with decimal-safe normalization.
- `kpi.estimatedTax` → `Invoice`, `Investment`, `TaxRateOverride` with precedence-controlled tax engine.
- `chart.revenue.monthly` → `Invoice` grouped by billing-month token/date fallback.

## Accounting policy validation coverage
Source of truth is implemented in `lib/reporting/accounting-policy.ts` and validated by `validateAccountingPolicyControls` in `lib/reporting/report-governance.ts`.

Covered domains:
- Revenue recognition (`REV-001`)
- Deferred revenue (`REV-002`)
- Accruals (`ACC-001`, `ACC-002`, `ACC-003`)
- Tax logic (`TAX-001`, `TAX-002`)

## Deterministic regression testing
Regression harness: `lib/reporting/report-governance.test.ts`

Deterministic fixtures include:
- Invoices with explicit billed/taxed values
- Partial/complete payments for deferred revenue
- Journal accrual entries with cutoff filtering
- 80C deduction rows to exercise capped deduction logic

Expected stable outputs:
- Recognized revenue: `1975.00`
- Deferred revenue: `595.00`
- Accrual balance: `80.00`
- Estimated tax: `0.00`

## Versioning & change control
- Report definitions: `REPORT_DEFINITION_CATALOG.version` + `REPORT_DEFINITION_CHANGELOG`
- Accounting rules: `ACCOUNTING_POLICY_PACK.version` + `ACCOUNTING_POLICY_CHANGELOG`
- Regression snapshots include both versions in `controls` metadata.

## Explainability artifacts
`runReportRegression` emits `report_figure_trace` artifacts for:
- `kpi.totalRevenue`
- `kpi.deferredRevenue`
- `kpi.accrualBalance`

Each artifact includes:
- Figure ID and computed value
- Source entries (table + ID)
- Per-entry contribution and explanatory notes
