#!/usr/bin/env bash
# Verifies the Prisma migration history against prisma/schema.prisma, in an isolated temp copy
# (schema.prisma hardcodes `file:./dev.db`, so this rewrites the URL in the COPY and never touches
# prisma/dev.db). Needs no sqlite3 CLI.
#
#   npm run check:migrations
#
# Path 1 - clean database (local / CI / staging bootstrap), per prisma/migrations/README.md:
#   baseline SQL -> `migrate resolve` the two placeholder migrations -> `migrate deploy`
#   -> `migrate status` is up to date -> NO drift against schema.prisma.
# Path 2 - database created by `prisma db push` (how production is deployed today), adopted by
#   recording every migration as applied -> `migrate status` up to date, `migrate deploy` no-op.
#
# If path 1 reports drift, schema.prisma changed without a migration. Generate one with:
#   prisma migrate diff --from-url file:<db built by path 1> --to-schema-datamodel prisma/schema.prisma --script
set -euo pipefail

cd "$(dirname "$0")/.."

PLACEHOLDERS=(20260407100000_invoice_status_enum 20260407113000_init)

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
LOG="$TMP/last.log"

fail() {
  echo "FAIL  $1" >&2
  echo "----- last command output -----" >&2
  cat "$LOG" >&2
  exit 1
}

# run <description> <command...>: quiet on success, full output on failure
run() {
  local what="$1"
  shift
  "$@" >"$LOG" 2>&1 || fail "$what"
}

prepare() {
  rm -rf "$TMP/prisma"
  mkdir -p "$TMP/prisma"
  cp -r prisma/migrations prisma/baseline "$TMP/prisma/"
  # Same schema, but pointed at a throwaway database file inside the temp copy.
  sed 's#file:./dev.db#file:./check.db#' prisma/schema.prisma >"$TMP/prisma/schema.prisma"
  grep -q 'file:./check.db' "$TMP/prisma/schema.prisma" || fail "could not rewrite datasource url in schema copy"
}

prisma_cmd() { npx --no-install prisma "$@" --schema "$TMP/prisma/schema.prisma"; }

assert_no_drift() {
  run "schema drift check ($1)" \
    npx --no-install prisma migrate diff \
      --from-url "file:$TMP/prisma/check.db" \
      --to-schema-datamodel "$TMP/prisma/schema.prisma" \
      --exit-code
}

assert_up_to_date() {
  run "migrate status ($1)" prisma_cmd migrate status
  grep -q "Database schema is up to date" "$LOG" || fail "migrate status ($1): not up to date"
}

echo "== Path 1: clean database (baseline -> deploy)"
prepare
run "apply baseline" prisma_cmd db execute --file "$TMP/prisma/baseline/00000000000000_init_baseline.sql"
for m in "${PLACEHOLDERS[@]}"; do
  run "resolve placeholder $m" prisma_cmd migrate resolve --applied "$m"
done
run "migrate deploy" prisma_cmd migrate deploy
assert_up_to_date "clean"
assert_no_drift "clean"
echo "  PASS  every migration applies; database matches schema.prisma"

echo "== Path 2: database created by db push, adopted via migrate resolve"
prepare
run "db push" prisma_cmd db push --skip-generate
count=0
for dir in prisma/migrations/*/; do
  name="$(basename "$dir")"
  [[ "$name" =~ ^[0-9] ]] || continue
  run "resolve $name" prisma_cmd migrate resolve --applied "$name"
  count=$((count + 1))
done
assert_up_to_date "adopted"
run "migrate deploy (must be a no-op)" prisma_cmd migrate deploy
grep -q "No pending migrations" "$LOG" || fail "migrate deploy on an adopted database was not a no-op"
echo "  PASS  $count migrations adopted without executing SQL; deploy is a no-op"

echo "check:migrations passed"
