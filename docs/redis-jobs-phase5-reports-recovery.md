# Phase 5 E+F — scheduled reports + delivery recovery

> **Historical rollout reference (superseded 2026-11-19).** The one-workspace
> flags and separate staging handoff below describe the original canary plan.
> Live production now uses the explicit sitewide override approved in PR #682;
> see `docs/redis-jobs-phase5-sitewide.md` and
> `docs/erp-phase5-post-cutover-closeout.md`. Do not run old canary commands.


Tracking: #673. Requires the C+D delivery ledger/worker from merged #677.
**No new schema migrations and no change to worker flags or VPS services from this PR.**

## Report delivery
- Web cron keeps the existing legacy send for all workspaces except ONE explicitly
  approved internal ID with `ERP_REDIS_REPORT_EMAIL_ENABLED=true`,
  `ERP_REDIS_REPORT_WORKSPACE_ID=<exact-id>`,
  `ERP_REDIS_ENABLED=true` and `ERP_REDIS_JOBS_ENABLED=true`.
  The worker additionally needs `ERP_REDIS_JOB_WORKER_ENABLED=true` and the
  same report flags. Default OFF; wildcard/multi-ID/staging configurations fail shut.
- For the canary workspace, one PostgreSQL CAS reserves each due `ReportView`
  occurrence, advances scheduleNextAt to prevent concurrent cron claims, stores
  one source outbox row and one delivery ledger row per configured recipient in
  the same transaction. Duplicate occurrence claims cannot send twice.
- Redis 6387 BullMQ job data is ONLY `{deliveryId}`. No report cells,
  attachments, email addresses, SMTP credentials, encryption secrets or push
  endpoints are stored in Redis.
- The worker asks the existing ERP web server on **127.0.0.1:3000** to render the
  report through `POST /api/internal/erp-report-render`. Every request is
  HMAC-SHA256 authenticated using the already protected ENCRYPTION_KEY and the
  exact delivery CLAIM token, with a 30-second freshness limit. The route checks
  current schedule fingerprint, creator's active workspace role and report
  permissions, approved workspace and billing state, and the unattempted lease.
  PDF/CSV bytes are bounded and returned only to the local worker.
- SMTP sends are performed by the standalone Node 26 worker using the C+D
  validated SMTP transport. One recipient per delivery. Only a verified
  provider acceptance advances that delivery. Claims/UNCERTAIN are never
  automatically replayed after possible external I/O.
- `scheduleLastAt` only moves forward when ALL configured recipient
  deliveries for the occurrence have been accepted. An idempotent worker sweep
  fixes a crash between acknowledged email delivery and schedule finalization.
  Suppressed, failed or uncertain occurrences remain visible. The schedule
  next clock reflects scheduling, never accepted delivery.

## F: superadmin recovery
- Open `/admin/jobs/deliveries` to view redacted statuses for EMAIL, PUSH
  and REPORT_EMAIL. This page is restricted by the existing platform superadmin
  role **and** SUPERADMIN_EMAILS allowlist.
- Superadmin recovery actions are rate-limited and require a rationale and exact
  typed confirmation. The DB status CAS and the AppActivityLog audit write
  commit together:
  - **retry-pre-send**: only FAILED or expired CLAIMED where
    externalAttemptedAt is NULL and attempts less than 5.
  - **confirm-accepted**: only UNCERTAIN or expired externally attempted CLAIMED,
    with independently verified provider receipt evidence.
  - **suppress**: only FAILED/UNCERTAIN/expired CLAIMED, when sending must stop.
- No UNCERTAIN, possibly accepted SMTP or WebPush is ever automatically replayed.
  Provider receipts and operator rationale are hashed, not copied into logs.

## Fast production cutover
1. Existing PR CI + CodeQL + native ARM64 package. Merge the code without
   enabling new flags.
2. Resolve the **separate** PR #668 email-hosting schema-history mismatch using
   its already reviewed encrypted backup/migration process; do not bypass the
   immutable deploy check or rerun destructive migrations.
3. Deploy the matching immutable ERP web release. Handoff **only**
   bababuilds-erp-worker.service to that release and keep other apps untouched.
4. Enable the report flag in web and worker for one owned internal workspace.
   Test one short PDF/CSV schedule with an owned inbox; inspect one accepted
   delivery and an advanced scheduleLastAt. Disable either producer or worker
   channel flag to halt new sends and pending delivery processing.
5. Confirm a revoked creator and changed recipient are suppressed, an ambiguous
   SMTP send stays UNCERTAIN, recovery actions audit correctly, and neither
   MenuMinute nor ClubKeep was restarted. Record real evidence in #673.

No manual run of global `/api/cron/alerts`; it scans all ERP workspaces.
Do not claim production acceptance solely from PR CI.
