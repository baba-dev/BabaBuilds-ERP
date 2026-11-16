#!/usr/bin/env bash
# Supervised final ERP SQLite -> PostgreSQL 17 cutover. This STOPS public ERP.
# Run only after scripts/production/prepare_fast_cutover.sh reports PREPARED.
set -Eeuo pipefail
umask 077
(( EUID == 0 )) || { echo "Root required" >&2; exit 2; }

CUT=cut1611b
LIVE=/var/www/bababuilds-erp
APP="/opt/bababuilds-erp-cutover/$CUT/app"
STATE="/var/lib/bababuilds-erp/cutover/$CUT"
RUN="$APP/.next/standalone"
NODEBIN=/opt/bababuilds-erp/node22/bin
PM2=/root/.nvm/versions/node/v24.14.1/lib/node_modules/pm2/bin/pm2
export PM2_HOME=/root/.pm2
export PATH="/root/.nvm/versions/node/v24.14.1/bin:$NODEBIN:/usr/sbin:/usr/bin:/sbin:/bin"
export HOME=/root

[[ -f "$STATE/prepared-sha" && -f "$RUN/server.js" ]] || { echo "Production release not prepared" >&2; exit 1; }
[[ "$(git -C "$APP" rev-parse HEAD)" == "$(cat "$STATE/prepared-sha")" ]] || { echo "Release commit mismatch" >&2; exit 1; }
[[ -x "$PM2" && -f "/root/.pm2/dump.pm2" ]] || { echo "Saved root PM2 state unavailable" >&2; exit 1; }
[[ -f "$LIVE/prisma/dev.db" && -f "$LIVE/.env" ]] || { echo "Live SQLite/env missing" >&2; exit 1; }
[[ ! -e "$STATE/final-sqlite.db" && ! -e "/etc/bababuilds-erp/production-database.env" ]] || {
  echo "Final migration already started or database credentials exist; refuse rerun" >&2; exit 1;
}
[[ "$(systemctl is-active pm2-root postgresql@17-main menuminute-web menuminute-worker clubkeep-web | grep -c '^active$')" == 5 ]] || {
  echo "Expected platform services not all active" >&2; exit 1;
}
pg_query="$(/usr/sbin/runuser -u postgres -- psql -X -Atqc "select count(*) from pg_database where datname='bababuilds_erp'")" || {
  echo "Production PostgreSQL existence query failed; refusing cutover" >&2; exit 1;
}
[[ "$pg_query" == "0" ]] || {
  echo "Production PostgreSQL database exists (or unexpected query result); refusing cutover" >&2; exit 1;
}

# Safely restore legacy runtime ONLY if no PostgreSQL production database
# exists. After promotion, NEVER automatically return to SQLite.
FROZEN=0
RESTORED=0
on_error() {
  rc=$?
  trap - ERR
  set +e
  if (( FROZEN == 1 )); then
    pg_exists="$(runuser -u postgres -- psql -X -Atqc "select count(*) from pg_database where datname='bababuilds_erp'" 2>/dev/null)"
    if [[ "$pg_exists" == 0 ]]; then
      echo "CUTOVER FAILED before promotion; restoring original SQLite ERP."
      "$PM2" restart erp >/dev/null
      crontab "$STATE/root-crontab.before"
      RESTORED=1
    else
      echo "CUTOVER NEEDS OPERATOR: PG may be promoted; keeping ERP in maintenance and cron paused."
      echo "Do not revert to SQLite after accepting PG writes."
    fi
  fi
  echo "Cutover failed at line $1, exit $rc" >&2
  exit "$rc"
}
trap 'on_error "$LINENO"' ERR

echo "=== Preserve the root PM2 and all crontab entries privately ==="
install -m 0600 /root/.pm2/dump.pm2 "$STATE/pm2-dump.before"
crontab -l > "$STATE/root-crontab.before"
python3 - "$STATE/root-crontab.before" "$STATE/root-crontab.paused" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text()
patterns = (
    "/var/www/bababuilds-erp/scripts/run-cron.sh",
    "erp.bababuilds.com/api/cron/",
    "127.0.0.1:3000/api/cron/",
)
count = 0
out = []
for line in source.splitlines(keepends=True):
    if line.strip() and not line.lstrip().startswith("#") and any(p in line for p in patterns):
        count += 1
        out.append("# ERP_PG_CUTOVER_PAUSED " + line)
    else:
        out.append(line)
if count != 15:
    raise SystemExit("Expected exactly 15 active ERP cron entries; refuse freeze")
pathlib.Path(sys.argv[2]).write_text("".join(out))
print("Verified 15 ERP jobs to pause; unrelated cron unchanged")
PY
FROZEN=1
crontab "$STATE/root-crontab.paused"
"$PM2" stop erp
sleep 2
if [[ -n "$(ss -H -lnt 'sport = :3000')" ]]; then
  echo "Old ERP port 3000 still listening" >&2
  exit 1
fi
echo "=== Final frozen SQLite source and off-host encrypted restore ==="
install -d -o root -g root -m 0700 "$STATE/backups" "$STATE/backups/finalrestore1"
SRC_SHA="$(sha256sum "$LIVE/prisma/dev.db" | awk '{print $1}')"
python3 "$APP/scripts/staging/snapshot_sqlite.py" \
  --live-sqlite "$LIVE/prisma/dev.db" \
  --output "$STATE/final-sqlite.db" \
  --expect-source-sha256 "$SRC_SHA"
python3 "$APP/scripts/production/backup_restore_rehearsal.py" \
  --suffix "$CUT" --run-id finalrestore1 \
  --snapshot "$STATE/final-sqlite.db" \
  --acknowledge-shared-encrypted-repository

echo "=== Exact final-data PG import and independent restore drill ==="
(
  cd "$APP"
  export PATH="$NODEBIN:/usr/bin:/bin"
  set -a; source "$STATE/credentials/migration.env"; set +a
  python3 scripts/sqlite-to-postgres.py \
    --sqlite "$STATE/final-sqlite.db" \
    --target-db "bababuilds_erp_staging_$CUT" --acknowledge-empty-target
  python3 scripts/phase-c-verify.py \
    --sqlite "$STATE/final-sqlite.db" \
    --target-db "bababuilds_erp_staging_$CUT" \
    --evidence "$STATE/full-parity.json"
  python3 scripts/staging/reconcile.py \
    --media-root "$LIVE" --output "$STATE/business-invariants.json"
  set -a; source "$STATE/credentials/restore.env"; set +a
  python3 scripts/phase-c-restore-drill.py \
    --source-db "bababuilds_erp_staging_$CUT" \
    --drill-db "bababuilds_erp_drill_$CUT" \
    --sqlite "$STATE/final-sqlite.db" \
    --evidence "$STATE/restore-parity.json" \
    --acknowledge-empty-drill
)
# These are truthful attestations, created only following actual PASS checks.
python3 - "$STATE" <<'PY'
import json, pathlib, sys
p = pathlib.Path(sys.argv[1])
for name in ("full-parity.json", "restore-parity.json", "business-invariants.json"):
    v = json.loads((p / name).read_text())
    if v.get("status") != "PASS":
        raise SystemExit("Not all final parity/restore checks passed")
remote = json.loads((p / "backups/finalrestore1/restic-restore-evidence.json").read_text())
if remote.get("status") != "PASS" or remote.get("remote_restore_verified") is not True:
    raise SystemExit("Final off-host restore not independently verified")
(p / "write-freeze-confirmed").write_text("WRITE_FREEZE_CONFIRMED\n")
(p / "offhost-restore-verified").write_text("OFFHOST_DATABASE_AND_MEDIA_RESTORE_VERIFIED\n")
print("Exact parity and off-host restoration PASS")
PY
install -d -o root -g root -m 0750 /etc/bababuilds-erp
python3 "$APP/scripts/production/promote_candidate.py" \
  --suffix "$CUT" --acknowledge-final-database-rename

echo "=== Activate Node22 + PG on original port 3000 ==="
"$PM2" delete erp
unset DATABASE_URL RESTORE_DATABASE_URL
PORT=3000 HOSTNAME=127.0.0.1 PRIVATE_UPLOADS_DIR="$LIVE/private_uploads" \
  "$PM2" start "$NODEBIN/node" --name erp --interpreter none \
  --cwd "$RUN" -- \
  "--env-file=$LIVE/.env" \
  "--env-file=/etc/bababuilds-erp/production-database.env" \
  "$RUN/server.js"

ready=0
for attempt in $(seq 1 20); do
  status="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/login 2>/dev/null || true)"
  if [[ "$status" == 200 || "$status" == 302 || "$status" == 307 || "$status" == 308 ]]; then
    ready=1; break
  fi
  sleep 2
done
[[ "$ready" == 1 ]] || { echo "New PG ERP failed login HTTP smoke" >&2; exit 1; }
[[ "$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:3000/sw.js)" == 200 ]] || {
  echo "Production service worker not served" >&2; exit 1;
}
"$PM2" save
echo "=== Initial PostgreSQL custom dump ==="
runuser -u postgres -- pg_dump -Fc bababuilds_erp > "$STATE/postgres-initial.dump"
pg_restore -l "$STATE/postgres-initial.dump" >/dev/null
[[ -s "$STATE/postgres-initial.dump" ]] || { echo "PG initial dump missing" >&2; exit 1; }

echo "=== Restore original root cron and check sibling services ==="
crontab "$STATE/root-crontab.before"
[[ "$(systemctl is-active menuminute-web menuminute-worker clubkeep-web | grep -c '^active$')" == 3 ]] || {
  echo "Sibling service health not confirmed" >&2; exit 1;
}
echo "ERP_POSTGRESQL_ACTIVATED"
echo "Final SQLite and independent off-host restore kept in $STATE"
echo "Initial PG dump created; operator must complete off-host PG dump restore before closing migration."
