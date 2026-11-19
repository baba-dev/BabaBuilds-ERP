#!/usr/bin/env bash
# Keep ERP worker matching future immutable web releases.
# Does not touch PostgreSQL data, trigger sends or restart other services.
set -Eeuo pipefail
stop() { echo "ERP_PHASE5_WORKER_SYNC_BLOCKED: $*" >&2; exit 1; }
[[ $EUID == 0 ]] || stop 'root required'
[[ $DEPLOY_SHA =~ ^[a-f0-9]{40}$ ]] || stop 'reviewed DEPLOY_SHA missing'
state=/var/lib/bababuilds-erp/deployment/active.sha
marker=/var/lib/bababuilds-erp/phase5/sitewide-activated.sha
runtime=$(readlink -f -- /opt/bababuilds-erp/releases/current)
[[ -f $state && ! -L $state && $(cat "$state") == "$DEPLOY_SHA" ]] ||
  stop 'active ERP production release SHA differs'
[[ $runtime =~ ^/opt/bababuilds-erp/releases/sha-$DEPLOY_SHA-[0-9]{8}T[0-9]{6}Z/runtime$ ]] ||
  stop 'current ERP runtime is not the expected release'
for file in erp-worker.mjs notification-delivery.mjs report-delivery.mjs; do
  [[ -s $runtime/$file && ! -L $runtime/$file ]] || stop 'required worker module missing'
done
[[ -f $marker && ! -L $marker && $(stat -c '%u:%a' "$marker") == 0:600 ]] ||
  stop 'reviewed sitewide activation receipt missing'
old_sha=$(cat "$marker")
[[ $old_sha =~ ^[a-f0-9]{40}$ ]] || stop 'invalid previous receipt SHA'

web=bababuilds-erp.service
worker=bababuilds-erp-worker.service
for unit in "$web" "$worker" postgresql@17-main.service \
  bababuilds-erp-redis-job.service menuminute-web.service \
  menuminute-worker.service clubkeep-web.service; do
  [[ $(systemctl is-active "$unit" 2>/dev/null) == active ]] ||
    stop "required service unhealthy: $unit"
done
for unit in "$web" "$worker"; do
  conf="/etc/systemd/system/$unit.d/zz-erp-phase5-sitewide.conf"
  [[ -f $conf && ! -L $conf && $(stat -c '%u:%a' "$conf") == 0:644 ]] ||
    stop "sitewide override invalid: $unit"
  for line in ERP_REDIS_ENABLED=true ERP_REDIS_JOBS_ENABLED=true \
    ERP_REDIS_JOB_WORKER_ENABLED=true ERP_REDIS_EXTERNAL_DELIVERY_SCOPE=sitewide \
    ERP_REDIS_SITEWIDE_DELIVERY_APPROVED=true \
    ERP_REDIS_NOTIFICATION_EMAIL_ENABLED=true \
    ERP_REDIS_NOTIFICATION_PUSH_ENABLED=true ERP_REDIS_REPORT_EMAIL_ENABLED=true; do
    grep -Fxq -- "Environment=$line" "$conf" ||
      stop "sitewide approval missing for $unit ($line)"
  done
done
if [[ $old_sha == "$DEPLOY_SHA" ]]; then
  echo "ERP_PHASE5_WORKER_SYNC_ALREADY_MATCHED sha=$DEPLOY_SHA"
  exit 0
fi
# A CLAIMED delivery might have performed provider IO: don't interrupt it.
claimed=$(runuser -u postgres -- psql -XAt -d bababuilds_erp -c \
  "SELECT count(*) FROM public.\"ErpJobDelivery\" WHERE \"status\" = 'CLAIMED' AND \"channel\" IN ('EMAIL','PUSH','REPORT_EMAIL');" |
  tr -d '[:space:]')
[[ $claimed =~ ^[0-9]+$ && $claimed -eq 0 ]] ||
  stop 'in-flight external CLAIMED deliveries must finish before handoff'

old_pid=$(systemctl show --value -p MainPID "$worker")
[[ $old_pid =~ ^[0-9]+$ && $old_pid -gt 0 ]] || stop 'worker PID missing'
started_at=$(date +%s)
systemctl restart "$worker" || stop 'ERP worker-only restart failed'
ready=false
for _ in $(seq 1 25); do
  new_pid=$(systemctl show --value -p MainPID "$worker")
  if [[ $new_pid =~ ^[0-9]+$ && $new_pid -gt 0 && $new_pid != "$old_pid" &&
      $(systemctl is-active "$worker" 2>/dev/null) == active ]] &&
    journalctl -u "$worker" --since "@$started_at" --no-pager -o cat 2>/dev/null |
      grep -Fq '[erp-worker] READY'; then
    ready=true; break
  fi
  sleep 1
done
[[ $ready == true ]] || stop 'matching worker readiness not confirmed'
printf '%s\n' "$DEPLOY_SHA" > "$marker.new"
chmod 0600 "$marker.new"
chown root:root "$marker.new"
mv -f -- "$marker.new" "$marker"
for unit in "$web" "$worker" menuminute-web.service \
  menuminute-worker.service clubkeep-web.service; do
  [[ $(systemctl is-active "$unit" 2>/dev/null) == active ]] ||
    stop "service changed after handoff: $unit"
done
echo "ERP_PHASE5_WORKER_SYNC_PASS sha=$DEPLOY_SHA previous=$old_sha worker_pid=$new_pid"
echo 'NO_MIGRATIONS_NO_DIRECT_SENDS_NO_WEB_OR_COHOSTED_RESTARTS'
