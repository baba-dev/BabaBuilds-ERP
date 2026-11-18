# ERP Phase 5 — delivery migration gates and worker observability

Tracking: [#673](https://github.com/baba-dev/BabaBuilds-ERP/issues/673). Phase 4 production accepted: [#670](https://github.com/baba-dev/BabaBuilds-ERP/issues/670), with 24-hour soak explicitly waived and no host reboot test.

## Baseline: what is and is not on Redis
- Redis 6384: ERP rate limiting; 6385: authentication counters; 6386: dashboard and reports cache; 6387: **only** ERP BullMQ transport/lease scheduler. All independent. No changes to MenuMinute or ClubKeep.
- Authoritative PostgreSQL `ErpJobOutbox` stores the Phase 4 `inapp_task_deadline_v1` events and deduplication. The worker runs as the separately boot-enabled `bababuilds-erp-worker.service`.
- Today `lib/notifications/dispatcher.ts` still resolves recipients, writes other in-app notifications and sends workspace SMTP/web push synchronously; `lib/reporting/views.ts` still sends scheduled report emails and only then advances the schedule. **Phase 5 does not assume these operations are safely idempotent.**
- The current global `/api/cron/alerts` also sends payment, retainer renewal and tax reminders. Never manually invoke it for one-workspace tests.

## Phase 5 provider-side effect correctness model

PostgreSQL is the source of truth, never Redis, for these fields and transitions:

1. `PENDING`: durable per-workspace, per-occurrence, per-recipient, per-channel delivery intent, unique key; producer must not enqueue before the DB write commits.
2. `CLAIMED`: bounded lease with worker/process identity and expiry, accepted only after fresh workspace/membership/consent/schedule revalidation; worker does not hold DB transaction open over network I/O.
3. `PROVIDER_ACCEPTED`: capture provider acknowledgement (if supplied) and mark complete. Provider acknowledgement may be lost before the DB commit; this is a known ambiguity, not exactly-once semantics.
4. `UNCERTAIN`: possible external side effect, no automatic replay. Explicit admin reconciliation, provider lookup or approved suppression required before another send. SMTP without provider idempotency particularly needs this terminal hold state.
5. `FAILED`: confirmed pre-send/transient failure; retry only when it is safe and bounded. Max attempts, exponential backoff with jitter and DLQ after exhaustion.
6. `SUPPRESSED`: revoked membership/consent, suspended workspace, deleted task/recipient, disabled schedule, expired occurrence or invalid subscription. Do not send or retry.

Queue payload is only a delivery/occurrence row ID. Never put email addresses, SMTP passwords, push endpoints/auth, report rows/PDF bytes, invoice amounts or secrets in Redis job data or logs. Health/retry APIs require existing superadmin permissions and safe rate limits.

### Email
Use user/tenant SMTP **only** for opted-in business alerts; enforce active memberships, `notifyEmail`, `transactionalAlerts`, current company SMTP configuration, bounded concurrency, explicit recipient list and no unapproved customer test sends. The current Nodemailer `sendMail` cannot generally establish idempotency at a third-party SMTP server; `Message-ID` is not a guarantee against duplicate delivery. On timeout or uncertain acknowledgement, write `UNCERTAIN` and alert the operator, never a blind retry.

### Push
Each subscription/occurrence needs its own unique delivery receipt. Recheck `notifyPush`, active membership and subscription existence just before sending. Delete 404/410 subscriptions, separate confirmed pre-send failure from ambiguous network failure, and use bounded TTL and retry. Existing `broadcastPush` intentionally returns only expired endpoints; it does not currently provide a full per-subscription success/failure taxonomy, so it is not suitable as the durable acknowledgement API unchanged.

### Scheduled reports
Create a stable due-occurrence key from saved report ID + `scheduleNextAt`; claim it transactionally under the workspace before rendering. Freeze/validate a recipient/format snapshot or explicitly reject changes; validate creator/permissions and prevent two workers from sending the same occurrence. Rendering must remain bounded in CPU/memory and clean temporary CSV/PDF attachments. Keep delivery state separate from schedule advancement; mark `UNCERTAIN` after ambiguous SMTP outcomes. Do not call the existing global report cron while also delivering the **same** schedule through a worker.

## First implemented observability slice (no database schema changes)

The worker now writes `<ERP_REDIS_NAMESPACE>:jobs:worker:heartbeat` after each 10-second reconciliation pass with a 35-second expiration. The value contains only `ok|degraded` and epoch milliseconds. An exception to a poll marks `degraded`; no recent marker is `stale`; Redis unreachable is `unavailable`. This proves recent worker activity, not just `ERP_REDIS_JOB_WORKER_ENABLED=true`.

The superadmin job health response additionally exposes heartbeat state/age, Redis 6387 memory usage and cap, memory policy, AOF enabled and eviction count. It never returns raw Redis INFO output, connection URLs, credentials or outbox payloads.

**Suggested initial operator thresholds** (tune after production baseline): heartbeat not `ready` for 60 seconds; pending age >120 seconds; failed outbox count >0; evictions >0 on jobs Redis; AOF disabled; maxmemory policy not `noeviction`; or job Redis using >80% of its cap. Sample health periodically and notify an operator through an existing out-of-band channel, not the queue under investigation.

### Release lifecycle for a boot-enabled worker
A merged PR and even a successful **ERP web** deployment does **not** update the already-running Node worker. The worker process uses the old immutable code until explicitly restarted, while `/opt/bababuilds-erp/releases/current` may point at a newer release. Consequently the admin screen can show `stale` after web deploy until a separately reviewed worker handoff takes place.

Only after checked commit/manifest, successful GitHub CI + ARM64 package, matching Prisma history and healthy cohosted services, the owner may independently run:

```bash
sudo systemctl show bababuilds-erp-worker.service -p MainPID -p ActiveState
sudo systemctl restart bababuilds-erp-worker.service
sudo systemctl is-enabled bababuilds-erp-worker.service
sudo systemctl is-active bababuilds-erp-worker.service
```

Then independently check the new PID, `[erp-worker] READY` journal marker, new heartbeat `ready`, outbox lag, and MenuMinute/ClubKeep active. Preserve the old immutable release for rollback; do not restart services or modify secrets automatically from a PR. A worker restart should be delayed if an in-flight external side effect is `CLAIMED` or `UNCERTAIN` until its outcome is reconciled. **No external delivery types are activated by this first observability PR.**

## Formal gates for following Phase 5 slices

- Additive delivery-ledger Prisma migration must be verified against a recent off-host encrypted PostgreSQL backup independently restored to disposable PG17; apply via reviewed peer-authenticated migrator, never `db push`, never bypass immutable checksum preflight.
- Separate flags per family, all OFF by default; exactly one approved internal workspace per canary and no wildcard. Keep existing Phase 4 in-app deadline pilot independent.
- Real PostgreSQL+Redis CI, fault injection at every state transition, SMTP accepted-then-timeout, push 410 and permission revocation, concurrent scheduler claims and job replay, tenant and rate-limit tests, ARM64 worker packaging and guarded systemd handoff.
- Pilot only with an owned inbox/device; record a new 24-hour soak or a separately documented acceptance/waiver for **each external-send family**. The Phase 4 waiver does not authorize skipping these gates.
- No payments, invoice issuance, tax/retainer/expense posting, stock mutations, payroll, auth or critical financial cron routines on Redis.
