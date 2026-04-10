# Payment & Booking Idempotency / Replay Review (2026-04-10)

## Scope reviewed
- `PATCH /api/invoices/[id]/pay` (manual + operator payment capture).
- `POST /api/razorpay/verify` (subscription payment verification callback).
- `PATCH /api/settings/billing/payment-method` (provider confirmation callback).
- Async financial processors:
  - `GET /api/cron/process-retainers` (automated retainer invoice generation).
  - `GET /api/cron/alerts` (payment reminder producer; no balance mutation).

## Idempotency key design

### 1) Invoice payment capture (`PATCH /api/invoices/[id]/pay`)
- **Key source**: `Idempotency-Key` header, body `idempotencyKey`, or deterministic fallback `auto:<invoiceId>:<amount>:<date>`.
- **Hashing**: canonical request hash over `{ invoiceId, amountReceived, dateReceived }`.
- **Replay behavior**:
  - same key + same hash + `CONSUMED` => return stored response (`replayed: true`).
  - same key + different hash => HTTP 409.
  - same key + `PENDING` => HTTP 409 (`REQUEST_IN_PROGRESS`).

### 2) Razorpay verification (`POST /api/razorpay/verify`)
- **Key source**: `Idempotency-Key` header, else `razorpay_payment_id`.
- **Hashing**: canonical request hash over order/payment/signature triplet.
- **Replay behavior**: same as above.

### 3) Billing payment method attachment (`PATCH /api/settings/billing/payment-method`)
- **Current state**: callback validates signatures and provider state, but no persisted idempotency ledger yet.
- **Compensating control**: operation is mostly last-write-wins on `Workspace` method metadata; no direct cash movement.
- **Follow-up**: move this endpoint to shared financial idempotency helper if provider duplicate callbacks become noisy.

## Transaction boundaries & isolation

### Invoice payment critical write path
- Boundary is now a **single Prisma DB transaction**:
  - load invoice + line items,
  - validate business rules against cumulative amount,
  - CAS update of invoice balances/status,
  - inventory decrements + movement journal on first transition to `PAID`.
- Concurrency control: `updateMany` compare-and-swap on previous `status` + `amountReceived` (write-write conflict emits 409 retry).
- Non-transactional side effect: PDF watermarking remains outside DB transaction and is safe to retry.

### Subscription verification critical write path
- Boundary is now a **single Prisma DB transaction**:
  - workspace subscription mutation,
  - billing transaction insert for auditable proof.
- Duplicate protection:
  - idempotency ledger catches request replay.
  - unique key on `(workspaceId, providerReference)` prevents duplicate billing ledger rows.

### Isolation
- SQLite in this deployment gives serialized write transactions; conflicts surface as busy/write conflict.
- Application-level compare-and-swap + idempotency keys are used as deterministic replay controls.

## Concurrency scenario test matrix

| Scenario | Endpoint | Expected control |
|---|---|---|
| Double-click pay | `PATCH /invoices/[id]/pay` | Same key replays or 409-in-progress; CAS avoids double-apply. |
| Retry storm client timeout | `PATCH /invoices/[id]/pay` | First winner consumes lock; retries replay result. |
| Duplicate provider callback | `POST /razorpay/verify` | Key defaults to `payment_id`; replay returns cached result. |
| Delayed callback reorder | `POST /razorpay/verify` | Signature + payment fetch gate; duplicate updates prevented by idempotency + unique provider reference. |
| Cron retries | `process-retainers` | Existing invoice uniqueness and period checks serve as compensating dedupe; still at-least-once. |

## Exactly-once or compensating controls by operation

| Operation | Exactly-once mechanism | Measurable signal |
|---|---|---|
| Invoice payment capture | Persisted idempotency lock + CAS balance update | `FinancialOperationIdempotency.status`, 409 conflict rate, invoice/payment delta checks |
| Subscription payment verify | Persisted idempotency lock + unique provider reference on billing ledger | replay count, duplicate providerReference reject count |
| Payment method setup confirmation | Signature + provider status verification, overwriting workspace metadata | callback count vs successful confirmation count |
| Reminder dispatch (`cron/alerts`) | At-least-once producer; non-financial side effects only | daily reminder volume + error count |

## Dead-letter and compensation
- See runbook: `docs/payments/dead-letter-compensation-runbook.md`.
