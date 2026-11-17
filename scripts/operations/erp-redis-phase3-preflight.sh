#!/usr/bin/env bash
# Phase 3 authenticated preflight. No Node application imports or leaked URLs.
set -Eeuo pipefail
set +x
[[ $(id -u) == 0 ]] || { echo 'Run as root' >&2; exit 2; }
command -v redis-cli >/dev/null || exit 2
[[ $(systemctl is-active bababuilds-erp-redis-data-cache.service) == active ]] || {
  echo 'Data cache service is not active' >&2; exit 2;
}
NODE=/opt/bababuilds-erp/node26/bin/node
[[ -x $NODE ]] || { echo 'Node 26 not installed at ERP baseline' >&2; exit 2; }
"$NODE" --env-file=/var/www/bababuilds-erp/.env \
  --env-file=/etc/bababuilds-erp/production-database.env - <<'JS'
'use strict';
const { randomBytes } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const ns = process.env.ERP_REDIS_NAMESPACE;
if (ns !== 'erp:production:v1' || process.env.ERP_REDIS_ENABLED !== 'true') {
  console.error('INVALID_ERP_REDIS_CONFIG'); process.exit(2);
}
let url;
try { url = new URL(process.env.ERP_REDIS_DATA_CACHE_URL || ''); }
catch { console.error('INVALID_DATA_CACHE_URL'); process.exit(2); }
if (url.protocol !== 'redis:' || url.hostname !== '127.0.0.1' ||
    url.port !== '6386' || url.username !== 'erp_data_cache' ||
    !url.password || !['', '/', '/0'].includes(url.pathname) ||
    url.search || url.hash) {
  console.error('INVALID_DATA_CACHE_ENDPOINT'); process.exit(2);
}
const password = decodeURIComponent(url.password);
function redis(...args) {
  const p = spawnSync('redis-cli', [
    '--no-auth-warning', '--raw', '-h', '127.0.0.1', '-p', '6386',
    '--user', 'erp_data_cache', ...args,
  ], {
    env: { PATH: process.env.PATH || '/usr/bin:/bin', REDISCLI_AUTH: password },
    encoding: 'utf8', timeout: 4000, maxBuffer: 16384,
  });
  if (p.error || p.status !== 0) throw new Error('Redis connection failed');
  return (p.stdout || '').trim();
}
const key = ns + ':cache:v3:preflight:' + randomBytes(12).toString('hex');
try {
  if (redis('PING') !== 'PONG') throw Error();
  if (redis('SET', key, 'test', 'PX', '30000', 'NX') !== 'OK') throw Error();
  if (redis('GET', key) !== 'test') throw Error();
  const ttl = Number(redis('PTTL', key));
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > 30000) throw Error();
  if (redis('DEL', key) !== '1') throw Error();
  if (!redis('GET', 'menuminute:foreign:key').includes('NOPERM')) throw Error();
  console.log('ERP_REDIS_PHASE3_PREFLIGHT_PASS cache=6386');
} catch {
  try { redis('DEL', key); } catch {}
  console.error('ERP_REDIS_PHASE3_PREFLIGHT_FAIL'); process.exitCode = 1;
}
JS
