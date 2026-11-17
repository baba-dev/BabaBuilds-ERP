# Prisma ORM 7.10.1 upgrade — ERP PostgreSQL 17

The CLI, `@prisma/client` and `@prisma/adapter-pg` are pinned to **7.10.1**. Prisma 8 remains a prerelease; never use an unqualified `npm install prisma` for this ERP.

We retain the supported (deprecated) `prisma-client-js` generator temporarily to preserve the existing model and Decimal imports. This release does **not** rewrite the PostgreSQL schema, the migration baseline, or production data.

Runtime Prisma clients use a bounded `PrismaPg` connection pool (default maximum 10, optional `ERP_PG_POOL_MAX` integer 1–20; connections are tagged `application_name=bababuilds-erp`; 5s connection timeout, 30s idle timeout). Missing or non-PostgreSQL `DATABASE_URL` fails closed. `prisma.config.ts` owns the migration datasource. Legacy JavaScript maintenance scripts remain CommonJS.

**Validation gates:** npm ci with Node 26.13.1; Prisma CLI generate/validate; migration history and schema parity on the disposable PostgreSQL 17 `bababuilds_erp_ci` database; PostgreSQL financial concurrency, raw SQL and Decimal tests; lint, typecheck, Vitest, production build, packaged standalone server, native ARM64 candidate and browser smoke.

**Deployment remains separate.** Production activation requires a reviewed backup and restore test. No data migration is required; rollback means restoring the previous Prisma 6 application artifact without changing the database schema or migration history.

Official references: https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7 and https://www.prisma.io/docs/orm/release-status

## Connection-pool rules

- An interactive `prisma.$transaction(async (tx) => …)` holds one pooled connection for its whole callback.
  Inside it, use only `tx` (and helpers you pass `tx` to). Calling the global `prisma`, or a helper that
  defaults to it, checks out a second connection; under concurrency every connection ends up held by a
  transaction waiting for another and the pool deadlocks until the 5s connect timeout.
  `tests/db/no-global-prisma-in-transaction.test.ts` enforces this.
- Size the pool as `ERP_PG_POOL_MAX` × (server processes + cron/worker processes) and keep it well below
  PostgreSQL `max_connections` (default 100).
