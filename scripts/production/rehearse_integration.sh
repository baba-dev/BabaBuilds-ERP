#!/usr/bin/env bash
# Isolated real-data rehearsal of current-main PostgreSQL integration.
# Never stops ERP, changes cron, alters production .env, or promotes a DB.
set -Eeuo pipefail
umask 077
(( EUID == 0 )) || { echo "Run as root" >&2; exit 2; }
: "${ERP_DRY_SUFFIX:?Unique 4-12 character lowercase alphanumeric suffix required}"
: "${ERP_SOURCE_SNAPSHOT:?Full path of already verified offline SQLite snapshot required}"
: "${ERP_SOURCE_SHA256:?Expected 64-character SHA256 of offline snapshot required}"
: "${ERP_INTEGRATION_SHA:?Reviewed 40-character integration checkout SHA required}"
[[ "$ERP_DRY_SUFFIX" =~ ^[a-z0-9]{4,12}$ ]] || exit 2
[[ "$ERP_SOURCE_SHA256" =~ ^[0-9a-f]{64}$ ]] || exit 2
[[ "$ERP_INTEGRATION_SHA" =~ ^[0-9a-f]{40}$ ]] || exit 2

app="/opt/bababuilds-erp-cutover/$ERP_DRY_SUFFIX/app"
state="/var/lib/bababuilds-erp/cutover/$ERP_DRY_SUFFIX"
nodebin=/opt/bababuilds-erp/node22/bin
source_snapshot="$(realpath -e "$ERP_SOURCE_SNAPSHOT")"
[[ "$ERP_SOURCE_SNAPSHOT" == "$source_snapshot" ]] || { echo "SQLite snapshot path must be canonical" >&2; exit 2; }
[[ "$source_snapshot" == /var/lib/bababuilds-erp/cutover/*/backups/*/source.sqlite ]] || {
  echo "Source must be a previously verified cutover backup, not live SQLite" >&2; exit 2;
}
[[ -d "$app/.git" && ! -e "$state" ]] || {
  echo "Missing integration checkout or existing rehearsal state; never reuse suffix" >&2; exit 1;
}
[[ "$(git -C "$app" branch --show-current)" == feature/postgresql-production-main-integration ]] || exit 1
[[ "$(git -C "$app" rev-parse HEAD)" == "$ERP_INTEGRATION_SHA" ]] || {
  echo "Reviewed integration SHA mismatch" >&2; exit 1;
}
[[ -z "$(git -C "$app" status --porcelain)" ]] || {
  echo "Integration checkout has uncommitted changes" >&2; exit 1;
}
[[ -x "$nodebin/node" && -x "$nodebin/npm" ]] || exit 1
[[ "$("$nodebin/node" -p 'process.versions.node.split(".")[0]')" == 22 ]] || exit 1

python3 - "$source_snapshot" "$ERP_SOURCE_SHA256" <<'PY'
import hashlib, json, pathlib, sqlite3, sys
path = pathlib.Path(sys.argv[1])
expected = sys.argv[2]
manifest = path.with_name(path.name + ".manifest.json")
if not path.is_file() or path.is_symlink() or not manifest.is_file() or manifest.is_symlink():
    raise SystemExit("Existing offline source and manifest required")
with open(path, "rb") as stream:
    sha = hashlib.file_digest(stream, "sha256").hexdigest()
meta = json.loads(manifest.read_text())
if sha != expected or meta.get("snapshot_sha256") != expected or meta.get("status") != "PASS":
    raise SystemExit("Saved SQLite backup hash/manifest mismatch")
with sqlite3.connect(path.as_uri() + "?mode=ro", uri=True) as db:
    if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
        raise SystemExit("Source SQLite integrity check failed")
print("Verified original off-host-backup source hash and SQLite integrity")
PY

# No database roles, candidate or filesystem state may exist before this point.
python3 "$app/scripts/production/provision_candidate.py" --suffix "$ERP_DRY_SUFFIX"
[[ -d "$state/credentials" ]] || exit 1
export PATH="$nodebin:/usr/bin:/bin"
export HOME=/root
cd "$app"
set -a
source "$state/credentials/migration.env"
set +a
npm ci --no-audit --no-fund
npx --no-install prisma generate
npx --no-install prisma migrate deploy
python3 scripts/sqlite-to-postgres.py \
  --sqlite "$source_snapshot" \
  --target-db "bababuilds_erp_staging_$ERP_DRY_SUFFIX" \
  --acknowledge-empty-target
python3 scripts/phase-c-verify.py \
  --sqlite "$source_snapshot" \
  --target-db "bababuilds_erp_staging_$ERP_DRY_SUFFIX" \
  --evidence "$state/full-parity.json"
python3 scripts/staging/reconcile.py \
  --media-root /var/www/bababuilds-erp \
  --output "$state/business-invariants.json"
set -a
source "$state/credentials/restore.env"
set +a
python3 scripts/phase-c-restore-drill.py \
  --source-db "bababuilds_erp_staging_$ERP_DRY_SUFFIX" \
  --drill-db "bababuilds_erp_drill_$ERP_DRY_SUFFIX" \
  --sqlite "$source_snapshot" \
  --evidence "$state/restore-parity.json" \
  --acknowledge-empty-drill
unset DATABASE_URL RESTORE_DATABASE_URL
python3 - "$state" "$ERP_DRY_SUFFIX" <<'PY'
import json, pathlib, sys
state = pathlib.Path(sys.argv[1])
suffix = sys.argv[2]
checks = ("full-parity.json", "business-invariants.json", "restore-parity.json")
for name in checks:
    value = json.loads((state / name).read_text())
    if value.get("status") != "PASS":
        raise SystemExit("Rehearsal evidence failed: " + name)
print(json.dumps({
    "status": "PASS", "suffix": suffix, "integration_import": "PASS",
    "finance_and_media": "PASS", "independent_pg_restore": "PASS",
    "production_changed": False, "production_candidate_untouched": True,
}, sort_keys=True))
PY
