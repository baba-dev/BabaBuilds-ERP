#!/usr/bin/env bash
# Read-only Phase 4 ERP VPS audit. Never prints URLs, credentials, customer rows.
set -Eeuo pipefail
set +x
[[ $(id -u) == 0 ]] || { echo 'RUN_AS_ROOT'; exit 2; }
echo '=== ERP PHASE 4 READ-ONLY AUDIT ==='
current=$(readlink -f /opt/bababuilds-erp/releases/current 2>/dev/null || true)
echo "ACTIVE_RELEASE=${current:-UNRESOLVED}"
[[ "$current" =~ ^/opt/bababuilds-erp/releases/sha-[0-9a-f]{40}-[0-9]{8}T[0-9]{6}Z/runtime$ ]] ||
  { echo 'UNTRUSTED_RELEASE_LAYOUT'; exit 2; }
echo "NODE26_VERSION=$(/opt/bababuilds-erp/node26/bin/node --version)"
bad=0
for svc in bababuilds-erp.service postgresql@17-main.service \
           bababuilds-erp-redis-cache.service bababuilds-erp-redis-queue.service \
           bababuilds-erp-redis-data-cache.service \
           menuminute-web.service menuminute-worker.service clubkeep-web.service; do
  state=$(systemctl is-active "$svc" 2>/dev/null || true)
  echo "SERVICE $svc=${state:-unknown}"
  [[ $state == active ]] || bad=1
done
echo "JOB_REDIS_SERVICE=$(systemctl is-active bababuilds-erp-redis-job.service 2>/dev/null || true)"
echo "JOB_WORKER_SERVICE=$(systemctl is-active bababuilds-erp-worker.service 2>/dev/null || true)"
if ss -H -lnt | awk '{print $4}' | grep -Eq '(^|[:.])6387$'; then
  echo 'JOB_PORT_6387=OCCUPIED'
else
  echo 'JOB_PORT_6387=AVAILABLE'
fi
env_file=/var/www/bababuilds-erp/.env
[[ -f "$env_file" && ! -L "$env_file" &&
  $(stat -c '%U:%G:%a' "$env_file") == root:root:600 ]] ||
  { echo 'ERP_ENV_PERMISSIONS_INVALID'; exit 2; }
echo '=== NON-SECRET FEATURE FLAGS ==='
awk -F= '$1 ~ /^ERP_REDIS_(ENABLED|JOBS_ENABLED|JOB_WORKER_ENABLED|INAPP_DEADLINE_ENABLED|CACHE_ENABLED|DASHBOARD_CACHE_ENABLED|REPORT_CACHE_ENABLED|RATE_LIMIT_ENABLED)$/ {print $1 "=" $2}' "$env_file"
# Workspace IDs (if any) are purposely not echoed.
if grep -q '^ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS=' "$env_file"; then
  echo 'CANARY_ID_SETTING=PRESENT'
else
  echo 'CANARY_ID_SETTING=ABSENT'
fi
echo '=== POSTGRESQL MIGRATION STATE ==='
sql='SELECT COALESCE((SELECT CASE WHEN finished_at IS NOT NULL AND rolled_back_at IS NULL THEN '\''applied'\'' ELSE '\''incomplete'\'' END FROM public."_prisma_migrations" WHERE migration_name = '\''20261117190000_erp_jobs_outbox'\'' ORDER BY started_at DESC LIMIT 1), '\''missing'\'');'
migration=$(runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -d bababuilds_erp -c "$sql")
echo "OUTBOX_MIGRATION=$migration"
exists=$(runuser -u postgres -- psql -X -At -v ON_ERROR_STOP=1 -d bababuilds_erp -c "SELECT to_regclass('public.\"ErpJobOutbox\"') IS NOT NULL;")
echo "OUTBOX_TABLE=$exists"
echo '=== RESOURCE HEADROOM ==='
awk '/^MemAvailable:/{printf "MEM_AVAILABLE_MIB=%d\n", $2/1024}' /proc/meminfo
df -Pk /opt/bababuilds-erp | awk 'NR==2{printf "ERP_RELEASE_FREE_MIB=%d\n", $4/1024}'
for route in login api/auth/session; do
  response=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 8 "http://127.0.0.1:3000/$route" || true)
  echo "ERP_HTTP_$route=$response"
  [[ $response == 200 ]] || bad=1
done
if (( bad == 0 )); then
  echo 'ERP_PHASE4_READ_ONLY_AUDIT_PASS'
else
  echo 'ERP_PHASE4_READ_ONLY_AUDIT_WARN'
  exit 1
fi
