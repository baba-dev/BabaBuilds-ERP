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
5. Choose **one** verified, operator-approved internal workspace with a task due in the next seven days. Audit its active members and disable external email/push for this test workspace. With `ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS=<exact internal workspace ID>` set, independently enable `ERP_REDIS_JOBS_ENABLED=true`, `ERP_REDIS_JOB_WORKER_ENABLED=true` and `ERP_REDIS_INAPP_DEADLINE_ENABLED=true` in the ERP **web** env and restart **only ERP web** after a protected configuration backup and full preflight. The already-running standalone worker uses its own reviewed systemd drop-in. Exercise exactly that task using the **scoped Phase 4 canary endpoint** documented below. Verify one outbox occurrence, DONE and one in-app notice per active opted-in recipient, even on a repeat request. **Never manually invoke the global `/api/cron/alerts` route** as a one-workspace test; it sends unrelated tenant financial reminders, email and push. Existing scheduled cron must continue on its normal schedule; monitor it separately.
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


## Phase 4 G operator-only scoped producer canary (no global cron)

The dedicated `POST /api/cron/alerts/phase4-canary` route is opt-in. It is authorized by the existing `CRON_SECRET`, requires all three Phase 4 web flags and exactly one valid allowlisted workspace, validates **one** task in the original 7-day deadline window and at least one current active in-app recipient, then writes only the existing unique PostgreSQL outbox occurrence. The worker subsequently rechecks the task, active memberships and in-app preferences. It never sends email/push, scans other workspaces, executes unrelated cron work, or provides a GET handler. A second identical request reuses the same unique outbox occurrence. If a database commit is uncertain, the endpoint fails without legacy dispatch; check PostgreSQL before retrying.

**Production gate before using it:** the reviewed endpoint PR must pass CI/CodeQL, merge, and deploy as an immutable ERP Node26 release. Verify the new deployed SHA, worker version/health, applied migration history, loopback job Redis, isolated ACL, and healthy MenuMinute and ClubKeep. Do not run it on the currently deployed 023d06db Phase 4 release; that release does not contain this endpoint. Confirm the chosen workspace is an internal test organization rather than a customer, every intended recipient is authorized and notifyInApp=true, and all test-workspace users have external notifyEmail=false/notifyPush=false. Do not use a task belonging to a different workspace or an actual customer task.

After separate approval and scoped flag activation, run this command from the ERP VPS as root, **replacing the two IDs with audited internal identifiers** (never print or paste secrets). Node reads `CRON_SECRET` from the protected .env and sends it only through loopback; the secret is not placed in shell command arguments:

```bash
sudo env PHASE4_WORKSPACE_ID='INTERNAL_WORKSPACE_ID' PHASE4_TASK_ID='INTERNAL_TASK_ID' \
  /opt/bababuilds-erp/node26/bin/node --env-file=/var/www/bababuilds-erp/.env - <<'JS'
const { PHASE4_WORKSPACE_ID: workspaceId, PHASE4_TASK_ID: taskId, CRON_SECRET } = process.env;
if (!/^[A-Za-z0-9_-]{8,80}$/.test(workspaceId || '') ||
    !/^[A-Za-z0-9_-]{8,80}$/.test(taskId || '') || !CRON_SECRET) process.exit(2);
const response = await fetch('http://127.0.0.1:3000/api/cron/alerts/phase4-canary', {
  method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(10000),
  headers: { 'Authorization': 'Bearer ' + CRON_SECRET, 'Content-Type': 'application/json' },
  body: JSON.stringify({ workspaceId, taskId }),
});
console.log('ERP_PHASE4_SCOPED_PRODUCER_HTTP_' + response.status);
if (response.status !== 202) process.exitCode = 2;
JS
```

Use read-only PostgreSQL queries scoped to the approved workspace/task to confirm one `ErpJobOutbox` occurrence reaches DONE, each intended active opted-in member receives exactly one `DEADLINE_ALERT` notification from that task, and there is no unintended recipient. The outbox does not record recipients separately, so for a clean count use a workspace with exactly one eligible task and no existing deadline notifications in the test window; if those conditions cannot be guaranteed, stop rather than make unsupported claims. Repeating the scoped POST tests deduplication, but **do not** repeat the global cron.

### H — final soak and rollback acceptance

Maintain the worker with boot enablement **off** through a minimum 24-hour observation period. Check at intervals: worker PID and readiness/journal errors; PostgreSQL PENDING/DONE/FAILED and oldest pending age; Redis 6387 auth errors, memory, AOF and noeviction; Postgres connections; ERP HTTP latency; Redis 6384/6385/6386 health; and `menuminute-web`, `menuminute-worker`, `clubkeep-web` services. Keep the one-workspace allowlist in place throughout. Failed jobs, duplicate real notifications, Redis pressure, cross-tenant activity or service regressions are stop conditions.

To rollback, first stop any additional canary POST calls, change the **ERP web** pilot switch OFF and restart ERP web only. Inspect/allow the worker to drain in-flight events before considering a return to the legacy in-app route: switching paths while rows remain pending can double-notify. Then stop only the ERP worker if necessary, preserving all PostgreSQL outbox rows and Redis AOF. Do not FLUSH, revoke unrelated Redis ACLs, change migration history, or touch MenuMinute/ClubKeep. **Only after 24h evidence and written signoff** should the operator consider enabling the worker at boot. This completes the narrow in-app deadline Phase 4 pilot, **not** a migration of financial or external notification workloads.
