# Phase B PostgreSQL backup contract

The old SQLite VACUUM INTO snapshot is invalid on PostgreSQL. A protected root-operated job (scripts/backup.sh) creates a full PostgreSQL 17 custom-format pg_dump with local peer authentication, checks with pg_restore -l and snapshots private/public media via encrypted off-host restic.

It requires an operator-provisioned root-owned mode-0600 /etc/bababuilds-erp/backup.env containing RESTIC_REPOSITORY and RESTIC_PASSWORD_FILE. This PR does not install host units, grant sudo, configure remote restic, enable schedules or execute backups. A protected operator must supply sanitized backup metadata for the admin listing. The admin POST fails closed to avoid a partial runtime-role dump.

A separate restore drill, SQL/media consistency policy and off-host snapshot verification are hard gates before any ERP cutover.
