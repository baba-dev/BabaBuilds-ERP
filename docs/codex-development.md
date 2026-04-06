# Codex Development Workflow

This repository includes a fast local quality gate for agent and human edits.

## Recommended loop

1. Make a focused change.
2. Run quick checks:

```bash
npm run codex:quick
```

3. Run full validation before pushing:

```bash
npm run validate
```

## Why this exists

- **Less error prone**: locale, lint, and type checks run in a fixed order.
- **More automatable**: one script can be used by local terminals and CI.
- **Faster feedback**: `codex:quick` skips full production build for iteration speed.

## Script overview

- `npm run check:locales` — catches missing or mismatched i18n keys.
- `npm run lint` — static analysis via ESLint.
- `npm run typecheck` — TypeScript compile checks without emit.
- `npm run validate` — full pre-merge validation including Next.js build.
