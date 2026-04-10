# Dead-letter & Compensation Runbook (Financial Operations)

## Purpose
Provide operational steps for partial failures and replay-safe recovery for payment and booking flows.

## Dead-letter queue (DLQ) policy

### What is dead-lettered
1. `INVOICE_PAYMENT_CAPTURE` failures after lock acquisition but before `CONSUMED` state.
2. `RAZORPAY_SUBSCRIPTION_VERIFY` failures after signature verification but before transaction commit.
3. External dependency failures (Razorpay/Stripe API timeout) after request admission.

### Where dead-letter data lives now
- Primary source: `FinancialOperationIdempotency` rows left in `PENDING` + app logs.
- Secondary source: provider dashboards (`razorpay_payment_id`, Stripe checkout/session ids).

### DLQ SLO
- **Detect** stale pending operations older than 15 minutes.
- **Triage** within 30 minutes during business hours.
- **Resolve** (replay or compensate) within 4 hours.

## Detection queries (manual)

```sql
-- Stuck operations
SELECT workspaceId, operation, idempotencyKey, createdAt, updatedAt
FROM FinancialOperationIdempotency
WHERE status = 'PENDING'
  AND createdAt < datetime('now', '-15 minutes')
ORDER BY createdAt ASC;
```

```sql
-- Potential duplicate provider callbacks blocked by uniqueness
SELECT workspaceId, providerReference, COUNT(*)
FROM BillingTransaction
WHERE providerReference IS NOT NULL
GROUP BY workspaceId, providerReference
HAVING COUNT(*) > 1;
```

## Compensation workflows

### A) Invoice payment capture partial failure
1. Look up idempotency record + invoice state.
2. If invoice `amountReceived` already includes intended payment and inventory movement exists, mark lock `CONSUMED` with reconstructed response.
3. If invoice not updated, safely retry request with same idempotency key.
4. If invoice updated but inventory movement missing, create compensating movement entry with same reference and operator note.

### B) Razorpay verify partial failure
1. Validate payment in provider dashboard (`captured/authorized`).
2. Check workspace subscription fields and billing transaction by `providerReference`.
3. If subscription updated but billing transaction missing, insert missing ledger row (same `providerReference`).
4. If neither updated, replay request with same idempotency key.

### C) Duplicate/late webhook events
1. Re-submit with same idempotency key to get cached result.
2. If key unknown, use provider payment id as synthetic key for reconciliation replay.

## Escalation conditions
- More than 5 stale financial `PENDING` locks for one workspace.
- Any mismatch between provider-captured charge and local subscription/invoice state for over 1 hour.
- Repeated `IDEMPOTENCY_HASH_MISMATCH` indicates possible client bug or abuse.

## Metrics to track
- `financial_idempotency_pending_total`
- `financial_idempotency_replay_total`
- `financial_idempotency_hash_mismatch_total`
- `payment_write_conflict_total`
- `billing_provider_duplicate_reference_total`

## Post-incident checklist
- Root cause tagged: network timeout / db conflict / provider duplicate / code defect.
- Run replay drill for same scenario in staging.
- Add regression test if deterministic.
