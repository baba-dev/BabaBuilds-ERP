#!/usr/bin/env bash
# Calls one of the app's cron routes with the CRON_SECRET from the app's .env.
# Usage: scripts/run-cron.sh expense-automation
# Env:   CRON_BASE_URL (default http://127.0.0.1:3000), APP_DIR (default: the folder above this script)
set -euo pipefail
route="${1:?usage: run-cron.sh <route-name, e.g. expense-automation>}"
app_dir="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
base="${CRON_BASE_URL:-http://127.0.0.1:3000}"
secret="$(grep -E '^CRON_SECRET=' "$app_dir/.env" | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
if [ -z "$secret" ]; then echo "CRON_SECRET is not set in $app_dir/.env" >&2; exit 1; fi
code="$(curl -sS -o /tmp/cron-"$route".out -w '%{http_code}' --max-time 300 -H "Authorization: Bearer $secret" "$base/api/cron/$route")"
echo "$(date -u +%FT%TZ) $route -> HTTP $code $(head -c 300 /tmp/cron-"$route".out)"
[ "$code" = "200" ]
