#!/usr/bin/env bash
# Run only against an isolated, disposable PostgreSQL 17 CI database.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
node -e '
 const url=new URL(process.env.DATABASE_URL||"");
 const name=decodeURIComponent(url.pathname.slice(1));
 if(!["postgres:","postgresql:"].includes(url.protocol) ||
    !["localhost","127.0.0.1","[::1]"].includes(url.hostname) ||
    name!=="bababuilds_erp_ci") {
   console.error("Migration integrity tests require the disposable local bababuilds_erp_ci database");
   process.exit(1);
 }
'
npx --no-install prisma validate
test -s prisma/migrations/20261116000000_postgresql_baseline/migration.sql ||
 { echo 'PostgreSQL baseline SQL missing' >&2; exit 1; }
npx --no-install prisma migrate deploy
npx --no-install prisma migrate status
# Exit 2 on schema drift.
npx --no-install prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma \
  --exit-code
# Repeated deployment must have no pending migrations.
npx --no-install prisma migrate deploy
echo 'PostgreSQL migration baseline and history verified.'
