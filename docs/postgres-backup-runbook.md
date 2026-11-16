# ERP PostgreSQL 17: backup and recovery policy

The ERP production database is `bababuilds_erp` on PostgreSQL 17. The old file-based database backend is retired. No application HTTP route is allowed to perform a privileged full-database backup or restore.

## Backup

Use a trusted root-owned, mode-0600 operator configuration and a protected job to create a `pg_dump -Fc` archive through local PostgreSQL peer authentication. Confirm that `pg_restore -l` succeeds. Include ERP private uploads and legacy media directories, plus `public/partner-kit` and any `tmp/share-target` metadata, in the encrypted off-host Restic snapshot. Keep other applications' databases and credentials out of ERP backups.

The GitHub `backup.yml` workflow is gated and does not by itself prove a recurring VPS backup operator is installed. Enable a schedule only once the actual operator helper, permissions, alerts, retention and run outcomes have been verified. Track this under #640.

## Independent recovery

Retrieve a concrete off-host snapshot and compare checksums. Restore the database into a newly created, *disposable* PostgreSQL database, verify expected table counts and business invariants, and verify representative media paths. Do not restore over `bababuilds_erp` in a routine drill. Record the snapshot ID and restore outcome without exposing data or credentials.

Production cutover 2026-11-16 passed an independent encrypted full-database restore of 185 application tables. Subsequent backups require separate scheduled verification and monitoring.
