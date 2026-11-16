#!/usr/bin/env bash
# Root-installed, one-SHA-at-a-time ERP standalone deploy. No SQLite or system Node.
set -Eeuo pipefail
umask 077
export HOME=/root PM2_HOME=/root/.pm2
NODE_BIN=/opt/bababuilds-erp/node22/bin
NODE="$NODE_BIN/node"
NPM="$(readlink -f "$NODE_BIN/npm")"
PM2=/root/.nvm/versions/node/v24.14.1/lib/node_modules/pm2/bin/pm2
export PATH="$NODE_BIN:/usr/sbin:/usr/bin:/sbin:/bin"
LIVE=/var/www/bababuilds-erp
PG_ENV=/etc/bababuilds-erp/production-database.env
BASE=/opt/bababuilds-erp/releases
STATE=/var/lib/bababuilds-erp/deployment
REPO=https://github.com/baba-dev/BabaBuilds-ERP.git
PREV=
NEW=
PREVIEW_PID=
SWITCHED=0
die() { echo "ERP_RELEASE_BLOCKED: $*" >&2; exit 1; }
log() { echo "[ERP release] $*"; }
check_host() {
  (( EUID == 0 )) || die "root required"
  [[ -x "$NODE" && -f "$NPM" && -f "$PM2" ]] || die "Node22/npm/root PM2 missing"
  [[ "$("$NODE" -p 'process.versions.node.split(".")[0]+":"+process.arch')" == 22:arm64 ]] || die "Node 22 ARM64 required"
  for unit in pm2-root postgresql@17-main menuminute-web menuminute-worker clubkeep-web; do
    systemctl is-active --quiet "$unit" || die "required service down: $unit"
  done
  for file in "$LIVE/.env" "$PG_ENV"; do
    [[ -f "$file" && ! -L "$file" && "$(stat -c '%u:%a' "$file")" == 0:600 ]] || die "protected env must be root 0600"
  done
  [[ -d "$BASE" && ! -L "$BASE" ]] || die "prepare root-owned /opt/bababuilds-erp/releases"
  [[ "$(stat -c '%u' "$BASE")" == 0 ]] || die "release directory must be root-owned"
  [[ -d "$LIVE/private_uploads" ]] || die "authoritative upload directory missing"
  [[ "$(/usr/sbin/runuser -u postgres -- psql -X -At -d postgres -c "SELECT count(*) FROM pg_database WHERE datname='bababuilds_erp'")" == 1 ]] || die "production PostgreSQL missing"
  [[ -z "$(ss -H -lnt 'sport = :3199')" ]] || die "private preview port in use"
}
current_run() {
  "$PM2" jlist | "$NODE" -e '
    let input="";process.stdin.on("data",c=>input+=c);
    process.stdin.on("end",()=>{
      let apps=JSON.parse(input).filter(x=>x.name==="erp");if(apps.length!==1)process.exit(2);
      const e=apps[0].pm2_env||{},a=e.args||[],cwd=e.pm_cwd||"";
      if(e.status!=="online"||e.pm_exec_path!=="/opt/bababuilds-erp/node22/bin/node"
        ||!Array.isArray(a)||a.length!==3
        ||a[0]!=="--env-file=/var/www/bababuilds-erp/.env"
        ||a[1]!=="--env-file=/etc/bababuilds-erp/production-database.env"
        ||a[2]!==cwd+"/server.js")process.exit(3);
      if(cwd!=="/opt/bababuilds-erp-cutover/cut1611b/app/.next/standalone" &&
       !/^\/opt\/bababuilds-erp\/releases\/sha-[a-f0-9]{40}-[0-9]{8}T[0-9]{6}Z\/runtime$/.test(cwd))process.exit(4);
      console.log(cwd);
    });
  '
}
check_schema() {
  python3 - "$1/prisma/migrations" <<'PY'
import hashlib,pathlib,subprocess,sys
p=pathlib.Path(sys.argv[1])
files=sorted(p.glob("*/migration.sql"))
assert files, "No PostgreSQL migrations in release"
query='SELECT migration_name, checksum FROM public."_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name'
result=subprocess.run(["/usr/sbin/runuser","-u","postgres","--","psql","-X","-At","-F","|","-d","bababuilds_erp","-c",query],check=True,text=True,capture_output=True)
actual=dict(line.split("|",1) for line in result.stdout.strip().splitlines())
expected={f.parent.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in files}
if actual != expected:
    raise SystemExit("BLOCKED: PostgreSQL schema migration pending/changed; perform reviewed DB migration first")
print("POSTGRESQL_SCHEMA_HISTORY_MATCH")
PY
}
start_erp() {
  local runtime="$1"
  (cd "$runtime" && env -u DATABASE_URL -u ERP_STAGING_MODE -u RESTORE_DATABASE_URL \
    PORT=3000 HOSTNAME=127.0.0.1 PRIVATE_UPLOADS_DIR="$LIVE/private_uploads" \
    "$PM2" start "$NODE" --name erp --interpreter none --cwd "$runtime" -- \
     "--env-file=$LIVE/.env" "--env-file=$PG_ENV" "$runtime/server.js")
}
smoke() {
  local port="$1" status=000
  for attempt in $(seq 1 24); do
    status="$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/login" 2>/dev/null || true)"
    case "$status" in 200|302|307|308) break ;; esac
    sleep 2
  done
  case "$status" in 200|302|307|308) ;; *) return 1 ;; esac
  [[ "$(curl -sS --max-time 8 -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port/sw.js" 2>/dev/null || true)" == 200 ]]
}
stop_preview() {
  if [[ -n "$PREVIEW_PID" ]]; then
    kill "$PREVIEW_PID" 2>/dev/null || true
    wait "$PREVIEW_PID" 2>/dev/null || true
    PREVIEW_PID=
  fi
}
on_error() {
  local rc=$?
  trap - ERR
  set +e
  stop_preview
  if (( SWITCHED == 1 )); then
    log "New release failed; restoring previous PM2 standalone runtime"
    "$PM2" delete erp >/dev/null 2>&1 || true
    start_erp "$PREV" >/dev/null 2>&1
    if smoke 3000; then
      "$PM2" save >/dev/null
      log "PREVIOUS_RELEASE_RESTORED"
    else
      echo "CRITICAL: rollback failed; check ERP PM2 manually" >&2
    fi
  else
    log "Original ERP remained active (failure before switch)"
  fi
  echo "ERP_RELEASE_FAILED exit=$rc" >&2
  exit "$rc"
}
trap on_error ERR
trap stop_preview EXIT
[[ "$#" -ge 1 ]] || die "Usage: --check | --deploy <40-char SHA>"
case "$1" in
  --check)
    check_host
    PREV="$(current_run)" || die "unexpected ERP PM2 runtime"
    [[ -s "$PREV/server.js" ]] || die "active server missing"
    log "ERP_RELEASE_HOST_READY current=$PREV"
    exit 0
    ;;
  --deploy)
    [[ "$#" -eq 2 && "$2" =~ ^[0-9a-f]{40}$ ]] || die "full SHA required"
    SHA="$2"
    check_host
    PREV="$(current_run)" || die "unexpected root ERP PM2 runtime"
    [[ -s "$PREV/server.js" ]] || die "active server missing"
    install -d -o root -g root -m 0700 "$STATE"
    exec 9>"$STATE/deploy.lock"
    flock -n 9 || die "another deployment is active"
    space="$(df -Pk "$BASE" | awk 'NR==2 {print $4}')"
    (( space > 12 * 1024 * 1024 )) || die "less than 12 GiB free: no automatic pruning"
    tag="$(date -u +%Y%m%dT%H%M%SZ)"
    release="$BASE/sha-$SHA-$tag"
    [[ ! -e "$release" ]] || die "release path collision"
    install -d -m 0700 "$release"
    SRC="$release/source"
    NEW="$release/runtime"
    log "Preparing $SHA in isolated directory"
    git clone --quiet --single-branch --branch main --depth 100 "$REPO" "$SRC"
    git -C "$SRC" cat-file -e "$SHA^{commit}" || die "SHA unavailable in fetched main"
    git -C "$SRC" merge-base --is-ancestor "$SHA" origin/main || die "SHA not on main"
    if [[ -f "$STATE/active.sha" ]]; then
      prevsha="$(cat "$STATE/active.sha")"
      [[ "$prevsha" =~ ^[0-9a-f]{40}$ ]] || die "invalid recorded current SHA"
      git -C "$SRC" merge-base --is-ancestor "$prevsha" "$SHA" || die "stale deploy refused"
    fi
    git -C "$SRC" checkout -q --detach "$SHA"
    [[ "$(git -C "$SRC" rev-parse HEAD)" == "$SHA" ]] || die "wrong checked-out SHA"
    check_schema "$SRC"
    [[ ! -d "$SRC/prisma/sqlite-history" ]] || die "SQLite history present in release"
    env -u DATABASE_URL -u ERP_STAGING_MODE \
      "$NODE" "--env-file=$LIVE/.env" "--env-file=$PG_ENV" "$NPM" ci --prefix "$SRC" --include=dev --no-audit --no-fund
    (cd "$SRC" && env -u DATABASE_URL -u ERP_STAGING_MODE NODE_ENV=production \
      NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS="--max-old-space-size=4096" \
      "$NODE" "--env-file=$LIVE/.env" "--env-file=$PG_ENV" "$NPM" run build)
    [[ -s "$SRC/.next/standalone/server.js" && -s "$SRC/public/sw.js" ]] || die "missing standalone server or Serwist worker"
    mkdir -p "$NEW/public" "$NEW/.next/static"
    cp -a "$SRC/.next/standalone/." "$NEW/"
    cp -a "$SRC/public/." "$NEW/public/"
    cp -a "$SRC/.next/static/." "$NEW/.next/static/"
    for path in public/invoices public/receipts public/logos public/signatures public/products public/uploads; do
      [[ -d "$LIVE/$path" && ! -L "$LIVE/$path" ]] || die "persistent media missing: $path"
      dest="$NEW/$path"
      if [[ -e "$dest" || -L "$dest" ]]; then
        [[ -d "$dest" && ! -L "$dest" && -z "$(ls -A "$dest")" ]] || die "public-media collision: $path"
        rmdir "$dest"
      fi
      ln -s "$LIVE/$path" "$dest"
    done
    for path in private_uploads backups tmp/share-target; do
      [[ -d "$LIVE/$path" && ! -L "$LIVE/$path" ]] || die "persistent dir missing: $path"
      dest="$NEW/$path"
      [[ ! -e "$dest" && ! -L "$dest" ]] || die "private-media collision: $path"
      mkdir -p "$(dirname "$dest")"
      ln -s "$LIVE/$path" "$dest"
    done
    printf '%s\n' "$SHA" > "$release/release.sha"
    chmod 0600 "$release/release.sha"
    log "HTTP preview on loopback:3199"
    (cd "$NEW" && env -u DATABASE_URL -u ERP_STAGING_MODE \
      PORT=3199 HOSTNAME=127.0.0.1 PRIVATE_UPLOADS_DIR="$LIVE/private_uploads" \
      "$NODE" "--env-file=$LIVE/.env" "--env-file=$PG_ENV" "$NEW/server.js") \
      >"$release/preview.log" 2>&1 &
    PREVIEW_PID="$!"
    smoke 3199 || die "isolated preview failed"
    stop_preview
    if [[ -d "$NEW/public/partner-kit" && ! -L "$NEW/public/partner-kit" ]]; then
      [[ -d "$LIVE/public/partner-kit" && ! -L "$LIVE/public/partner-kit" ]] || die "legacy partner kit missing"
      cp -an "$NEW/public/partner-kit/." "$LIVE/public/partner-kit/"
      rm -rf "$NEW/public/partner-kit"
      ln -s "$LIVE/public/partner-kit" "$NEW/public/partner-kit"
    fi
    rm -rf "$SRC/node_modules" "$SRC/.next"
    install -m 0600 /root/.pm2/dump.pm2 "$release/pm2-before.json"
    log "Switching root PM2 to validated $SHA"
    SWITCHED=1
    "$PM2" delete erp >/dev/null
    start_erp "$NEW" >/dev/null
    smoke 3000 || die "public new release HTTP smoke failed"
    "$PM2" save >/dev/null
    printf '%s\n' "$SHA" > "$STATE/active.sha"
    printf '%s\n' "$NEW" > "$STATE/active-path"
    chmod 0600 "$STATE/active.sha" "$STATE/active-path"
    SWITCHED=0
    log "ERP_STANDALONE_PRODUCTION_DEPLOYED $SHA"
    ;;
  *) die "usage: --check | --deploy <40-char main commit SHA>" ;;
esac
