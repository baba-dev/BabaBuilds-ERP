# ERP SQLite to PostgreSQL importer

This is an isolated staging tool, not a deployment step. Requires Python 3.11+, psql 17 and a newly created, empty PostgreSQL database migrated using the PostgreSQL baseline. DATABASE_URL must come from a protected environment, point to an isolated ERP database on loopback, and must be scoped to a migration-owner role.

Create a consistent copy of the SQLite production database via sqlite3 .backup during a quiescent window; never run the importer against the live database. Example:

    python3 scripts/sqlite-to-postgres.py --sqlite /absolute/erp-snapshot.db --target-db bababuilds_erp_staging --acknowledge-empty-target

The importer runs source integrity and FK checks, rejects populated target tables, imports in one PostgreSQL transaction, restores and validates foreign keys, and verifies row-count parity before reporting success. PostgreSQL migration metadata is never copied from SQLite. Rehearsals use a FRESH isolated database for each run. No truncate, reset, or data merge is supported.

Row counts alone are insufficient to approve cutover: Phase C must also verify per-workspace and per-currency financial parity, authentication and file references, exact decimal/date types, restored backups, transaction/idempotency concurrency, and a write-freeze rollback playbook. NEVER point this tool at MenuMinute or ClubKeep.
