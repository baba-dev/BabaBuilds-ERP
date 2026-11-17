#!/usr/bin/env bash
# Phase 3 operator provisioning: dedicated ERP data Redis at 127.0.0.1:6386.
# Refuses any existing target, does not restart ERP or modify other Redis.
set -Eeuo pipefail
set +x
umask 077
[[ $(id -u) == 0 ]] || { echo 'Must run as root' >&2; exit 2; }
for bin in redis-server redis-cli openssl ss systemctl mktemp; do
  command -v "$bin" >/dev/null || { echo "Missing $bin" >&2; exit 2; }
done
getent passwd redis >/dev/null
getent group redis >/dev/null
ENV=/var/www/bababuilds-erp/.env
CONF=/etc/bababuilds-redis/data-cache
STATE=/var/lib/bababuilds-redis/data-cache
UNIT=/etc/systemd/system/bababuilds-erp-redis-data-cache.service
[[ -f $ENV && ! -L $ENV ]] || { echo 'No protected ERP env' >&2; exit 2; }
[[ $(stat -c '%U:%G:%a' "$ENV") == 'root:root:600' ]] || { echo 'Unexpected env permissions' >&2; exit 2; }
for service in bababuilds-erp.service bababuilds-erp-redis-cache.service bababuilds-erp-redis-queue.service; do
  [[ $(systemctl is-active "$service") == active ]] || { echo "Service not active: $service" >&2; exit 2; }
done
for required in 'ERP_REDIS_ENABLED=true' 'ERP_REDIS_CACHE_ENABLED=false' 'ERP_REDIS_RATE_LIMIT_ENABLED=true'; do
  grep -qx "$required" "$ENV" || { echo "Baseline missing: $required" >&2; exit 2; }
done
for name in ERP_REDIS_DATA_CACHE_URL ERP_REDIS_DASHBOARD_CACHE_ENABLED ERP_REDIS_REPORT_CACHE_ENABLED; do
  ! grep -Eq "^[[:space:]]*$name=" "$ENV" || { echo "Existing $name, aborting" >&2; exit 2; }
done
for path in "$CONF" "$STATE" "$UNIT"; do
  [[ ! -e $path && ! -L $path ]] || { echo "Existing path: $path" >&2; exit 2; }
done
if ss -H -lnt | awk '{print $4}' | grep -Eq '(^|[:.])6386$'; then
  echo 'Port 6386 occupied' >&2; exit 2;
fi

secret=$(openssl rand -hex 32)
install -d -o root -g redis -m 0750 "$CONF"
install -d -o redis -g redis -m 0750 "$STATE"
cat > "$CONF/redis.conf" <<CFG
bind 127.0.0.1
protected-mode yes
port 6386
aclfile $CONF/users.acl
daemonize no
supervised no
logfile ""
dir $STATE
databases 1
maxmemory 256mb
maxmemory-policy allkeys-lru
appendonly no
save ""
CFG
printf 'user default off\nuser erp_data_cache on >%s ~erp:production:v1:cache:* resetchannels +ping +info +select +get +set +del +pttl\n' \
  "$secret" > "$CONF/users.acl"
chown root:redis "$CONF/redis.conf" "$CONF/users.acl"
chmod 0640 "$CONF/redis.conf" "$CONF/users.acl"
cat > "$UNIT" <<SVC
[Unit]
Description=BabaBuilds ERP Data Cache Redis
After=network.target

[Service]
Type=simple
User=redis
Group=redis
ExecStart=/usr/bin/redis-server $CONF/redis.conf
Restart=on-failure
RestartSec=3s
TimeoutStopSec=45s
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
systemctl daemon-reload
systemctl enable --now bababuilds-erp-redis-data-cache.service >/dev/null
ready=no
for _ in $(seq 1 24); do
  if [[ $(systemctl is-active bababuilds-erp-redis-data-cache.service) == active ]] &&
     [[ $(REDISCLI_AUTH="$secret" timeout 4 redis-cli --no-auth-warning --user erp_data_cache \
         -h 127.0.0.1 -p 6386 --raw PING 2>/dev/null || true) == PONG ]]; then
    ready=yes; break
  fi
  sleep 0.25
done
[[ "$ready" == yes ]] || { echo 'Redis did not authenticate; ERP environment untouched' >&2; exit 1; }
cli() {
  REDISCLI_AUTH="$secret" timeout 4 redis-cli --no-auth-warning --user erp_data_cache \
    -h 127.0.0.1 -p 6386 --raw "$@" 2>/dev/null
}
key="erp:production:v1:cache:v3:preflight:$(openssl rand -hex 12)"
[[ $(cli SET "$key" tested PX 30000 NX) == OK ]] || { echo 'SET denied' >&2; exit 1; }
[[ $(cli GET "$key") == tested ]] || { echo 'GET denied' >&2; exit 1; }
[[ $(cli PTTL "$key") =~ ^[0-9]+$ ]] || { echo 'PTTL denied' >&2; exit 1; }
[[ $(cli DEL "$key") == 1 ]] || { echo 'DEL denied' >&2; exit 1; }
foreign=$(cli GET 'menuminute:foreign:key' || true)
[[ $foreign == *NOPERM* ]] || { echo 'Foreign key ACL failed' >&2; exit 1; }

temp=$(mktemp -p "$(dirname "$ENV")" '.env.data-cache.XXXXXXXX')
trap 'rm -f -- "$temp"' EXIT
cat "$ENV" > "$temp"
if [[ $(tail -c 1 "$ENV" | wc -l) -eq 0 ]]; then printf '\n' >> "$temp"; fi
printf '%s\n' \
  "ERP_REDIS_DATA_CACHE_URL=redis://erp_data_cache:$secret@127.0.0.1:6386/0" \
  'ERP_REDIS_DASHBOARD_CACHE_ENABLED=false' \
  'ERP_REDIS_REPORT_CACHE_ENABLED=false' >> "$temp"
chmod 0600 "$temp"
chown root:root "$temp"
mv -f -- "$temp" "$ENV"
trap - EXIT
unset secret
echo 'ERP_REDIS_PHASE3_PROVISIONED cache=6386 flags=OFF'
echo 'ERP web and all other Redis services remain unchanged.'
