#!/usr/bin/env bash
# Operator-only independent PostgreSQL *DDL rehearsal*. No live-DB writes.
# Inputs: verified pg_dump -Fc archive restored from encrypted OFF-HOST restic,
#         migration.sql checked out from exact reviewed Git commit.
# Does NOT register Prisma migration; production requires official migrate deploy.
set -Eeuo pipefail
set +x
umask 077
[[ $(id -u) == 0 && $# == 2 ]] || {
  echo 'USAGE: sudo bash erp-phase4-rehearse.sh VERIFIED_OFFHOST_DUMP REVIEWED_MIGRATION_SQL'
  exit 2
}
archive=$1
migration=$2
expected_blob='d2aca4d4ef0eaff8b9286e65826212ed5a6b8868'
[[ -f "$archive" && ! -L "$archive" && -s "$archive" && \
   -f "$migration" && ! -L "$migration" && -s "$migration" ]] ||
  { echo 'NONREGULAR_OR_MISSING_ARCHIVE_OR_SQL'; exit 2; }
[[ $(basename "$(dirname "$migration")") == '20261117190000_erp_jobs_outbox' &&
   $(basename "$migration") == 'migration.sql' &&
   $(git hash-object "$migration") == "$expected_blob" ]] ||
  { echo 'MIGRATION_SOURCE_BLOB_NOT_REVIEWED'; exit 2; }
[[ $(stat -c '%U:%a' "$archive") == root:600 ]] ||
  { echo 'RESTORED_BACKUP_MUST_BE_ROOT_0600'; exit 2; }
/usr/lib/postgresql/17/bin/pg_restore -l "$archive" >/dev/null
available=$(df -Pk /var/lib/postgresql | awk 'NR==2 {print $4}')
[[ ${available:-0} -gt 6291456 ]] ||
  { echo 'INSUFFICIENT_FREE_DATABASE_SPACE_6GIB'; exit 2; }
# Only generated drill databases; no caller-provided database names allowed.
drill="bababuilds_erp_phase4_drill_$(date -u +%m%d%H%M%S)_$(openssl rand -hex 3)"
[[ $drill =~ ^bababuilds_erp_phase4_drill_[0-9]{10}_[a-f0-9]{6}$ ]]
created=false
cleanup() {
  if [[ $created == true ]]; then
    if runuser -u postgres -- /usr/lib/postgresql/17/bin/dropdb "$drill"; then
      echo 'ERP_PHASE4_DRILL_DATABASE_REMOVED'
    else
      echo 'WARNING: CLEAN UP ISOLATED DRILL DATABASE MANUALLY' >&2
    fi
  fi
}
trap cleanup EXIT
runuser -u postgres -- /usr/lib/postgresql/17/bin/createdb "$drill"
created=true
echo 'ERP_PHASE4_INDEPENDENT_DB_CREATED'
# Pipe because a protected root 0600 off-host archive cannot be opened by postgres.
cat "$archive" | runuser -u postgres -- /usr/lib/postgresql/17/bin/pg_restore \
  --no-owner --no-acl --exit-on-error -d "$drill" >/dev/null
echo 'ERP_PHASE4_SNAPSHOT_RESTORE_PASS'
if [[ $(runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -d "$drill" -c \
  "SELECT to_regclass('public.\"ErpJobOutbox\"') IS NOT NULL;") != f ]]; then
  echo 'SNAPSHOT_ALREADY_HAS_OUTBOX_TABLE: requires pre-migration snapshot' >&2
  exit 2
fi
# Fingerprint count of representative authoritative tables before & after DDL.
counts='SELECT (SELECT count(*) FROM "Workspace")::text || '\''|'\'' || (SELECT count(*) FROM "Invoice")::text || '\''|'\'' || (SELECT count(*) FROM "Expense")::text;'
before=$(runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -d "$drill" -c "$counts")
cat "$migration" | runuser -u postgres -- psql -X -q -v ON_ERROR_STOP=1 \
  --single-transaction -d "$drill" >/dev/null
after=$(runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -d "$drill" -c "$counts")
[[ "$before" == "$after" ]] || { echo 'AUTHORITATIVE_ROW_COUNTS_CHANGED'; exit 1; }
present=$(runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -d "$drill" -c \
  "SELECT to_regclass('public.\"ErpJobOutbox\"') IS NOT NULL;")
[[ "$present" == t ]] || { echo 'OUTBOX_DDL_MISSING'; exit 1; }
echo 'ERP_PHASE4_RESTORE_ROW_COUNTS_PRESERVED'
echo 'ERP_PHASE4_OUTBOX_DDL_REHEARSAL_PASS'
echo 'IMPORTANT: This confirms a restored DB + reviewed SQL, not production Prisma migration registration.'
