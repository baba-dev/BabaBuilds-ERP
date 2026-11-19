#!/usr/bin/env bash
# Emergency sitewide E/P/R cutout. Leaves PostgreSQL delivery ledger untouched.
# One operation only restarts ERP web/worker; graceful worker SIGTERM drain.
set -Eeuo pipefail
stop() { echo "ERP_PHASE5_SITEWIDE_PAUSE_BLOCKED: $*" >&2; exit 1; }
[[ $EUID == 0 ]] || stop 'root required'
web=bababuilds-erp.service
worker=bababuilds-erp-worker.service
for unit in "$web" "$worker"; do
  [[ $(systemctl is-active "$unit" 2>/dev/null) == active ]] || stop "ERP unit $unit inactive"
  path=/etc/systemd/system/$unit.d/zz-erp-phase5-sitewide.conf
  [[ -f $path && ! -L $path && $(stat -c '%u:%a' "$path") == 0:644 ]] ||
    stop "sitewide override missing or not root-owned: $unit"
done
# Pause new producer intents first. Existing accepted/UNCERTAIN rows are NEVER reset.
for unit in "$web" "$worker"; do
  path=/etc/systemd/system/$unit.d/zz-erp-phase5-sitewide.conf
  tmp=$(mktemp "$path.XXXXXX")
  sed \
    -e 's/^Environment=ERP_REDIS_SITEWIDE_DELIVERY_APPROVED=true$/Environment=ERP_REDIS_SITEWIDE_DELIVERY_APPROVED=false/' \
    -e 's/^Environment=ERP_REDIS_NOTIFICATION_EMAIL_ENABLED=true$/Environment=ERP_REDIS_NOTIFICATION_EMAIL_ENABLED=false/' \
    -e 's/^Environment=ERP_REDIS_NOTIFICATION_PUSH_ENABLED=true$/Environment=ERP_REDIS_NOTIFICATION_PUSH_ENABLED=false/' \
    -e 's/^Environment=ERP_REDIS_REPORT_EMAIL_ENABLED=true$/Environment=ERP_REDIS_REPORT_EMAIL_ENABLED=false/' \
    "$path" > "$tmp"
  chmod 0644 "$tmp"
  chown root:root "$tmp"
  mv -f -- "$tmp" "$path"
done
systemctl daemon-reload
systemctl restart "$web" || stop 'ERP web pause restart failed'
systemctl restart "$worker" || stop 'ERP worker pause restart failed'
for unit in "$web" "$worker" menuminute-web.service menuminute-worker.service clubkeep-web.service; do
  [[ $(systemctl is-active "$unit" 2>/dev/null) == active ]] || stop "service unavailable: $unit"
done
echo 'ERP_PHASE5_SITEWIDE_EXTERNAL_DELIVERY_PAUSED'
echo 'ERP_POSTGRES_DELIVERY_LEDGER_PRESERVED_NO_REPLAY_NO_MIGRATIONS'
