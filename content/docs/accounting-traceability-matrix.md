# Accounting Event → Ledger Traceability Matrix

This document defines how every money-impacting event is posted into the accounting sub-ledger and traced to downstream reporting.

## Event inventory and posting map

| Event type | Operational source | Debit account | Credit account | Timestamp policy | Currency policy |
|---|---|---|---|---|---|
| `INVOICE_CREATED` | `Invoice` | `1100_AR` | `4000_REVENUE` | Event timestamp (`invoiceDate`) | Transaction currency |
| `PAYMENT_CAPTURED` | `BillingTransaction` / invoice settlement | `1000_CASH` | `1100_AR` | Capture/settlement timestamp | Transaction currency |
| `REFUND_ISSUED` | Billing refund webhook/import | `4090_SALES_RETURNS` | `1000_CASH` | Settlement timestamp | Transaction currency |
| `CREDIT_NOTE_ISSUED` | Credit note workflow | `4095_CREDIT_NOTES` | `1100_AR` | Event timestamp | Transaction currency |
| `CHARGEBACK_RECORDED` | Processor dispute webhook | `6150_CHARGEBACK_LOSS` | `1000_CASH` | Settlement timestamp | Transaction currency |
| `FX_CONVERSION_RECORDED` | Treasury/FX conversion job | `1001_FX_HOLDING` | `1000_CASH` | Event timestamp | Workspace base currency |
| `WRITE_OFF_RECORDED` | Collections / dunning workflow | `6120_BAD_DEBT` | `1100_AR` | Event timestamp | Transaction currency |
| `MANUAL_ADJUSTMENT` | Admin adjustment workflow | `9990_SUSPENSE` | `9991_SUSPENSE_OFFSET` | Event timestamp | Transaction currency |

## Automated controls

Nightly integrity checks enforce:

1. `DOUBLE_ENTRY_BALANCED` (debits equal credits per transaction).
2. `CURRENCY_CONSISTENCY` (journal line currency equals transaction posting currency).
3. `POSTING_TIMESTAMP_POLICY` (journal line posted timestamp equals transaction posted timestamp).
4. `IMMUTABLE_POSTED_ENTRIES` (all posted lines remain immutable in operational use).
5. `NO_ORPHAN_JOURNAL_LINES` (no transaction without journal lines).
6. `OPS_LEDGER_RECON_INVOICE_COUNT` (operational invoice count reconciles with `INVOICE_CREATED` entries).
7. `OPS_LEDGER_RECON_PAYMENT_COUNT` (paid billing transaction count reconciles with `PAYMENT_CAPTURED` entries).
8. `OPS_LEDGER_REPORTING_REVENUE_MATCH` (invoice aggregate equals recognized ledger revenue).

## Traceability matrix keys

Each `AccountingTransaction` stores trace keys for end-to-end auditability:

- `requestId`: API request correlation key.
- `jobId`: asynchronous job/worker identifier.
- `sourceTable` + `sourceId`: operational record linkage.
- `sourceRef`: human-readable reference (invoice number, provider reference).
- `statementBatchId`: financial statement/export batch identifier.

The API endpoint `GET /api/admin/accounting/traceability` emits row-level matrix output for audit exports.
