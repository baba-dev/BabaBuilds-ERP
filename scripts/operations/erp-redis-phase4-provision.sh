#!/usr/bin/env bash
# Phase 4 MANUAL ONLY: isolated jobs Redis 6387 + disabled ERP worker unit.
# Usage: sudo bash erp-redis-phase4-provision.sh /path/to/reviewed/bababuilds-erp-worker.service
set -Eeuo pipefail
set +x
umask 077
[[ $(id -u) == 0 ]] || { echo 'Root required' >&2; exit 2; }
[[ $# == 1 && -f $1 && ! -L $1 ]] || { echo 'Reviewed worker unit required' >&2; exit 2; }
for bin in redis-server redis-cli openssl ss systemctl mktemp; do command -v "$bin" >/dev/null; done
ENV=/var/www/bababuilds-erp/.env
CONF=/etc/bababuilds-redis/jobs
STATE=/var/lib/bababuilds-redis/jobs
UNIT=/etc/systemd/system/bababuilds-erp-redis-job.service
WORKER_UNIT=/etc/systemd/system/bababuilds-erp-worker.service
[[ -f $ENV && ! -L $ENV && $(stat -c '%U:%G:%a' "$ENV") == root:root:600 ]] || exit 2
for s in bababuilds-erp.service bababuilds-erp-redis-cache.service bababuilds-erp-redis-queue.service bababuilds-erp-redis-data-cache.service; do
  [[ $(systemctl is-active "$s") == active ]] || { echo "Service unavailable: $s" >&2; exit 2; }
done
grep -qx 'ERP_REDIS_ENABLED=true' "$ENV"
grep -qx 'ERP_REDIS_JOBS_ENABLED=false' "$ENV"
for name in ERP_REDIS_JOB_URL ERP_REDIS_JOB_WORKER_ENABLED ERP_REDIS_INAPP_DEADLINE_ENABLED; do
  ! grep -Eq "^$name=" "$ENV" || { echo "Existing $name" >&2; exit 2; }
done
for path in "$CONF" "$STATE" "$UNIT" "$WORKER_UNIT"; do
  [[ ! -e $path && ! -L $path ]] || { echo "Existing path: $path" >&2; exit 2; }
done
if ss -H -lnt | awk '{print $4}' | grep -Eq '(^|[:.])6387$'; then
  echo 'Port 6387 occupied' >&2; exit 2
fi
mem=$(awk '/MemAvailable:/{print $2}' /proc/meminfo)
[[ ${mem:-0} -ge 524288 ]] || { echo 'Less than 512 MiB available; abort provisioning' >&2; exit 2; }
getent passwd redis >/dev/null
getent group redis >/dev/null

secret=$(openssl rand -hex 32)
install -d -o root -g redis -m 0750 "$CONF"
install -d -o redis -g redis -m 0750 "$STATE"
cat > "$CONF/redis.conf" <<CFG
bind 127.0.0.1
protected-mode yes
port 6387
aclfile $CONF/users.acl
daemonize no
supervised no
logfile ""
dir $STATE
databases 1
maxmemory 128mb
maxmemory-policy noeviction
appendonly yes
appendfsync everysec
save ""
CFG
printf 'user default off\nuser erp_jobs on >%s ~erp:production:v1:jobs:* resetchannels +@all -flushall -flushdb -config -shutdown -acl -keys -scan -monitor -module\n' \
  "$secret" > "$CONF/users.acl"
chown root:redis "$CONF/redis.conf" "$CONF/users.acl"
chmod 0640 "$CONF/redis.conf" "$CONF/users.acl"
cat > "$UNIT" <<SVC
[Unit]
Description=BabaBuilds ERP Job Queue Redis (isolated)
After=network.target

[Service]
Type=simple
User=redis
Group=redis
ExecStart=/usr/bin/redis-server $CONF/redis.conf
Restart=on-failure
RestartSec=3s
TimeoutStopSec=60s
KillSignal=SIGTERM
LimitNOFILE=16384
UMask=0077
NoNewPrivileges=yes
PrivateTmp=yes
ProtectHome=yes
ProtectSystem=strict
ReadWritePaths=$STATE

[Install]
WantedBy=multi-user.target
SVC
chmod 0644 "$UNIT"
install -o root -g root -m 0644 "$1" "$WORKER_UNIT"
systemctl daemon-reload
systemctl enable --now bababuilds-erp-redis-job.service >/dev/null
ready=no
for _ in $(seq 1 24); do
  if [[ $(systemctl is-active bababuilds-erp-redis-job.service) == active ]] &&
     [[ $(REDISCLI_AUTH="$secret" timeout 4 redis-cli --no-auth-warning --user erp_jobs -h 127.0.0.1 -p 6387 --raw PING 2>/dev/null || true) == PONG ]]; then
    ready=yes; break
  fi
  sleep 0.25
done
[[ "$ready" == yes ]] || { echo 'Redis not authenticated; ERP env unchanged' >&2; exit 1; }
foreign=$(REDISCLI_AUTH="$secret" timeout 4 redis-cli --no-auth-warning --user erp_jobs -h 127.0.0.1 -p 6387 GET 'menuminute:foreign:key' 2>&1 || true)
[[ $foreign == *NOPERM* ]] || { echo 'Foreign-key ACL failed' >&2; exit 1; }

temp=$(mktemp -p "$(dirname "$ENV")" '.env.erp-jobs.XXXXXXXX')
trap 'rm -f -- "$temp"' EXIT
cat "$ENV" > "$temp"
if [[ $(tail -c 1 "$ENV" | wc -l) -eq 0 ]]; then printf '\n' >> "$temp"; fi
printf '%s\n' \
  "ERP_REDIS_JOB_URL=redis://erp_jobs:$secret@127.0.0.1:6387/0" \
  'ERP_REDIS_JOB_WORKER_ENABLED=false' \
  'ERP_REDIS_INAPP_DEADLINE_ENABLED=false' >> "$temp"
chmod 0600 "$temp"
chown root:root "$temp"
mv -f -- "$temp" "$ENV"
trap - EXIT
unset secret
echo 'ERP_REDIS_PHASE4_PROVISIONED job_pool=6387 worker=OFF pilot=OFF'
echo 'No ERP web/worker restart; no MenuMinute or ClubKeep changes.'
