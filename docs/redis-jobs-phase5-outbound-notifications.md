# Phase 5 C+D — gated outbound notifications over PostgreSQL and Redis 6387

Tracking: #673. Adds provider-aware email and push delivery to the already
deployed delivery ledger. No database migrations or production flag changes.

## Behavior

- PostgreSQL owns one notification_delivery_source_v1 outbox record and one
  ErpJobDelivery row per selected email user or push subscription. Both commit
  in the same transaction. A duplicate occurrence is a complete no-op.
- The outbox holds rendered copy (NOT emails, SMTP passwords or push endpoint
  keys). Redis carries only an opaque deliveryId in an isolated
  notification-delivery BullMQ queue, with a worker rate limit.
- Before sending, worker re-checks active membership, preferences,
  subscriptions, workspace state and SMTP/VAPID configuration. Revoked
  recipients are SUPPRESSED; stale WebPush 404/410 subscriptions are removed.
- Exact recipient SMTP acceptance or push HTTP 2xx becomes PROVIDER_ACCEPTED.
  Failure after an external attempt becomes UNCERTAIN, with no automatic retry.
  Expired CLAIMED records are also not blindly replayed. SMTP Message-ID is
  stable but does not guarantee provider-side idempotency.
- In-app stays on its existing path. Financial alerts, authentication,
  payments, billing, taxation and scheduled reports remain unchanged.
- Systemd services and the other Redis pools 6384/6385/6386 are not modified
  by merging this code.

## Scoped flags — default OFF

The web must explicitly have all of:
- ERP_REDIS_ENABLED=true
- ERP_REDIS_JOBS_ENABLED=true
- ERP_REDIS_NOTIFICATION_WORKSPACE_IDS=exact-internal-workspace-id
- ERP_REDIS_NOTIFICATION_EMAIL_ENABLED=true for email
- ERP_REDIS_NOTIFICATION_PUSH_ENABLED=true for push

The worker also requires ERP_REDIS_JOB_WORKER_ENABLED=true and the same
workspace/channel switches in its own environment. An invalid, wildcard,
missing or CSV workspace ID disables routing.

Allowed events: CLIENT_ADDED, SERVICE_CREATED, PROPOSAL_VIEWED,
SETTINGS_UPDATED, LEAVE_REQUEST_SUBMITTED, LEAVE_APPROVED, LEAVE_REJECTED.
An event also needs an explicit stable occurrenceKey. This PR wires first
proposal views and leave decisions. Unreviewed call sites stay on legacy
external delivery, preventing accidental duplicate sends and protecting
financial workflows.

## Minimal acceptance path

1. Complete existing CI/CodeQL, auto-deploy only ERP web. Confirm its SHA.
2. Package the two worker entry files plus production-only nodemailer/web-push
   dependencies; use a separate ERP-worker-only handoff to the *matching*
   immutable release. Do not reuse a prior operator pinned to an older SHA.
3. Activate only an owned internal workspace and one channel at a time in
   worker and web environments. Test only owned SMTP inbox/push device.
   Never invoke the global /api/cron/alerts cron manually.
4. Verify one row/provider acceptance per occurrence, stale/revoked recipient
   suppression, and cohosted service health.
5. Turn off producer and worker channel flags to pause. Never auto-replay
   UNCERTAIN or expired CLAIMED records. Phase 5 F adds review/DLQ operations.

Sanitized metric query:
SELECT "channel","status",count(*) FROM "ErpJobDelivery"
GROUP BY "channel","status" ORDER BY 1,2;

No secrets, addresses, endpoint keys or message bodies in Redis, logs, or
operator evidence.
