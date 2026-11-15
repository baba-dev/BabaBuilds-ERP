#!/usr/bin/env bash
# Controlled PostgreSQL production deploy. Source tree never approves its own cutover.
set -Eeuo pipefail
test -f /etc/bababuilds-erp/postgres-cutover-approved ||
 { echo 'No on-host PostgreSQL cutover approval' >&2; exit 1; }
: "${DATABASE_URL:?DATABASE_URL required}"
node -e 'const u = new URL(process.env.DATABASE_URL);
if(!["postgres:","postgresql:"].includes(u.protocol) ||
 decodeURIComponent(u.pathname.slice(1))!=="bababuilds_erp")process.exit(1);'
npm ci --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
npm run build
test -s public/sw.js
pm2 restart erp
