# AGENTS.md

## Cursor Cloud specific instructions

### Overview

BabaBuilds ERP is a full-stack Next.js 16 application (TypeScript, Prisma/SQLite, NextAuth) using the App Router with React Server Components. The package manager is **npm** (`package-lock.json`).

### Cloud agent runtime requirement

- Node.js `22.x`
- npm `10+` (bundled with Node 22)

When running in Cursor Cloud, ensure the environment base image/startup config provides Node/npm before project setup commands are executed.

### Environment setup

A `.env` file is needed at the workspace root. Required variables: `DATABASE_URL` (SQLite file path), `NEXTAUTH_URL` (local dev URL), `NEXTAUTH_SECRET` (any random string). Set `AUTH_GOOGLE_ENABLED=false` and `AUTH_EMAIL_ENABLED=false` to disable external auth providers.

After `npm install`, generate the Prisma client and push the schema:

```
npx prisma generate
npx prisma db push
```

Optionally seed compliance dictionaries: `npx ts-node prisma/seed.ts`

**Note:** `npx prisma migrate dev` fails due to a broken migration (`20260407100000_invoice_status_enum` references `Invoice` before it exists in the shadow database). Use `npx prisma db push` instead for local development.

### Running the app

- `npm run dev` — starts Next.js dev server on port 3000 (Turbopack)
- The app has a demo login system (POST `/api/auth/demo`) that creates ephemeral demo accounts. In dev mode, Turnstile CAPTCHA is bypassed.
- Demo sign-in uses NextAuth `CredentialsProvider` (`provider: "credentials"`, id `demo-login`); high-risk-role MFA rules exempt `@bababuilds.demo` credentials sign-ins in `lib/auth.ts`.

### Standard commands (see `package.json` scripts)

| Command | Purpose |
|---|---|
| `npm run lint` | ESLint + KPI coverage check (pre-existing errors exist) |
| `npm run typecheck` | TypeScript compile check |
| `npm run validate` | Full pre-merge: lint + typecheck + build |
| `npm test` | Vitest test suite |
| `npm run codex:quick` | Fast iteration: locale check + lint + typecheck (no build) |

### Caveats

- ESLint reports ~340 pre-existing errors and ~185 warnings across the codebase. These are not regressions.
- The Prisma migration history is broken; always use `npx prisma db push` for dev schema sync.
- External services (Google OAuth, SMTP, Razorpay, Stripe, ClamAV, Cloudflare Turnstile) are all optional in development.
- The SQLite database file is at `prisma/dev.db` (gitignored).
