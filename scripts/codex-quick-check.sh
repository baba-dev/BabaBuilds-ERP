#!/usr/bin/env bash
set -euo pipefail

start_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[codex-quick-check] Started at ${start_ts}"

echo "[codex-quick-check] Running locale consistency checks"
npm run check:locales

echo "[codex-quick-check] Running lint checks"
npm run lint

echo "[codex-quick-check] Running TypeScript type checks"
npm run typecheck

end_ts=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
echo "[codex-quick-check] Completed successfully at ${end_ts}"
