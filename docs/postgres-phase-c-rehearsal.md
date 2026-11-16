# BabaBuilds ERP — Phase C: isolated PostgreSQL rehearsal and recovery

**Status:** implementation tools and disposable CI tests, not authorization for live cutover. Depends on Phase B PR #623. This phase is a stacked draft PR against the Phase B branch; neither may be deployed to the running ERP until approved. **Never merge Phase B/Phase C into main as an ordinary release**: the Prisma provider and deployment workflow must stay coordinated with the production database.

## 1. Preflight (read-only discovery)

- Confirm current server capacity, PG17 daemon health, owner/runtime/migrator role separation, and no privilege leakage into MenuMinute or ClubKeep.
- Confirm which SQLite file is active via the PM2 environment and Prisma datasource. Do **not** assume GitHub's path is the running database. Record inode, byte size, existing WAL mode and the last clean backup.
- Read-only: SQLite PRAGMA integrity_check, foreign_key_check, schema/table counts; verify off-host restic snapshots and the independent restore procedure.
- Verify baseline manifests from Phase A. Financial amounts must be reconciled **per workspace and original currency**, never summed across unlike currencies.
- Verify storage/headroom for isolated PG targets and WAL from import plus local custom-format dump. Never use template1, postgres, menuminute, clubkeep or a populated PG target.

## 2. Capture a consistent SQLite backup

This requires an operator with read permission on production SQLite. Reading from an online SQLite database with sqlite3's online backup API is allowed for a rehearsal; it does not change existing application tables. The new snapshot is sensitive data: use a private, encrypted volume and mode 0600. Never commit it or send it to GitHub Actions.

Operator example (substitute the **verified** live path and protected private destination):

    umask 077
    mkdir -m 700 -p /var/lib/bababuilds-erp/rehearsals
    sqlite3 /absolute/verified/erp/live.db ".backup '/var/lib/bababuilds-erp/rehearsals/erp-snapshot.db'"
    sqlite3 /var/lib/bababuilds-erp/rehearsals/erp-snapshot.db 'PRAGMA integrity_check;'
    sqlite3 /var/lib/bababuilds-erp/rehearsals/erp-snapshot.db 'PRAGMA foreign_key_check;'
    sha256sum /var/lib/bababuilds-erp/rehearsals/erp-snapshot.db

For the final cutover, **write-freeze first**. For this read-only rehearsal, online SQLite backup is permitted. Do not copy only a WAL-mode .db file while active writes continue; use online .backup.

## 3. Provision two *fresh*, isolated PostgreSQL databases

The operator must separately provision:

- bababuilds_erp_staging (migration + reconciliation)
- bababuilds_erp_drill (dump restore, **empty including public schema user tables**)

Use independent scoped ERP migration roles. Deny CONNECT to public and other app roles, revoke PUBLIC CREATE, retain the documented source-to-target database ownership. No ERP role may access menuminute or clubkeep. Do not expose these DBs to the public internet. Do not use any already-populated databases. Do not grant superuser to the app.

The scripts are deliberately **non-provisioning**: they never CREATE DATABASE or DROP DATABASE. The operator must prepare empty targets first.

## 4. Run isolated rehearsal

Use a separately checked-out Phase C branch and installed Prisma dependencies (Prisma 6). Set the credentials through a protected environment file; avoid command-line arguments containing secrets.

    export DATABASE_URL='postgresql://<migrator>:<secret>@127.0.0.1:5432/bababuilds_erp_staging'
    npx prisma migrate deploy
    python3 scripts/sqlite-to-postgres.py \
      --sqlite /var/lib/bababuilds-erp/rehearsals/erp-snapshot.db \
      --target-db bababuilds_erp_staging --acknowledge-empty-target
    python3 scripts/phase-c-verify.py \
      --sqlite /var/lib/bababuilds-erp/rehearsals/erp-snapshot.db \
      --target-db bababuilds_erp_staging \
      --evidence /var/lib/bababuilds-erp/rehearsals/parity.json

**Pass criteria:** every source table has the same columns and total records as its PostgreSQL counterpart; every normalized row (including booleans, dates, decimals, JSON, binary fields, identity and auth records) hashes identically; 100% of financial aggregates agree by workspace hash and original currency; no unvalidated PG FKs; baseline migration present. A count-only check is NOT adequate.

The verifier is PostgreSQL read-only and refuses all application and production database names. It prints only hashes, totals, table names and verdicts, no customer rows. The evidence JSON is written with 0600 mode and never overwritten.

## 5. Independent local database restore drill

Provision a fresh *empty* bababuilds_erp_drill database (never reuse it). Ensure the required scoped role can create objects and restore the dump. Set RESTORE_DATABASE_URL from a protected secret file.

    export RESTORE_DATABASE_URL='postgresql://<drill_owner>:<secret>@127.0.0.1:5432/bababuilds_erp_drill'
    python3 scripts/phase-c-restore-drill.py \
      --source-db bababuilds_erp_staging \
      --drill-db bababuilds_erp_drill \
      --sqlite /var/lib/bababuilds-erp/rehearsals/erp-snapshot.db \
      --evidence /var/lib/bababuilds-erp/rehearsals/restore-parity.json \
      --acknowledge-empty-drill

This creates a private temporary PostgreSQL 17 custom-format archive, validates its TOC, restores transactionally to the isolated drill database and reruns full SQLite-to-restored-database checks. It does NOT confirm encrypted off-host restic restore; that requires a separate real snapshot download, extraction and independently verified restore. Restore drill never drops an existing DB, and leaves the drill DB for controlled inspection.

## 6. Application functional rehearsal

Without live customers, use an isolated app staging instance with isolated Redis queue, notifications disabled, payment gateway webhooks disabled and email/SMS delivery disabled. Verify:

- Auth: login, sessions, roles, workspace isolation, demo tenancy; tenant memberships and permission checks.
- Billing: invoices, partial payments and reversals, idempotent payment capture, purchase orders and inventory, retainer cycles.
- Books: workspace/currency-specific invoice totals, payment entries, receipts, tax, expenses, payroll, CRM and reporting.
- Documents: database file references map to existing private uploads; assets and permissions survive; no customer documents sent to external services.
- PostgreSQL transactions: same-idempotency-key racing requests, distinct-key competing writes, serializable conflict retries and rollback paths.
- Multi-tenant safety: no cross-workspace access, no connect privilege to MenuMinute or ClubKeep.
- Reliability: representative PG peak connection load and pool/timeout telemetry; simulated failed import leaves no partial data.
- Recovery: restored app against independent restored database and private media, with credentials/mail/webhooks disabled.

Do not confuse unit tests with proof of end-to-end accounting, security, external storage or recovery readiness.

## 7. Cutover decision and rollback (Phase D, not automated)

Block cutover unless source snapshot and row/financial parity match, app functional rehearsal passes, independent restic encrypted off-host restore succeeds, SQL+media recovery point is consistent, and user/operator approves a maintenance window.

During cutover: stop ERP web writes and workers; prevent cron/webhook mutation; take a final SQLite online backup; capture consistent media; provision new isolated production ERP PostgreSQL DB with least privileges; migrate final snapshot; compare; switch app connection as an atomic release; monitor payment/idempotency, app health and errors; enable writes only after smoke tests.

Rollback: if **no PostgreSQL writes** were admitted, revert app config and release to SQLite plus original worker/queue state. If PostgreSQL has accepted any writes, do **not** blindly switch back to old SQLite: preserve the PG DB and reconcile/replay those writes using an approved recovery playbook to avoid double charges or missing invoices.

### Evidence required before Phase D

- SHA256 of offline source snapshot, SQLite integrity_check/FK-check results, all-table digest and financial parity evidence.
- Clean PG17 baseline migration history; validated FK constraints.
- Independent restored DB parity evidence and encrypted off-host restic restore success.
- File manifest, authorization matrix, financial concurrency and idempotency test artifacts.
- Approved stop/rollback steps, RPO/RTO objectives and monitored maintenance window.
- Written proof that ordinary ERP deployments remain safe while SQLite is in production.

**This phase does not touch your VPS, production SQLite, MenuMinute, ClubKeep, or their services.**
