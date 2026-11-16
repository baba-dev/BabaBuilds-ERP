#!/usr/bin/env bash
# D1–D4 trusted VPS operator entrypoint: creates only isolated staging.
# NEVER stops/restarts ERP, MenuMinute or ClubKeep production services.
set -Eeuo pipefail
umask 077
(( EUID == 0 )) || { echo "Root operator required" >&2; exit 1; }
[[ -n "$ERP_STAGING_SUFFIX" && -n "$ERP_LIVE_SQLITE" && -n "$ERP_STAGING_CHECKOUT" && -n "$ERP_LIVE_MEDIA_ROOT" ]]
[[ "$ERP_STAGING_SUFFIX" =~ ^[a-z0-9]{4,12}$ ]] || exit 2
[[ "$ERP_LIVE_SQLITE" = /* && "$ERP_STAGING_CHECKOUT" = /* && "$ERP_LIVE_MEDIA_ROOT" = /* ]] || exit 2
suffix="$ERP_STAGING_SUFFIX"
app="$(realpath -e "$ERP_STAGING_CHECKOUT")"
live="$(realpath -e "$ERP_LIVE_SQLITE")"
media="$(realpath -e "$ERP_LIVE_MEDIA_ROOT")"
[[ -d "$app/.git" && -f "$app/prisma/schema.prisma" ]] ||
 { echo "Separate reviewed git checkout required" >&2; exit 1; }
[[ "$app" == "/opt/bababuilds-erp-staging/$suffix/app" ]] ||
 { echo "Stage checkout must be /opt/bababuilds-erp-staging/$suffix/app" >&2; exit 1; }
[[ "$app" != "/var/www/bababuilds-erp" && "$live" != "$app/"* &&
   "$media" != "$app" && "$media" != "$app/"* ]] || exit 2
[[ "$media" == "/var/www/bababuilds-erp" ]] ||
 { echo "Expected verified production media root /var/www/bababuilds-erp" >&2; exit 1; }
[[ -z "$(find "$app" -maxdepth 1 -name '.env*' -print -quit)" ]] ||
 { echo "Refusing checkout containing env secrets" >&2; exit 1; }
checkout_branch="$(git -C "$app" branch --show-current)"
[[ "$checkout_branch" == "feature/phase-d1-d4-postgresql-realdata-staging" ]] ||
 { echo "Checkout must be the reviewed D1–D4 branch" >&2; exit 1; }
if ss -lnt | grep -Eq '(127[.]0[.]0[.]1|0[.]0[.]0[.]0|[::]):3101[[:space:]]'; then
  echo "Staging port 3101 already occupied" >&2; exit 1
fi
for program in rsync runuser node npm psql systemctl; do command -v "$program" >/dev/null; done
# The repository explicitly requires Node 22. Avoid staging state/database
# changes if the invoking shell would build using the system Node 20.
[[ "$(node -p 'process.versions.node.split(".")[0]')" == "22" ]] ||
 { echo "Stage requires Node 22 in PATH; production Node is left unchanged" >&2; exit 1; }
state="/var/lib/bababuilds-erp/staging/$suffix"
[[ ! -e "$state" ]] || { echo "Staging suffix exists: no reuse" >&2; exit 1; }
install -d -m 0700 "$state"
install -d -m 0700 "$state/credentials"
if ! id -u erpstaging >/dev/null 2>&1; then
  useradd --system --no-create-home --shell /usr/sbin/nologin erpstaging
fi
python3 "$app/scripts/staging/snapshot_sqlite.py" \
  --live-sqlite "$live" --output "$state/erp-live-snapshot.db"
python3 "$app/scripts/staging/provision.py" \
  --suffix "$suffix" --state-dir "$state/credentials" --port 3101

# Clone media to separate staging checkout, without following or copying symlinks.
for relative in private_uploads public/logos public/receipts public/invoices \
 public/signatures public/products public/uploads; do
  if [[ -d "$media/$relative" && ! -L "$media/$relative" ]]; then
    install -d -m 0700 "$app/$relative"
    rsync -r --no-links --safe-links -- "$media/$relative/" "$app/$relative/"
  fi
done
chown -R erpstaging:erpstaging "$app"
export HOME="$app"
cd "$app"
# No DB/provider creds loaded for postinstall.
runuser -u erpstaging -- npm ci --no-audit --no-fund
set -a
source "$state/credentials/migration.env"
set +a
runuser -u erpstaging -- npx --no-install prisma generate
runuser -u erpstaging -- npx --no-install prisma migrate deploy
python3 scripts/sqlite-to-postgres.py \
  --sqlite "$state/erp-live-snapshot.db" \
  --target-db "bababuilds_erp_staging_$suffix" \
  --acknowledge-empty-target
python3 scripts/phase-c-verify.py \
  --sqlite "$state/erp-live-snapshot.db" \
  --target-db "bababuilds_erp_staging_$suffix" \
  --evidence "$state/full-parity.json"
python3 scripts/staging/reconcile.py --media-root "$app" \
  --output "$state/business-invariants.json"
python3 scripts/staging/grant_runtime.py --suffix "$suffix"
unset DATABASE_URL
set -a
source "$state/credentials/runtime.env"
set +a
python3 scripts/staging/runtime_preflight.py --config-only
runuser -u erpstaging -- npm run build

# D4 only creates/cleans up a synthetic workspace.
export ERP_STAGING_TESTS=1
runuser -u erpstaging -- npx --no-install tsx scripts/staging/d4-probe.ts
unset ERP_STAGING_TESTS
python3 scripts/phase-c-verify.py \
  --sqlite "$state/erp-live-snapshot.db" \
  --target-db "bababuilds_erp_staging_$suffix" \
  --evidence "$state/post-concurrency-parity.json"

# Launch stage service only; no public vhost or production service changes.
install -m 0644 "$app/ops/systemd/erp-postgres-staging@.service" \
 /etc/systemd/system/erp-postgres-staging@.service
systemctl daemon-reload
systemctl start "erp-postgres-staging@$suffix.service"
sleep 3
systemctl is-active --quiet "erp-postgres-staging@$suffix.service"
python3 scripts/staging/http_smoke.py
printf '{"status":"PASS","stage":"%s","port":3101,"production_changed":false}\n' "$suffix"
