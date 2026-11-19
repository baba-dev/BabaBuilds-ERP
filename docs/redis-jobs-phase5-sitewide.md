# Phase 5 sitewide external delivery cutover

Tracks #673. This is a deliberate **sitewide** scope for the existing C+D email,
Web Push and E report-email queues — **not a single-workspace pilot**.

## Scope and behavior

All ERP workspaces use the existing PostgreSQL delivery ledger and Redis 6387
transport for **eligible keyed nonfinancial notification events** and every
due scheduled report. Membership and user preferences, subscription state,
report creator permissions, tenant SMTP credentials, and the existing
provider-uncertainty protocol remain authoritative per workspace.

**Important:** existing notification events without a stable `occurrenceKey`,
and financial/tax/payment/retainer notification families which are deliberately
excluded from the queued-events allowlist, remain on their legacy path. This
cutover is sitewide geographically/tenant-wise, but **not a promise that every
ERP job of every category has moved to Redis**.

Redis messages contain only an opaque delivery ID, with bounded per-channel
polling, rate limiting and per-recipient PostgreSQL `CLAIMED` CAS. Notifications
are scoped by `workspaceId` at the recipient/provider lookup step, even
when the queue scans globally.

## Double-explicit sitewide activation (default OFF)

In the **same protected Node --env-file** used by the ERP web and worker:

- `ERP_REDIS_ENABLED=true`
- `ERP_REDIS_JOBS_ENABLED=true`
- `ERP_REDIS_JOB_WORKER_ENABLED=true` (required by worker)
- `ERP_REDIS_EXTERNAL_DELIVERY_SCOPE=sitewide`
- `ERP_REDIS_SITEWIDE_DELIVERY_APPROVED=true`
- `ERP_REDIS_NOTIFICATION_EMAIL_ENABLED=true`
- `ERP_REDIS_NOTIFICATION_PUSH_ENABLED=true`
- `ERP_REDIS_REPORT_EMAIL_ENABLED=true`

The last three can independently be turned OFF to stop that family's producer
and worker, without affecting the other two. The exact string `sitewide` and
explicit approval `true` are both required. `all`, `*`, empty, or a typo
never activates global routing.

No changes to PostgreSQL migrations, Redis ACLs or other applications.
Existing one-workspace mode stays available only while the sitewide approval
is not enabled.

## One-operation VPS activation

After the protected immutable ERP web deploy is verified on the merged commit,
run a **single** root-owned operator to update only protected ERP app env and
restart **ERP web then ERP worker**. It must fail closed if an unapproved
config override is active, the current release differs, existing external
CLAIMED/PENDING deliveries could get replayed, Redis/postgres/ERP/cohosted
services are down, or existing flags were enabled outside this rollout.

Do not run global `/api/cron/alerts` to test; it initiates financial notices.
The regular scheduled cron triggers newly due reports normally. Do not replay
older provider-uncertain rows; use the existing superadmin Delivery Recovery
page for explicitly approved provider evidence. A global kill switch is to
set `ERP_REDIS_SITEWIDE_DELIVERY_APPROVED=false` and restart the ERP services,
leaving ledger state intact. Turning it OFF routes subsequent eligible events
to legacy synchronous sends; only after all queued sends are drained is that
appropriate as a durable rollback.

After activation, inspect only redacted aggregates in
`/admin/jobs/deliveries` and worker heartbeat. Never log email addresses,
provider secrets, push endpoint authentication, or PDF/report content.
