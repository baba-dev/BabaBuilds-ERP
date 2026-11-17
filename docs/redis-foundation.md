# ERP Redis Foundation (Phase 1)

This change introduces **opt-in connection infrastructure only**. It does not
migrate any dashboard, authentication, notification, billing, OCR or cron
workload to Redis. PostgreSQL remains the source of truth.

## Runtime contract

- Node.js 26, npm 11, `ioredis` 6.
- Redis never connects at module import or when `ERP_REDIS_ENABLED=false`.
- Only `ERP_REDIS_CACHE_URL` and `ERP_REDIS_QUEUE_URL` are read: the generic
  `REDIS_URL` used by other applications is deliberately ignored.
- Cache and queue have **separate connection clients**; each URL is optional
  until its respective feature is enabled. One configured URL is sufficient
  for the Phase 1 diagnostic probe.
- Clients are process-local singletons, initialized lazily with bounded timeouts,
  no offline command buffer and a fast-fail retry policy. This policy is for
  web/API requests; Phase 4 BullMQ workers require their own persistent clients.
- Key namespace defaults to `erp:production:v1` under `NODE_ENV=production`,
  `erp:test:v1` under tests and `erp:development:v1` otherwise.
- Non-queue keys use `redisKey(config, category, ...segments)`. Future BullMQ
  queues must use `redisQueuePrefix(config)` as BullMQ's `prefix` option;
  **do not configure the ioredis `keyPrefix` option for BullMQ.**
- The `/api/admin/redis/health` diagnostic requires verified superadmin access.
  It returns state and latency, **never credentials, URLs, usernames or raw errors**.
  Redis unavailability is not a health failure for the core ERP application.

## Environment variables (in ERP's protected systemd environment file)

All defaults are safe / off:

| Variable | Default | Meaning |
| --- | --- | --- |
| `ERP_REDIS_ENABLED` | `false` | Master kill switch, enables only connection probes in Phase 1 |
| `ERP_REDIS_CACHE_URL` | unset | Dedicated endpoint for future cache/rate limit clients |
| `ERP_REDIS_QUEUE_URL` | unset | Dedicated endpoint for future durable queue workers |
| `ERP_REDIS_NAMESPACE` | `erp:<environment>:v1` | Isolated key namespace, must start with `erp:` |
| `ERP_REDIS_CACHE_ENABLED` | `false` | Reserved flag; no cache consumer yet |
| `ERP_REDIS_RATE_LIMIT_ENABLED` | `false` | Reserved flag; no rate limit consumer yet |
| `ERP_REDIS_JOBS_ENABLED` | `false` | Reserved flag; no worker or queue consumer yet |
| `ERP_REDIS_CONNECT_TIMEOUT_MS` | `1500` | Bounded connection timeout (100-10000 ms) |
| `ERP_REDIS_COMMAND_TIMEOUT_MS` | `1500` | Bounded command timeout (100-10000 ms) |

URLs may use `redis://` or `rediss://`; credentials belong in the protected
environment only, never in Git, client-side settings or shell output.

## Safe rollout to the shared VPS

1. Review the existing MenuMinute Redis services and their port, ACL, persistence,
   eviction policy, memory budget and backups. **Do not change them as part of
   this PR.** Queue Redis should use `noeviction` and AOF persistence; cache
   Redis should have a bounded, intentional eviction policy. If isolation cannot
   be guaranteed, deploy an ERP-specific instance rather than sharing.
2. Confirm ERP's protected runtime environment is the source read by
   `bababuilds-erp.service`. Provision ERP-specific Redis credentials / ACL
   key scopes, then configure `ERP_REDIS_CACHE_URL` and/or
   `ERP_REDIS_QUEUE_URL` without printing secrets.
3. Deploy with `ERP_REDIS_ENABLED=false`; verify the app works unchanged and
   the admin diagnostics show `disabled`.
4. Enable **only** `ERP_REDIS_ENABLED=true`. Keep all three feature flags
   false. Restart the ERP web service using the established immutable-release
   systemd handoff. The admin diagnostic should show `ready` per configured
   endpoint. A connection failure should show `unavailable`, without leaking
   provider errors or breaking ordinary ERP traffic.
5. Run `npx vitest run tests/redis/foundation.test.ts` in CI and require the
   existing lint/typecheck/build gates. Do not run destructive Redis commands
   against shared instances.

**Rollback:** set `ERP_REDIS_ENABLED=false` and restart the ERP web service.
No financial data, user session or PostgreSQL schema is changed by Phase 1.
Do not assume rollout is complete until the VPS configuration has been
inspected and an authenticated live diagnostic has been verified.

## Acceptance

- Off by default, no socket or Redis runtime dependency used in disabled mode.
- Invalid flags, URLs, timeouts and namespaces rejected without secret leakage.
- Admin-only health report exercises both endpoints independently.
- No Redis credentials in the API payload or application logs.
- No code path switches billing, caches or rate limiting to Redis yet.
- No interference with MenuMinute or ClubKeep Redis keys, ports or processes.
