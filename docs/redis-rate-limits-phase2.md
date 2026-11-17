# ERP Redis Phase 2 — Distributed rate limiting

Phase 2 introduces a **feature-flagged** atomic fixed-window limiter for the
existing ERP route, generic/public and password/passkey guards. No business
limit values or response bodies are intentionally changed, no schema migration
is required, and Redis remains disabled for all these consumers by default.

## Architecture

| Protection | Redis when enabled | Outage behavior |
| --- | --- | --- |
| Route-scoped API/IP/workspace guards | ERP cache: \`127.0.0.1:6384\` | Original per-process limiter, generic warning max once/min |
| Public proposal/payment/reseller/retainer guards | ERP cache: \`127.0.0.1:6384\` | Original per-process limiter, generic warning max once/min |
| Password login failure counter | ERP queue: \`127.0.0.1:6385\` | **Fail closed** for attempts; do not leak Redis details |
| Passkey login failure counter | ERP queue: \`127.0.0.1:6385\` | **Fail closed** for attempts |
| Password reset request limiter | ERP queue: \`127.0.0.1:6385\` | Suppress work with generic public response |

The queue instance has **AOF and \`noeviction\`**; this is important for
security-sensitive counters. The cache instance uses \`allkeys-lru\`; a
counter may be evicted under memory pressure, so this pool is deliberately
reserved for *best-effort* general API throttling, not password protection.
Before enabling, verify that the queue has spare capacity and suitable
memory-pressure alerts; an eventual dedicated security-rate-limit pool can
separate these counters from BullMQ as the platform scales.

The Lua script handles check/increment/TTL atomically on Redis. Route and
generic paths spend quota only while below their limit; auth paths inspect
quota before credential checks, record failures, and clear counters after
successful password authentication. Counters carry a TTL from the first
recorded attempt, and their Redis keys hash identity inputs with SHA-256.

We keep previous HTTP 429 bodies, Retry-After on route guards, and the
password reset endpoint's enumeration-resistant public response.

The system does **not** trust Redis as a source of user identity. Existing
Cloudflare / Nginx request-IP trust boundaries still apply: the origin must
be unreachable except through the trusted reverse proxy and the proxy must
overwrite client-IP headers. A spoofable \`cf-connecting-ip\` or
\`x-forwarded-for\` makes *any* per-IP limiter ineffective.

## Deploy and activation

Prerequisites:
1. ERP's Phase 1 instances on 6384/6385 pass authenticated PING, and the
   dedicated ACLs permit **only** ERP namespaced keys.
2. The queue instance is \`noeviction\`, AOF everysec; cache has deliberate
   bounded memory and eviction.
3. Main CI / native ARM64 / browser smoke / CodeQL pass, and the new release
   is verified active. Do not alter MenuMinute or ClubKeep services.

**Important:** this PR is safe to merge/deploy while the consumer flag is
false, even if Redis is unavailable. No live endpoint changes its limiter
until specifically activated.

To enable after confirming the new release and Admin Security health:

\`\`\`text
ERP_REDIS_ENABLED=true
ERP_REDIS_RATE_LIMIT_ENABLED=true
ERP_REDIS_CACHE_ENABLED=false
ERP_REDIS_JOBS_ENABLED=false
\`\`\`

Keep \`ERP_REDIS_CACHE_URL\` and \`ERP_REDIS_QUEUE_URL\` in the existing
root-only ERP runtime environment. They are validated by Phase 1 config.
Restart **only** \`bababuilds-erp.service\` after changing env flags.
Observe logins, passkeys, password-reset, public proposals and the admin
security/Redis diagnostics. Monitor 429 rates, Redis failures and memory.

**Immediate rollback:** revert only \`ERP_REDIS_RATE_LIMIT_ENABLED=false\`,
restart only ERP. The old per-process limiters resume. Never use
\`FLUSHDB\`, \`FLUSHALL\`, \`KEYS *\` or modify the other applications' Redis
instances. Do not commit Redis passwords or paste URLs into issue comments.

## CI and verification

The \`Unit and integration tests\` job provisions a disposable Redis 7
service on host port 6384 alongside isolated PostgreSQL 17. Integration
tests verify concurrent atomic caps, retry TTL, password failure/clear,
the generic route 429 header, default-off behavior, outage fail-closed for
auth, and local fallback for ordinary endpoints. A source boundary test
ensures rate-limit guards are awaited before proceeding.

Authenticated admin views:
- \`/admin/security\` contains a Redis health card plus the existing security
  counters. It remains useful if diagnostics has an unrelated page error.
- \`/admin/system-health\` shows Redis status and error logs. The previously
  overbroad nested auth catch was narrowed: only verified authorization
  denials return 404, anonymous users redirect to login, and unexpected
  exceptions are no longer disguised as 404.

The **platform** admin gate is intentionally strict: a user must have the
\`ADMIN\` database role **and** their email must be on
\`SUPERADMIN_EMAILS\`. A user who is an ERP workspace owner/admin is not
necessarily a *platform superadmin*. Do not relax authorization merely to
hide a 404. If \`/admin\` and \`/admin/security\` are also inaccessible,
inspect role/allowlist setup using the existing admin setup operator.

## Future follow-ups

1. Separate security counters into a third noeviction pool if BullMQ queue
   pressure/traffic demands it, without changing the public rate-limit API.
2. Improve trusted-proxy IP validation using explicit proxy CIDR/ingress
   configuration rather than arbitrary request-supplied headers.
3. Add distributed observability for rate-limit hit totals. Existing admin
   hit-event metrics are still process-local and restart-sensitive.
