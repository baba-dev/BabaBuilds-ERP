#!/usr/bin/env bash
# One-pass SITEWIDE Phase 5 activation; no migrations or global cron.
# Must run after latest-main reviewed immutable ERP web deployment.
set -Eeuo pipefail
stop() { echo "ERP_PHASE5_SITEWIDE_BLOCKED: $*" >&2; exit 1; }
[[ $EUID == 0 ]] || stop 'root required'
[[ $DEPLOY_SHA =~ ^[a-f0-9]{40}$ ]] || stop 'reviewed DEPLOY_SHA required'
state=/var/lib/bababuilds-erp/deployment/active.sha
marker=/var/lib/bababuilds-erp/phase5/sitewide-activated.sha
runtime=$(readlink -f /opt/bababuilds-erp/releases/current)
[[ -f $state && ! -L $state && $(cat "$state") == "$DEPLOY_SHA" ]] || stop 'immutable ERP web release not yet active'
[[ $runtime =~ ^/opt/bababuilds-erp/releases/sha-$DEPLOY_SHA-[0-9]{8}T[0-9]{6}Z/runtime$ ]] || stop 'unexpected release pointer'
for file in erp-worker.mjs notification-delivery.mjs report-delivery.mjs; do
  [[ -s "$runtime/$file" && ! -L "$runtime/$file" ]] || stop 'worker component missing'
done
if [[ -e $marker ]]; then
  [[ -f $marker && ! -L $marker && $(stat -c '%u:%a' "$marker") == 0:600 ]] ||
    stop 'sitewide activation receipt invalid'
  echo "ERP_PHASE5_SITEWIDE_ALREADY_ACTIVE reviewed_receipt_present"; exit 0
fi

for unit in bababuilds-erp.service bababuilds-erp-worker.service postgresql@17-main.service \
  bababuilds-erp-redis-job.service menuminute-web.service menuminute-worker.service clubkeep-web.service; do
  [[ $(systemctl is-active "$unit" 2>/dev/null) == active ]] || stop "unhealthy service $unit"
done
[[ $(/opt/bababuilds-erp/node26/bin/node -v) == v26.13.1 ]] || stop 'Node26 changed'
# An old PENDING/CLAIMED external send must not be swept just because global scope is enabled.
unresolved=$(runuser -u postgres -- psql -XAt -d bababuilds_erp -c \
  "SELECT count(*) FROM public.\"ErpJobDelivery\" WHERE \"status\" IN ('PENDING','CLAIMED') AND \"channel\" IN ('EMAIL','PUSH','REPORT_EMAIL');" | tr -d '[:space:]')
[[ $unresolved =~ ^[0-9]+$ && $unresolved -eq 0 ]] || stop 'existing unresolved external deliveries need manual review'
for path in /var/www/bababuilds-erp/.env /etc/bababuilds-erp/production-database.env; do
  [[ -f $path && ! -L $path && $(stat -c '%u:%a' "$path") == 0:600 ]] || stop 'protected environment file changed'
done
/opt/bababuilds-erp/node26/bin/node \
  --env-file=/var/www/bababuilds-erp/.env \
  --env-file=/etc/bababuilds-erp/production-database.env \
  -e 'if (process.env.ERP_STAGING_MODE === "1" || !process.env.ERP_REDIS_JOB_URL || !/^[a-fA-F0-9]{64}$/.test(process.env.ENCRYPTION_KEY || "") || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) process.exit(71)' ||
  stop 'job transport, encryption or VAPID keys unavailable'

web=bababuilds-erp.service
worker=bababuilds-erp-worker.service
oldweb=$(systemctl show --value -p MainPID "$web")
oldworker=$(systemctl show --value -p MainPID "$worker")
[[ $oldweb =~ ^[0-9]+$ && $oldweb -gt 0 && $oldworker =~ ^[0-9]+$ && $oldworker -gt 0 ]] || stop 'web/worker PID missing'
flags=$'[Service]\nEnvironment=ERP_REDIS_ENABLED=true\nEnvironment=ERP_REDIS_JOBS_ENABLED=true\nEnvironment=ERP_REDIS_JOB_WORKER_ENABLED=true\nEnvironment=ERP_REDIS_EXTERNAL_DELIVERY_SCOPE=sitewide\nEnvironment=ERP_REDIS_SITEWIDE_DELIVERY_APPROVED=true\nEnvironment=ERP_REDIS_NOTIFICATION_EMAIL_ENABLED=true\nEnvironment=ERP_REDIS_NOTIFICATION_PUSH_ENABLED=true\nEnvironment=ERP_REDIS_REPORT_EMAIL_ENABLED=true\n'
for unit in "$web" "$worker"; do
  dir=/etc/systemd/system/$unit.d
  path=$dir/zz-erp-phase5-sitewide.conf
  [[ ! -e $path && ! -L $path ]] || stop 'sitewide drop-in already exists'
  install -d -o root -g root -m 0755 "$dir"
  tmp=$(mktemp "$path.XXXXXX")
  printf '%s' "$flags" > "$tmp"
  chmod 0644 "$tmp"
  chown root:root "$tmp"
  mv -- "$tmp" "$path"
done
systemctl daemon-reload
for unit in "$web" "$worker"; do
  e=$(systemctl show --value -p Environment "$unit")
  for pair in ERP_REDIS_EXTERNAL_DELIVERY_SCOPE=sitewide ERP_REDIS_SITEWIDE_DELIVERY_APPROVED=true \
    ERP_REDIS_NOTIFICATION_EMAIL_ENABLED=true ERP_REDIS_NOTIFICATION_PUSH_ENABLED=true \
    ERP_REDIS_REPORT_EMAIL_ENABLED=true ERP_REDIS_ENABLED=true ERP_REDIS_JOBS_ENABLED=true; do
    [[ " $e " == *" $pair "* ]] || stop "systemd did not load $pair for $unit"
  done
done
echo "ERP_PHASE5_SITEWIDE_REVIEWED_WEB_AND_WORKER_READY sha=$DEPLOY_SHA"
systemctl restart "$web" || stop 'web restart failed; inspect systemd'
healthy=false
for _ in $(seq 1 25); do
  if [[ $(systemctl is-active "$web" 2>/dev/null) == active &&
    $(curl -sS -o /dev/null -w '%{http_code}' --max-time 3 http://127.0.0.1:3000/api/auth/session 2>/dev/null) == 200 ]]; then
    healthy=true; break
  fi
  sleep 2
done
[[ $healthy == true ]] || stop 'web health after activation failed'
[[ $(systemctl show --value -p MainPID "$web") != "$oldweb" ]] || stop 'web PID did not rotate'
started_at=$(date +%s)
systemctl restart "$worker" || stop 'worker restart failed; manual review required'
ready=false
for _ in $(seq 1 20); do
  pid=$(systemctl show --value -p MainPID "$worker")
  if [[ $pid =~ ^[0-9]+$ && $pid -gt 0 && $pid != "$oldworker" &&
    $(systemctl is-active "$worker" 2>/dev/null) == active ]] &&
    journalctl -u "$worker" --since "@$started_at" --no-pager -o cat 2>/dev/null |
      grep -Fq '[erp-worker] READY'; then
    ready=true; break
  fi
  sleep 1
done
[[ $ready == true ]] || stop 'worker readiness not confirmed; no blind restart'
for unit in "$web" "$worker" menuminute-web.service menuminute-worker.service clubkeep-web.service; do
  [[ $(systemctl is-active "$unit") == active ]] || stop "service changed $unit"
done
install -d -o root -g root -m 0700 "$(dirname "$marker")"
printf '%s\n' "$DEPLOY_SHA" > "$marker.new"
chmod 0600 "$marker.new"
mv -f -- "$marker.new" "$marker"
echo "ERP_PHASE5_SITEWIDE_EXTERNAL_DELIVERY_ENABLED sha=$DEPLOY_SHA worker_pid=$pid"
echo 'ERP_PHASE5_EMAIL_PUSH_REPORT_GLOBAL_SCOPE_ACTIVE'
echo 'NO_MIGRATIONS_NO_GLOBAL_CRON_NO_COHOSTED_RESTARTS'
