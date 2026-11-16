#!/usr/bin/env bash
# Generate the exact Prisma 6 PostgreSQL DDL into the committed migration.
set -Eeuo pipefail
cd "$(dirname "$0")/.."
grep -q 'provider = "postgresql"' prisma/schema.prisma
directory=prisma/migrations/20261116000000_postgresql_baseline
mkdir -p "$directory"
file="$directory/migration.sql"
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
npx --no-install prisma validate
npx --no-install prisma migrate diff --from-empty \
 --to-schema-datamodel prisma/schema.prisma --script > "$tmp"
# Unexpectedly small or empty baselines must never become approved migrations.
test "$(grep -c '^CREATE TABLE ' "$tmp")" -ge 180
test "$(grep -c '^CREATE TYPE ' "$tmp")" -ge 40
cp "$tmp" "$file"
printf 'PostgreSQL baseline generated: %s bytes\n' "$(wc -c < "$file")"
