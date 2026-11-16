# AGENTS.md

## Cursor Cloud specific instructions

### Overview

BabaBuilds ERP is a full-stack Next.js 16 application (TypeScript, Prisma/PostgreSQL 17, NextAuth) using the App Router with React Server Components. The package manager is **npm** (`package-lock.json`).

### Cloud agent runtime requirement

- Node.js `26.13.1` (from `.nvmrc`)
- npm `11.20.0` (bundled with Node 26.13.1; enforced in shared CI setup)
- Use `npm ci --no-audit --no-fund` for reproducible installations.

When running in Cursor Cloud, ensure the environment base image/startup config provides Node/npm before project setup commands are executed.

### Environment setup

A `.env` file is needed at the workspace root. Required variables: `DATABASE_URL` (disposable PostgreSQL 17 URL), `NEXTAUTH_URL` (local dev URL), `NEXTAUTH_SECRET` (any random string). Set `AUTH_GOOGLE_ENABLED=false` and `AUTH_EMAIL_ENABLED=false` to disable external auth providers.

After `npm install`, generate the Prisma client and push the schema:

```
npx prisma generate
npx prisma migrate deploy
```

Optionally seed compliance dictionaries: `npx ts-node prisma/seed.ts`

**Note:** `npx prisma migrate dev` does not work (its shadow database is built from the migrations alone, which start from a baseline). Use `npx prisma migrate deploy` for local development. Every `schema.prisma` change also needs a migration: see `prisma/migrations/README.md`; `npm run check:migrations` (part of `ci:fast` and CI) fails if the schema and the migration history disagree.

### Running the app

- `npm run dev` — starts Next.js dev server on port 3000 (Turbopack)
- The app has a demo login system (POST `/api/auth/demo`) that creates ephemeral demo accounts. In dev mode, Turnstile CAPTCHA is bypassed.
- **Agent/automation demo access (dev only):** start the server with `DEMO_AGENT_KEY=<random>` and call `POST /api/auth/demo` with header `x-demo-agent-key: <random>` and body `{"templateKey":"dm_agency"}` (templates: `dm_agency`, `software_company`, `tax_agency`, `contractor_builder`, `freelancer_consultant`). The response has `{email, password}`; sign in via NextAuth credentials provider `demo-login` (`POST /api/auth/callback/demo-login` with `csrfToken`, `email`, `password`). Details: `docs/demo-account-dev-agent-access.md`.
- Demo workspaces are seeded as `PRO` with a demo-bound `subscriptionEndsAt` so every optional module is entitled. Paid entitlements fail closed (`hasFullPaidFeatures`); a template with another status or no end date hides all paid modules.
- Demo sign-in uses NextAuth `CredentialsProvider` (`provider: "credentials"`, id `demo-login`); high-risk-role MFA rules exempt `@bababuilds.demo` credentials sign-ins in `lib/auth.ts`.

### Standard commands (see `package.json` scripts)

| Command | Purpose |
|---|---|
| `npm run ci:fast` | **Run before pushing.** Local mirror of the CI gate: locales, lint, typecheck, demo-template coverage, migration history, full Vitest — in parallel (~50s), prints only failing output |
| `npm run lint` | ESLint (0 errors; warning budget enforced via `--max-warnings`) + KPI coverage check |
| `npm run typecheck` | TypeScript compile check |
| `npm run validate` | Full pre-merge: lint + typecheck + build |
| `npm test` | Full Vitest suite (all tests pass; keep it that way) |
| `npm run validate:demos` | Demo template coverage and entitlement checks |
| `npm run test:browser:smoke` | Playwright smoke tests (starts `next dev`; needs a Chromium build matching the installed Playwright) |
| `npm run codex:quick` | Fast iteration: locale check + lint + typecheck (no build) |

### Caveats

- ESLint reports 0 errors. The only remaining warnings are `react-hooks/set-state-in-effect` (React Compiler debt, issue #590); the `lint` script caps them with `--max-warnings` so the count can only go down — lower that number whenever you fix some. New code must add none: avoid `any` (use `unknown` and narrow; it is an error), prefix intentionally unused names with `_`, don't call `setState` synchronously in an effect body, and don't define components inside components (it is an error).
- The PostgreSQL 17 baseline is the only supported schema. Migration-era SQLite artifacts have been retired from the active source tree.
- External services (Google OAuth, SMTP, Razorpay, Stripe, ClamAV, Cloudflare Turnstile) are all optional in development.
- PostgreSQL development databases must be disposable and isolated; the previous SQLite production file is retired by the guarded VPS operator procedure.

### Scheduled jobs (production VPS cron)

- `GET /api/cron/trial-expiry` — expires `TRIALING` workspaces past `subscriptionEndsAt` (set `Authorization: Bearer $CRON_SECRET`). Example: daily at 06:00 alongside other cron routes.
- Trial signup flow: marketing links hit `GET /signup?...` (sets `signup_intent` cookie for 24h) → `/login` → NextAuth `createUser` provisions `TRIALING` workspace with `planTier` PRO/TEAM from intent.

### Mobile / Android (Google Play) conventions

The Android app is a Trusted Web Activity over the PWA; see `docs/android-play-store.md` for the publishing runbook.

- Inside the dashboard shell use `min-h-app` (never `min-h-screen`/`h-screen`; `tests/mobile` fails on it). Public pages use `min-h-dvh`.
- Floating UI uses `bottom-above-nav`; safe areas use `pb-safe`/`pt-safe`; touch-only sizing uses the `pointer-coarse:` variant.
- Hover-only controls must also be visible on touch (`pointer-coarse:opacity-100`).
- Full-screen composers hide the bottom tab bar: add the route to `FOCUS_ROUTE_PATTERNS` in `components/layout/mobile-nav.tsx`.
- Keep `public/.well-known/assetlinks.json` and `android/twa-manifest.json` in agreement; never commit keystores.

### CI (GitHub Actions)

- `CI` workflow (`.github/workflows/ci.yml`) runs on GitHub-hosted runners as parallel jobs: static checks (locale parity, lint, typecheck, demo coverage), full Vitest, migration history vs schema (`check:migrations`), production build, and the Playwright browser smoke test. The single required check is **`CI gate`**. Pull requests also get an advisory dependency review, and `codeql.yml` runs CodeQL (advisory).
- **Never run pull-request workflows on a self-hosted runner**: the repo is public. ERP deployment uses a GitHub-hosted job and protected SSH access; backup/audit may use separate trusted runners.
- PR #643 restored guarded PostgreSQL-only Node22 SSH deployment; its follow-up rejects Node26 source until approved Stage 2 activation. New Node26 promotion is opt-in after independently verified recovery (#640).
- Development and CI Node are pinned in `.nvmrc` (26.13.1), with npm 11.20.0. Shared setup lives in `.github/actions/`. The existing production Node 22 release remains live until separately approved Stage 2 activation.
- Agent workflow: make the change, run `npm run ci:fast`, fix everything it reports, then push. Add or update tests for behavior you change; mocks of shared modules should spread `importOriginal()` so new exports do not break them.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Production PostgreSQL contract

- SQLite-to-PostgreSQL cutover completed 2026-11-16. Production runs on PostgreSQL 17 under the independently prepared Node 22 standalone release. Do not access or recreate `prisma/dev.db`.
- Use only isolated PostgreSQL 17 instances for local development and CI. Apply committed baseline with `npx prisma migrate deploy`; never regenerate or rewrite the applied baseline.
- The restored Node22 standalone deployment is deliberately fail-closed on Node26 source. New Node26 promotion is gated on fresh backup/restore proof, a safe candidate and rollback. Do not use the former in-place deployment or mutate the protected cutover artifact.
- Encrypt off-host PostgreSQL and media backups, test independent recovery, and never include customer records or credentials in CI logs. The migration history remains available in Git history and encrypted off-host snapshots.

## Node 26 repository compatibility (Stage 1 only)

- Development, CI and candidate build runtime: Node 26.13.1 and npm 11.20.0. Production activation is a separate reviewed operation; do not restart PM2 or change a live interpreter from this PR.
- Run the PostgreSQL 17 financial and migration CI, development browser smoke, and the production standalone smoke using `scripts/ci/standalone-smoke.mjs`. See `docs/node26-compatibility.md`.
- Existing Node 22 cutover references, the isolated legacy systemd staging template and the SQLite retirement guard deliberately describe the protected rollback artifact; do not globally rewrite them before Stage 2.

## Stage 2 ERP Node 26 deployment safeguards

- Release workflow is triggered only by a successful full `main` CI push. GitHub-hosted Linux ARM64 builds an immutable Node26 release; existing SSH secrets transfer the artifact to the ERP VPS. No pull-request execution on the server.
- Autoactivation requires `ERP_AUTODEPLOY_ENABLED=true`, `ERP_RECOVERY_VERIFIED=true`, a reviewed installed root-only operator, current encrypted PG17+media backup/restore evidence, a disposable staging database and validated media map. See `docs/erp-node26-release-activation.md`.
- Promotion saves and can restore **both** the previous PM2 release and its exact Node22 interpreter. It never rewinds PostgreSQL data. Do not alter MenuMinute, ClubKeep, global Node or other PM2 apps.
