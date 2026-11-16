# ERP Node 26.13.1 — repository compatibility (Stage 1)

**Scope:** Source code, dependency lockfile, CI, disposable PostgreSQL test environments and production-mode standalone smoke. **No production activation.**

The existing PostgreSQL 17 + Node 22 production release is intentionally left untouched. The old Node 22 interpreter, root PM2 startup definition, rollback artifact, media mounts and SQLite-retirement operator guards must be preserved. Deployment remains a no-op until issue #640 is independently completed and a Stage 2 change is authorized.

## Exact runtime

- Node: `26.13.1` from `.nvmrc`
- npm: `11.20.0` bundled with Node 26.13.1, verified by the shared GitHub Actions setup
- TypeScript Node typings: `@types/node@26.6.6`
- Next.js `16.4.5`, React `19.3.1`, Prisma `6.19.2` retained
- Database: **isolated, disposable PostgreSQL 17**; no SQLite, no production DB

The lockfile changes only the root runtime engine requirements, `@types/node` and its `undici-types` dependency. Do not run `npm audit fix` or mass-update dependencies as part of this upgrade.

## Clean verification

On an isolated Linux build environment with PostgreSQL 17 running, create database `bababuilds_erp_ci` and configure:

```bash
export DATABASE_URL='postgresql://postgres:postgres@127.0.0.1:5432/bababuilds_erp_ci'
export NEXTAUTH_URL='http://127.0.0.1:3000'
export NEXTAUTH_SECRET='test-only-a-random-string-32-characters'
export AUTH_GOOGLE_ENABLED=false AUTH_EMAIL_ENABLED=false
nvm install
nvm use
node --version && npm --version
npm ci --no-audit --no-fund
npx prisma generate
npx prisma migrate deploy
npm run ci:fast
npm run build
node scripts/ci/standalone-smoke.mjs
npm run test:browser:install
npm run test:browser:smoke
```

`ci:fast` validates that `DATABASE_URL` targets local `bababuilds_erp_ci` and includes financial tests and migration integrity. GitHub Actions also runs the full CI suite, PostgreSQL schema-only checks, production build, browser smoke, and standalone smoke. The browser suite uses `next dev`, intentionally retained as a separate development-mode check.

## Standalone smoke

`scripts/ci/standalone-smoke.mjs` verifies native Sharp processing, PDF generation/parsing, Prisma SQL and transactions, then creates an isolated temporary copy of the packaged `.next/standalone` with `public/` and `.next/static/`. It boots the real `server.js` under the exact Node interpreter and exercises public HTML, JS/CSS assets, image optimization, built service worker caching headers, anonymous NextAuth session and invalid import rejection. Only a disposable local CI PostgreSQL database is permitted; the temporary release and process are deleted after tests.

Provider-specific workflows (OAuth/passkeys, outbound SMTP, Razorpay/Stripe signatures, financial idempotency, protected uploads) remain covered by existing unit/integration tests and require later non-production preflight with controlled test credentials before Stage 2 promotion. This smoke is not a substitute for live provider testing.

## Dependency gates

On the **target production OS and CPU architecture** (Linux ARM64 on the existing VPS), build a fresh native artifact, validate Prisma client/engine loading and PostgreSQL transactions, Sharp, Next SWC, pdf-parse/canvas loading, `tsx` scripts, and Node HTTPS/TLS. Never promote an x64 runner artifact to ARM64; do not rebuild the Node 22 rollback artifact.

If a dependency fails under Node 26, create a narrowly scoped follow-up with documented incompatibility; do not bundle a Prisma major upgrade. No schema change is expected from the runtime upgrade.

## Stage 2 (separate manual gate)

1. Inventory actual live PM2 interpreter, root PM2 state, release SHA, writable media paths and scheduled jobs.
2. Verify encrypted off-host PostgreSQL + media backup and independently restored snapshot.
3. Install Node 26 alongside Node 22 and prepare immutable, architecture-correct candidate on isolated port and DB with external side effects disabled.
4. Rehearse rollback **artifact + interpreter together**.
5. Explicitly approve promotion, verify running PID interpreter and watch auth, uploads, payments, cron, errors, restart counts, memory and latency.
6. Retain PostgreSQL data on rollback; reconcile any external writes instead of restoring an old database snapshot.

See tracking issue #640. The current `deploy.yml` and `deploy.sh` remain blocked deliberately, and this PR must not re-enable them.
