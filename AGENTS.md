# AGENTS.md

## Cursor Cloud specific instructions

### Overview

BabaBuilds ERP is a full-stack Next.js 16 application (TypeScript, Prisma/PostgreSQL 17, NextAuth) using the App Router with React Server Components. The package manager is **npm** (`package-lock.json`).

### Cloud agent runtime requirement

- Node.js `22.x`
- npm `10+` (bundled with Node 22)

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
- The new PostgreSQL baseline is entirely independent. Old SQLite migrations are archived under prisma/sqlite-history; do not replay them against PostgreSQL.
- External services (Google OAuth, SMTP, Razorpay, Stripe, ClamAV, Cloudflare Turnstile) are all optional in development.
- PostgreSQL development databases must be disposable and isolated; the pre-cutover SQLite production file remains at `/var/www/bababuilds-erp/prisma/dev.db` until live verification.

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
- **Never run pull-request workflows on the self-hosted runner**: the repo is public, so that would run strangers' code on our server. Self-hosted (`[self-hosted, linux, x64, erp-ci]`) is only for `deploy.yml`, `backup.yml` and `security-audit.yml`, which run on a schedule, by hand, or after CI succeeds on `main`.
- Deploy runs only after `CI` succeeds on a push to `main`, and deploys the exact validated commit.
- Node is pinned in `.nvmrc` (22). Shared setup lives in `.github/actions/`.
- Agent workflow: make the change, run `npm run ci:fast`, fix everything it reports, then push. Add or update tests for behavior you change; mocks of shared modules should spread `importOriginal()` so new exports do not break them.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Phase B PostgreSQL readiness (NOT production cutover)
- PostgreSQL 17 / Prisma 6 is the new target. Do not run the old SQLite migrations or use db push.
- Migrations require an isolated database, with CI target bababuilds_erp_ci.
- Importer: scripts/sqlite-to-postgres.py; use only against empty, independently provisioned databases.
- Production auto-deploy is gated by ERP_POSTGRES_CUTOVER_APPROVED and on-host marker. Do not merge before Phase C approval.
- Protected backup runner and verified restore are prerequisites. See docs/postgres-backup-runbook.md.
