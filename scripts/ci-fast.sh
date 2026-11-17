#!/usr/bin/env bash
# Local mirror of the CI gate (static + unit tests). Runs every check in parallel, prints a
# one-line result per check, and replays the output of failing checks only — so a human or an
# AI agent gets all failures in one pass with minimal noise.
#
#   npm run ci:fast            # everything
#   CI_FAST_SKIP="lint" npm run ci:fast   # skip checks by name (space separated)
#
# Requires an isolated PostgreSQL 17 CI database and committed migrations.
# Not covered here (CI-only, slower): production build, browser smoke.
set -uo pipefail

cd "$(dirname "$0")/.."
# No SQLite bootstrap. A caller must supply disposable PostgreSQL and migrate it first.
node -e '
 const u=new URL(process.env.DATABASE_URL||"");
 if(u.protocol!=="postgresql:" || !["localhost","127.0.0.1","[::1]"].includes(u.hostname)
  || decodeURIComponent(u.pathname.slice(1))!=="bababuilds_erp_ci")
  process.exit(1);
' || { echo 'ci:fast requires local bababuilds_erp_ci PostgreSQL' >&2; exit 1; }
node scripts/check-runtime.mjs || exit 1
npx --no-install prisma migrate deploy || exit 1
export CI_POSTGRES_FINANCE_TESTS=1

declare -A COMMANDS=(
  [locales]="npm run --silent check:locales"
  [lint]="npm run --silent lint"
  [typecheck]="npm run --silent typecheck"
  [demos]="npm run --silent validate:demos"
  [migrations]="npm run --silent check:migrations"
  [tests]="npm test --silent"
)
ORDER=(locales lint typecheck demos migrations tests)

LOG_DIR="$(mktemp -d)"
trap 'rm -rf "$LOG_DIR"' EXIT

run_check() {
  local name="$1" began=$SECONDS rc=0
  bash -c "${COMMANDS[$name]}" >"$LOG_DIR/$name.log" 2>&1 || rc=$?
  echo "$rc" >"$LOG_DIR/$name.rc"
  echo "$((SECONDS - began))" >"$LOG_DIR/$name.time"
}

declare -a RAN=()
for name in "${ORDER[@]}"; do
  if [[ " ${CI_FAST_SKIP:-} " == *" $name "* ]]; then
    printf '  SKIP  %s\n' "$name"
    continue
  fi
  RAN+=("$name")
  run_check "$name" &
done
wait

failed=0
for name in "${RAN[@]}"; do
  if [[ "$(cat "$LOG_DIR/$name.rc")" == "0" ]]; then
    printf '  PASS  %-10s (%ss)\n' "$name" "$(cat "$LOG_DIR/$name.time")"
  else
    printf '  FAIL  %-10s (%ss)\n' "$name" "$(cat "$LOG_DIR/$name.time")"
    failed=1
  fi
done

if [[ $failed -ne 0 ]]; then
  for name in "${RAN[@]}"; do
    [[ "$(cat "$LOG_DIR/$name.rc")" == "0" ]] && continue
    printf '\n===== %s output (last 60 lines) =====\n' "$name"
    tail -n 60 "$LOG_DIR/$name.log"
  done
  echo
  echo "ci:fast FAILED"
  exit 1
fi

echo
echo "ci:fast passed"
