#!/usr/bin/env bash
# Operator-only PostgreSQL + local media backup; no HTTP trigger.
set -Eeuo pipefail
umask 077
(( EUID == 0 )) || { echo 'Root operator required' >&2; exit 1; }
config=/etc/bababuilds-erp/backup.env
[[ -f "$config" && ! -L "$config" && "$(stat -c '%u:%a' "$config")" == 0:600 ]] ||
 { echo 'Expected protected root-owned 0600 backup configuration' >&2; exit 1; }
set -a
# shellcheck disable=SC1090
. "$config"
set +a
[[ "$RESTIC_REPOSITORY" =~ ^(s3|b2|azure|gs|sftp|rclone|rest): ]] ||
 { echo 'Off-host restic repository required' >&2; exit 1; }
[[ -f "$RESTIC_PASSWORD_FILE" ]] || { echo 'Missing restic password file' >&2; exit 1; }
database=bababuilds_erp
root=/var/lib/bababuilds-erp/backups
mkdir -p "$root"; chmod 700 "$root"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
temp="$(mktemp "$root/.backup-$stamp-XXXXXX")"
trap 'rm -f "$temp"' EXIT
# Peer-authenticated local postgres performs a complete, RLS-independent dump.
runuser -u postgres -- /usr/lib/postgresql/17/bin/pg_dump \
 -h /var/run/postgresql -U postgres -d "$database" -Fc --no-owner --no-acl > "$temp"
test -s "$temp"
/usr/lib/postgresql/17/bin/pg_restore -l "$temp" >/dev/null
archive="$root/erp-$stamp.dump"
mv -- "$temp" "$archive"; chmod 600 "$archive"
set -- "$archive"
for p in /var/www/bababuilds-erp/private_uploads \
 /var/www/bababuilds-erp/public/logos \
 /var/www/bababuilds-erp/public/invoices \
 /var/www/bababuilds-erp/public/receipts \
 /var/www/bababuilds-erp/public/signatures \
 /var/www/bababuilds-erp/public/products \
 /var/www/bababuilds-erp/public/uploads; do
 [[ ! -d "$p" ]] || set -- "$@" "$p"
done
tag="erp-$stamp"
restic backup --tag erp-database --tag "$tag" "$@"
restic snapshots --tag "$tag" --json | grep -Fq "$tag"
echo 'ERP encrypted remote snapshot recorded; verify restore separately.'
