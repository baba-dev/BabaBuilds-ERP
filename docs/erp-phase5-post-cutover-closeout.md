# ERP Phase 5 post-cutover sign-off and cleanup (2026-11-19)

## Signed off: engineering deployment and sitewide activation

The sitewide Redis 6387 external-delivery routing has been successfully deployed
and activated for all eligible ERP workspaces, using PostgreSQL 17 as the
authoritative ledger. The GitHub action evidence is:

| Scope | Verified source |
| --- | --- |
| Merged global scope PR #682 | `8f5eab37a52498adccb5e506c83682579d0f4298` |
| CI and CodeQL on the merge | runs `44461852039`, `44461852016` — success |
| Immutable ARM64/Node26 web deployment | run `44462301591` — success, migration history matched |
| Sitewide activation | run `44463036390` — success; `ERP_PHASE5_SITEWIDE_EXTERNAL_DELIVERY_ENABLED`; worker PID `310069` |
| Production safety | `NO_MIGRATIONS_NO_GLOBAL_CRON_NO_COHOSTED_RESTARTS` |

**Not signed off:** real provider acceptance on customer SMTP, push or scheduled
report deliveries. A green deployment does not demonstrate that SMTP accepted
one recipient, that a push provider accepted one request, or that a scheduled
report's full recipient set was acknowledged. Leave tracker #673 open for
provider-level outcome evidence and legacy event cleanup.

**Scope limitation:** payment, tax, financial workflows and other notification
events without stable occurrence keys remain on the legacy/PostgreSQL paths.
This sign-off does not mean every business operation moved to Redis.

## Post-cutover cleanup and lifecycle

The reviewed cleanup workflow `.github/workflows/erp-vps-lean-cleanup.yml`
can prune strictly enumerated ERP-only old cutover/staging directories and
regenerable caches, and obsolete immutable ERP releases **only while retaining
three latest by creation timestamp and the live release**. It excludes:

- PostgreSQL schema, data, roles, snapshots and migration history
- Redis 6387 persistence, queued or failed jobs, ACLs, credentials or service
- ErpJobOutbox, ErpJobDelivery, recovery audit ledger and provider uncertainty
- Customer uploads, private media, encryption keys and environment files
- ERP worker unit, systemd sitewide overrides and emergency pause operator
- MenuMinute, ClubKeep, shared Node24, Node26 runtime and active ERP release

**New safety gate:** cleanup refuses destructive pruning whenever the Phase 5
sitewide worker's last reviewed immutable release SHA does not match the live
ERP release. Subsequent successful immutable deployments run
`erp-phase5-worker-sync` to gracefully hand off **only** the ERP worker,
after confirming there are no in-flight externally CLAIMED rows. The original
one-shot activator remains compatible with a fresh first activation.

If cleaning would remove a path referenced by a running process, the operator
skips that path. No deletion of customer records, financial ledgers, provider
uncertainties, Redis queues or PostgreSQL backups is authorized by cleanup.

## Validation after production cleanup

Review the cleanup action's structured output:
`ERP_VPS_LEAN_CLEANUP_PASS mode=apply`. It reports reclaimed disk bytes and
each actual target. Never quote historical cleanup savings as this run's result.

Inspect only sanitized delivery aggregates in the ERP superadmin Delivery
Recovery page (`/admin/jobs/deliveries`) or this read-only PostgreSQL query:

```sql
SELECT "channel", "status", COUNT(*) AS deliveries,
       COUNT(*) FILTER (
         WHERE "acceptedAt" >= NOW() - INTERVAL '24 hours'
       ) AS accepted_last_24h
FROM public."ErpJobDelivery"
WHERE "channel" IN ('EMAIL', 'PUSH', 'REPORT_EMAIL')
GROUP BY "channel", "status"
ORDER BY "channel", "status";
```

Keep `UNCERTAIN` and provider-possibly-accepted `CLAIMED` records untouched:
they are evidence requiring review, not stale queue garbage. Do not replay
historical payloads or call the global financial alerts cron as a smoke test.

## Emergency pause

The root-only helper `sudo /usr/local/sbin/erp-phase5-sitewide-pause`
turns OFF the three external channel families, preserving the ledger and
not restarting MenuMinute/ClubKeep. Pausing may route later eligible events
through the old synchronous path; resume only after explicit review of queued
and uncertain delivery states. Never silently remove the emergency command.

## Final closure criteria for tracker #673

1. Observe real `PROVIDER_ACCEPTED` and known suppressed/failed outcomes per
   enabled family (EMAIL, PUSH, REPORT_EMAIL) via redacted metrics.
2. Confirm the selected report occurrence advances `scheduleLastAt` only
   after all its recipients were acknowledged.
3. Confirm no accepted external side effect was automatically replayed after a
   provider timeout or a restart.
4. Inventory intended eligible legacy notifications without occurrence keys,
   migrate their idempotent producers or explicitly exempt them.
5. Confirm worker heartbeat and web/worker release parity after the next
   immutable main deployment and retain healthy sibling services.

Until these are met, #673 is **activation-complete, delivery-acceptance-open**.
