# Phase 3 — Isolated Redis dashboard and interactive reporting cache

**Status:** implementation behind default-off flags. PostgreSQL remains authoritative. No VPS
Redis or systemd changes are made by the application PR.

## Grounded repository baseline

- Dashboard: `lib/dashboard-cache.ts` contains a per-process Map, bounded TTL
  30–120 seconds (60 default), with `DASHBOARD_CACHE_ENABLED` opt-in.
  `app/api/dashboard/route.ts` has HIT/MISS/BYPASS headers; its payload
  includes workspace-level financial KPIs and depends on current user grants.
- Reports: `lib/reporting/engine.ts` contains a 200-entry process Map. Five
  built-ins (`cash_forecast`, `ar_aging`, `ap_aging`,
  `financial_position`, `mrr`) default to 30-second TTL; custom reports
  are uncached. The engine is called from interactive routes **and**
  export, scheduled email and external-share creation paths.
- Distributed invalidation: current `invalidateDashboardCacheForWorkspace`
  clears only the calling Node process. Callers include invoice payment,
  proposals, inventory, expenses, retainers, reconciliation, shop and settings.
  The static `check:kpi-impact` coverage must remain enforced.
- **Isolation:** ERP 6384 is a 128 MB LRU cache used by Phase 2 ordinary
  rate limits; ERP 6385 is a 256 MB AOF/noeviction queue pool used by
  security counters. **Never put data cache payloads in either pool.**

## Deployment contract

Provision a separate loopback-bound ERP data Redis instance, proposed TCP
6386, with root-protected ACL and a key allowlist for
`erp:production:v1:cache:*`. Proposed 256 MB cap, `allkeys-lru`,
`appendonly no`, `save ""`. Confirm port availability and memory
capacity before provisioning. Credentials are supplied solely from protected
runtime environment as `ERP_REDIS_DATA_CACHE_URL` (no generic `REDIS_URL`).

Flags (all default false):

- `ERP_REDIS_CACHE_ENABLED`: master gate; requires ERP_REDIS_ENABLED and
  the data cache endpoint
- `ERP_REDIS_DASHBOARD_CACHE_ENABLED`: independent dashboard opt-in
- `ERP_REDIS_REPORT_CACHE_ENABLED`: independent interactive report opt-in

Existing `ERP_REDIS_RATE_LIMIT_ENABLED=true` remains unaffected. When the
data cache feature is off, the legacy dashboard and report cache behavior
is preserved. Redis errors must **not** become ERP HTTP 500 responses;
fall back to authoritative PostgreSQL, not uncontrolled per-worker cached data.

## Security and consistency

- Always resolve live user membership and effective permissions **before**
  returning cached content; roles, module access and workspace changes must
  prevent a hit from exposing old data.
- Cache keys contain only a workspace/user-scoped SHA-256 digest plus
  a payload fingerprint, schema version and per-workspace random generation.
  No raw emails, tokens, financial figures, or connection URLs in Redis keys
  or telemetry.
- A per-workspace random generation changes on successful mutation
  invalidation; no `KEYS *` or large SCAN. A missing/evicted generation is
  initialized with a fresh random UUID (never a reused number). In-flight
  calculations must not populate a newer revision.
- TTLs initially 30 seconds, plus a strict payload size cap; huge reports
  and custom reports bypass cache.
- Only interactive report requests and pinned dashboard cards are
  eligible for Redis caching. Scheduled reports, exports and frozen external
  shares always compute from PostgreSQL.
- **Consistency limitation:** cache invalidation occurs after successful DB
  writes, not within the same transaction. If invalidation fails or an
  external actor edits PostgreSQL, a previously cached *display snapshot*
  can remain until its bounded TTL. No payment, invoice mutation, financial
  reconciliation or similarly strict workflow is ever allowed to use cache.
- A warm cache hit must preserve response shape, guard checks, and the
  dashboard's existing cache headers. No cross-workspace, cross-user,
  fiscal-year, or permission-version sharing.

## Verification / rollout

1. CI + CodeQL, full real-Redis integration tests, SQL migrations, native
   ARM64 build, static, browser smoke must pass.
2. Deploy with all three cache flags false. Confirm Phase 2 login and 429
   behavior remains unchanged.
3. Provision dedicated 6386 with protected ACL; check PING, GET, SET PX,
   SET NX, DEL and key-prefix isolation. Do not enable without this gate.
4. Enable master and dashboard for a low-risk single workspace canary;
   compare fresh responses to cache hits, monitor 95th percentile latency,
   hit rate, Redis used memory and evictions, PostgreSQL query count.
5. Enable reporting independently after permission and mutation tests;
   verify share creation, export and scheduled email still read PostgreSQL.
6. Roll back either individual feature flag, or the master
   `ERP_REDIS_CACHE_ENABLED=false`, restart only ERP. No flush required.

See tracked plan #661. There is deliberately **no automatic enabling in this PR**.
