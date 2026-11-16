#!/usr/bin/env bash
# Prepare the integrated PostgreSQL production release while live ERP stays online.
# This DOES NOT freeze writers, stop PM2 or change the live SQLite database.
set -Eeuo pipefail
umask 077
(( EUID == 0 )) || { echo "Root required" >&2; exit 2; }

CUT=cut1611b
LIVE=/var/www/bababuilds-erp
NODEBIN=/opt/bababuilds-erp/node22/bin
SRC="$(cd "$(dirname "$0")/../.." && pwd -P)"
WORK="/opt/bababuilds-erp-cutover/$CUT"
APP="$WORK/app"
STATE="/var/lib/bababuilds-erp/cutover/$CUT"

[[ -f "$LIVE/prisma/dev.db" && -f "$LIVE/.env" ]] || { echo "Live ERP SQLite/env missing" >&2; exit 1; }
[[ -x "$NODEBIN/node" && -x "$NODEBIN/npm" ]] || { echo "Isolated Node22 missing" >&2; exit 1; }
[[ "$("$NODEBIN/node" -p 'process.versions.node.split(".")[0]')" == 22 ]] || exit 1
[[ "$(git -C "$SRC" branch --show-current)" == "feature/postgresql-production-main-integration" ]] || { echo "Use integration checkout" >&2; exit 1; }
[[ -z "$(git -C "$SRC" status --porcelain)" ]] || { echo "Source checkout dirty" >&2; exit 1; }
[[ ! -e "$WORK" && ! -e "$STATE" ]] || { echo "Fresh cut1611b required; never reuse cutover state" >&2; exit 1; }
[[ "$(systemctl is-active postgresql@17-main)" == active ]] || { echo "Postgres17 inactive" >&2; exit 1; }
mkdir -p "$WORK"
git clone -q --no-hardlinks "$SRC" "$APP"
[[ "$(git -C "$APP" rev-parse HEAD)" == "$(git -C "$SRC" rev-parse HEAD)" ]] || exit 1
SHA="$(git -C "$APP" rev-parse HEAD)"
echo "PREPARING candidate at integration SHA $SHA"

# Only creates new isolated candidate and drill; production DB remains absent.
python3 "$APP/scripts/production/provision_candidate.py" --suffix "$CUT"
export PATH="$NODEBIN:/usr/bin:/bin"
export HOME=/root
cd "$APP"
npm ci --no-audit --no-fund
(
  set -a
  source "$STATE/credentials/migration.env"
  set +a
  npx --no-install prisma generate
  npx --no-install prisma migrate deploy
)

# Build real PRODUCTION mode with Serwist, using the EMPTY cutover candidate.
# The live .env supplies auth/provider configuration, but the PG env overrides SQLite.
# Neither target is the live ERP database.
env -u DATABASE_URL -u ERP_STAGING_MODE NODE_ENV=production \
  "$NODEBIN/node" \
  "--env-file=$LIVE/.env" \
  "--env-file=$STATE/credentials/migration.env" \
  "$APP/node_modules/next/dist/bin/next" build --webpack
[[ -s "$APP/public/sw.js" && -s "$APP/.next/standalone/server.js" ]] || {
  echo "Production Serwist or standalone server missing" >&2; exit 1;
}

RUN="$APP/.next/standalone"
mkdir -p "$RUN/public" "$RUN/.next" "$RUN/tmp"
cp -a "$APP/public/." "$RUN/public/"
mkdir -p "$RUN/.next/static"
cp -a "$APP/.next/static/." "$RUN/.next/static/"

# Keep the authoritative live media as source of truth; never fork uploads
# into the disposable standalone build directory.
for rel in public/invoices public/receipts public/logos public/signatures public/products public/uploads public/partner-kit; do
  mkdir -p "$LIVE/$rel"
  target="$RUN/$rel"
  if [[ -e "$target" || -L "$target" ]]; then
    if [[ -d "$target" && ! -L "$target" && -z "$(ls -A "$target")" ]]; then
      rmdir "$target"
    else
      echo "Cannot safely overlay compiled static folder: $rel" >&2
      exit 1
    fi
  fi
  ln -s "$LIVE/$rel" "$target"
done
mkdir -p "$LIVE/tmp/share-target"
for rel in private_uploads backups tmp/share-target; do
  target="$RUN/$rel"
  if [[ -e "$target" || -L "$target" ]]; then
    echo "Unexpected persistent-path collision at $rel" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$target")"
  ln -s "$LIVE/$rel" "$target"
done

printf '%s\n' "$SHA" > "$STATE/prepared-sha"
chmod 0600 "$STATE/prepared-sha"
echo "PREPARED_NODE22_PRODUCTION_RELEASE"
echo "Candidate: bababuilds_erp_staging_$CUT (EMPTY, migrations applied)"
echo "Release path: $RUN"
echo "Commit: $SHA"
echo "Public ERP, PM2, crontab, and SQLite have NOT been changed."
