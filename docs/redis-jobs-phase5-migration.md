# Phase 5 delivery-ledger production migration gate

Tracking: #673; implementation: draft PR #675. **This is an operator approval checklist, not permission to run a live migration.**

## Why this is separately gated

The Phase 5 `20261118123000_erp_job_delivery_ledger` migration adds a new table with a unique (workspace, event kind, occurrence, channel, recipient identity) key and indexes. It does not alter or backfill existing business tables. Nonetheless the immutable ERP Node26 deployer verifies full PostgreSQL migration history against the release **before switching**. Merging migration-bearing source before applying the approved live migration will intentionally cause the web promoter to retain the old release.

The existing `bababuilds-erp-worker.service` is **boot-enabled** from Phase 4 and must not be restarted casually during the schema change. Redis 6384/6385/6386/6387 and MenuMinute/ClubKeep must remain unaffected.

## Gate B0 — reviewed Git and database inventory (read only)

1. Record exact reviewed GitHub PR head/main SHA and Git blob/checksum of `prisma/migrations/20261118123000_erp_job_delivery_ledger/migration.sql`; ensure no other pending migration or schema drift.
2. Record running immutable ERP release SHA, worker PID and unit hash; keep all Phase 5 new-family flags OFF (the draft adds none).
3. PostgreSQL 17: inventory `_prisma_migrations` and ensure current live history is complete, with Phase 4's two migrations applied, no failed/incomplete rows. Confirm `ErpJobDelivery` is **absent** before migration.
4. Verify owner-controlled protected `/var/www/bababuilds-erp/.env`, PostgreSQL migrator peer role, and healthy ERP, Postgres, Redis 6384–6387, MenuMinute web/worker and ClubKeep web.

## Gate B1 — encrypted off-host backup and independent drill

Use the **existing** known-good encrypted off-host Restic wrapper `/usr/local/sbin/menuminute-restic` with ERP-specific tags, as successfully used for Phase 4's PostgreSQL cutover. Do not create another Restic repository or modify MenuMinute backup settings. Create a fresh `pg_dump -Fc` of **ERP database only**, snapshot encrypted off-host, recover the exact archive and byte-compare it.

Restore it to a randomly named isolated disposable PG17 database (never production) using a postgres-owned private 0600 regular file, as Phase 4 found stdin restore streaming unreliable on this VPS. Compare row counts and representatives for `Workspace`, `Invoice`, `Expense`, `MailBillingSubscription`, `MailBillingSettings`, `ErpJobOutbox` and user membership. Apply **only** the reviewed new migration SQL on the disposable DB and verify:

- New `ErpJobDelivery` table, unique index, pending and workspace indexes, FK, and expected defaults all exist.
- Attempted duplicate occurrence in a rolled-back transaction fails by unique key.
- Unauthorized cross-workspace record references fail by FK; all unrelated table row counts remain unchanged.
- Source/outbox/in-app and financial tables are untouched.
- No data leaves the isolated drill and the disposable database is dropped on both success and failure.

Record a short-lived root-only rehearsal attestation bound to the exact snapshot, migration checksum, candidate release SHA and database pre-migration state. Do not paste the snapshot or customer data in GitHub comments.

## Gate B2 — reviewed production Prisma migration only

Only after the independent restore/drill PASS, obtain explicit owner operator approval. Take a new pre-migration snapshot if the attestation has expired; verify current main SHA/SQL checksums have not moved and exactly the expected migration is pending. Run the **official reviewed Prisma 7.10.1 `migrate deploy`** via PostgreSQL local Unix-socket peer-authenticated migrator (not the normal limited ERP application role). Do **not** grant the app role SUPERUSER, migration-table ownership or remote postgres login; do **not** use `prisma db push`.

After applying, verify full `_prisma_migrations` checksums, table constraints, and grants to the existing limited ERP application role (only the intended `ErpJobDelivery` SELECT/INSERT/UPDATE/DELETE). Verify ERP and sibling services; don't restart worker or modify Redis yet.

## Gate B3 — immutable release, canaries and rollback

Trigger the protected ERP-only immutable release after migration history matches; verify live SHA, ERP HTTP readiness, worker remains running and separate, all sibling services healthy. Never assume the worker code loaded on web deploy. New email, push and report job processors are **not** in this draft and no external delivery is enabled by applying this migration.

Rollback of code can use the previous immutable ERP release if its schema is backward compatible. **Do not drop the new ledger table or delete delivery history in a routine rollback**, and never `FLUSH` Redis. If any migration or deployment check fails, retain the old running release, capture sanitized diagnostics and stop.

## Later external-delivery acceptance

Each of SMTP, push and scheduled-report delivery needs a separate owned test inbox/device, exact internal workspace allowlist, provider ambiguity/revocation/retry tests and operational signoff. The Phase 4 24-hour soak waiver is NOT evidence for Phase 5 external-send families. Issue #673 stays open.
