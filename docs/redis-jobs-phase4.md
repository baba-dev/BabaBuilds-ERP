# Phase 4 — ERP durable background jobs

Tracking issue: #667. This phase adds an **off-by-default** worker and PostgreSQL transactional outbox to process selected internal notifications independently of web requests.

## Inventory and risks (as shipped on main, 2026-11-17)

| Existing path | Behavior | Phase 4 decision |
| --- | --- | --- |
| `lib/notifications/dispatcher.ts` | Synchronously writes in-app notices and sends workspace SMTP/push; delivery failures can be logged without failing the request | Keep legacy path; canary only one **in-app** task deadline channel, with externally delivered channels still handled by existing dispatcher |
| `app/api/cron/alerts` | Scans each workspace and dispatches tasks, renewal, payment and tax notices | Only task deadline **in-app** notices eligible for opt-in outbox; no automatic migration of financial/retainer notifications |
| `app/api/cron/expense-automation` | Creates recurring expense transactions and payables digests | Do not migrate during this phase |
| `lib/reporting/views.ts` | Generates scheduled reports and sends email | No migration until content and recipient idempotency audited |
| `app/api/cron/trial-expiry` | Mutates subscription status | Keep as PostgreSQL-native cron |
| `docs/cron.md` | Documents 17 cron routes but still references legacy PM2 | Update as a separate operational documentation pass |

## Isolation and authoritative state

- Existing ERP Redis 6384: best-effort route rate limiting; **unchanged**.
- Existing ERP Redis 6385: AOF, noeviction, password/passkey security counters; **unchanged**.
- Existing ERP Redis 6386: bounded dashboard and reporting cache; **unchanged**.
- Proposed **6387**: isolated AOF+noeviction ERP BullMQ job transport, loopback ACL, memory cap selected after VPS headroom audit. Do not assume the port is available.
- PostgreSQL outbox is authoritative: event rows are created before Redis enqueue, job execution and outbox completion are a single database transaction for the pilot. The Redis job has only an opaque row ID; no customer data in Redis.
- Jobs are **at-least-once**. The pilot's PostgreSQL in-app side effect is idempotent via an outbox row lock and atomic commit; future external emails/push must use provider-specific dedupe and cannot promise exactly-once.
- The outbox poller only selects eligible row kinds. Worker errors are sanitized, exponential retry is bounded, and jobs can be inspected without exposing financial payloads.

## Feature flags

New `ERP_REDIS_JOB_URL` (separate from existing `ERP_REDIS_QUEUE_URL`) and `ERP_REDIS_JOB_WORKER_ENABLED=false`, `ERP_REDIS_INAPP_DEADLINE_ENABLED=false`. Existing `ERP_REDIS_JOBS_ENABLED=false` is the master opt-in for the new transport. All are **off** in production by default; cache/rate-limit flags are independent.

## Deployment contract

Never start the worker in a Next.js request or automatically activate a systemd unit during the existing immutable ERP web release. The standalone ARM64 artifact may include a verified worker entrypoint and dependencies, but the new `bababuilds-erp-worker.service` is installed only by a separately reviewed, root-operated provisioning process. Its own start, disable, drain and rollback leave ERP web and sibling apps running.

## Acceptance and metrics

1. CI: TypeScript, Prisma client/migration checks, Node26 ARM64 archive smoke, a real PostgreSQL + Redis pilot job test, failure/retry/restart and tenant isolation tests.
2. Baseline from VPS before activation: available RAM, Redis 6385 security-counter memory, Postgres connection budget, port 6387, current cron queue length, login 429s, in-app notifications.
3. Canary on a dedicated internal workspace, opt-in to in-app task deadline only. Verify one notification per occurrence despite retries and cron reruns; no customer mail/push tests.
4. Observe oldest outbox age, pending/processed/failed counts, Redis errors, worker memory and restart recovery. Check ERP API latency and MenuMinute/ClubKeep health.
5. Rollback via producer and worker flags, stop ERP worker alone, preserve PostgreSQL pending outbox records. Drain before returning pilot notifications to the legacy path to avoid duplicates.

Financial postings, external webhooks, auth, payment settlements, payroll and critical business cron mutations are explicit non-goals.