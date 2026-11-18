#!/usr/bin/env bash
# Authenticated non-destructive post-provision probe, never prints credentials.
set -Eeuo pipefail
set +x
[[ $(id -u) == 0 ]] || exit 2
[[ $(systemctl is-active bababuilds-erp-redis-job.service) == active ]] || exit 2
node=/opt/bababuilds-erp/node26/bin/node
"$node" --env-file=/var/www/bababuilds-erp/.env - <<'JS'
const { spawnSync } = require('node:child_process');
const { randomBytes } = require('node:crypto');
let url;
try { url = new URL(process.env.ERP_REDIS_JOB_URL || ''); } catch { process.exit(2); }
if (url.hostname !== '127.0.0.1' || url.port !== '6387' ||
    url.username !== 'erp_jobs' || !url.password) process.exit(2);
function run(...args) {
  return spawnSync('redis-cli', ['--no-auth-warning', '-h', '127.0.0.1',
    '-p', '6387', '--user', 'erp_jobs', '--raw', ...args], {
    env: { PATH: '/usr/bin:/bin', REDISCLI_AUTH: decodeURIComponent(url.password) },
    encoding: 'utf8', timeout: 4000,
  }).stdout.trim();
}
const key = 'erp:production:v1:jobs:preflight:' + randomBytes(8).toString('hex');
if (run('PING') !== 'PONG' ||
    run('SET', key, 'ok', 'PX', '30000') !== 'OK' ||
    run('GET', key) !== 'ok' ||
    run('DEL', key) !== '1' ||
    !run('GET', 'menuminute:foreign:key').includes('NOPERM')) process.exit(2);
console.log('ERP_REDIS_PHASE4_PREFLIGHT_PASS cache=6387');
JS
