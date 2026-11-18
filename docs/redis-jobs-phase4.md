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

New `ERP_REDIS_JOB_URL` (separate from existing `ERP_REDIS_QUEUE_URL`) and `ERP_REDIS_JOB_WORKER_ENABLED=false`, `ERP_REDIS_INAPP_DEADLINE_ENABLED=false`. When and only when the pilot is enabled, `ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS` **must contain exactly one real, approved internal workspace ID** (no wildcard, comma-separated list, or tenant prefix). Other workspaces remain on the legacy in-app path. Existing `ERP_REDIS_JOBS_ENABLED=false` is the master opt-in for the new transport. All are **off** in production by default; cache/rate-limit flags are independent.

## Deployment contract

Never start the worker in a Next.js request or automatically activate a systemd unit during the existing immutable ERP web release. The standalone ARM64 artifact may include a verified worker entrypoint and dependencies, but the new `bababuilds-erp-worker.service` is installed only by a separately reviewed, root-operated provisioning process. Its own start, disable, drain and rollback leave ERP web and sibling apps running.

## Acceptance and metrics

1. CI: TypeScript, Prisma client/migration checks, Node26 ARM64 archive smoke, a real PostgreSQL + Redis pilot job test, failure/retry/restart and tenant isolation tests.
2. Baseline from VPS before activation: available RAM, Redis 6385 security-counter memory, Postgres connection budget, port 6387, current cron queue length, login 429s, in-app notifications.
3. Canary on a dedicated internal workspace, opt-in to in-app task deadline only. Verify one notification per occurrence despite retries and cron reruns; no customer mail/push tests.
4. Observe oldest outbox age, pending/processed/failed counts, Redis errors, worker memory and restart recovery. Check ERP API latency and MenuMinute/ClubKeep health.
5. Rollback via producer and worker flags, stop ERP worker alone, preserve PostgreSQL pending outbox records. Drain before returning pilot notifications to the legacy path to avoid duplicates.

Financial postings, external webhooks, auth, payment settlements, payroll and critical business cron mutations are explicit non-goals.
## Operator runbook — no automatic activation

**Post-merge cutover gate:** Phase 4 was merged as PR #669. Apply the additive Prisma outbox migration to a restored PostgreSQL rehearsal first and test checksum parity; only then migrate the live ERP PostgreSQL schema via a separately authorized operator action. The existing ERP release promoter does **not** run live production migrations and will refuse mismatched history. Do not run financial imports or destructive maintenance with this rollout.

1. Collect read-only capacity and safety evidence: `free -m`, `ss -H -lnt`, `systemctl is-active` for ERP/MenuMinute/ClubKeep and all existing Redis services. Require >=512 MiB MemAvailable above baseline, port 6387 free, healthy Redis 6385 security counters, and PostgreSQL max connections spare.
2. Pin the reviewed PR merge SHA when approved. Copy `scripts/operations/erp-redis-phase4-provision.sh` and `ops/systemd/bababuilds-erp-worker.service` from that exact commit. `bash -n` the operator, then run as root with the worker unit path. **This is a separate manual operator action; the GitHub Actions web deploy never executes it.**
3. The operator creates only ERP Redis `127.0.0.1:6387` with isolated ACL, 128MB noeviction AOF everysec, and installs the **disabled** worker unit. It appends protected `ERP_REDIS_JOB_URL`, `ERP_REDIS_JOB_WORKER_ENABLED=false`, `ERP_REDIS_INAPP_DEADLINE_ENABLED=false` to the root-only ERP env. Run the authenticated Phase 4 preflight script; never output passwords.
4. With the PostgreSQL schema migrated and matching the release, explicitly set `ERP_REDIS_JOBS_ENABLED=true` and `ERP_REDIS_JOB_WORKER_ENABLED=true`. Restart **ERP web only** for new producer config, then `systemctl start bababuilds-erp-worker.service` manually (do not enable at boot until soak succeeds). Confirm `/api/admin/jobs/health` shows jobs Redis ready and worker flag on. Pilot remains OFF.
5. Choose **one** internal workspace with a future task; set `ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS=<verified internal workspace ID>` while the pilot remains OFF. Verify the ID exists and is internal. Only then set `ERP_REDIS_INAPP_DEADLINE_ENABLED=true`, restart only ERP web. Trigger its authorized existing alert cron once. Confirm one outbox row, eventual DONE, one in-app notification per intended active recipient and no duplicate on repeated cron. Existing email/push channels remain separate; do not send test messages to real customers.
6. Watch pending age, failed jobs, PostgreSQL connections, Redis AOF memory and login throttling for a full operational cycle. Revoke test membership and re-run to check no new notification. Do not alter 6384/6385/6386 or MenuMinute/ClubKeep services.
7. Rollback the pilot independently by setting `ERP_REDIS_INAPP_DEADLINE_ENABLED=false` and restarting ERP web, **then drain the worker before stopping it**. If pending events exist, decide whether to drain or park them; returning to the immediate legacy path before draining can duplicate notices. Never delete outbox records or use Redis FLUSH commands. For full jobs rollback turn off the worker, stop only `bababuilds-erp-worker.service`, and finally disable the jobs master; retain AOF and PostgreSQL outbox.
8. To retry a FAILED occurrence, use the admin Security jobs card. It removes only that specific failed BullMQ job ID and atomically returns the corresponding PostgreSQL outbox row to PENDING; the worker's reconciler republishes it. Never bulk retry unknown external side effects.

### Hard acceptance criteria
- Outbox created first; Redis contains only `{outboxId}`, never financial details, emails or credentials.
- Worker is a separate Node26 process with bounded DB pool, concurrency, SIGTERM drain and replay after crash.
- DB outbox row lock + in-app inserts + DONE marker commit together, making the pilot idempotent across duplicate job attempts.
- No notifications to deactivated users, no stale task notifications after task completion/suspension; read live preferences at execution.
- CI PostgreSQL/Redis replay test and immutable ARM64 package pass. All Phase 2/3 feature toggles unchanged.
- No production activation, migrations, VPS service installation or cross-app restart from opening/merging the PR.
