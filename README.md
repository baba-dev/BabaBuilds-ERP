# BabaBuilds ERP

![Next.js](https://img.shields.io/badge/Next.js-16.4.5-black?logo=next.js)
![React](https://img.shields.io/badge/React-19.3.1-149eca?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?logo=typescript)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2d3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169e1?logo=postgresql)
![NextAuth](https://img.shields.io/badge/Auth-NextAuth-7c3aed)
![License](https://img.shields.io/badge/License-Private-informational)

BabaBuilds ERP gives service businesses one practical place to run sales, money, operations, and people workflows. Turn a proposal into an invoice, follow up on receivables, reconcile the bank, prepare tax evidence, manage stock, and keep the team moving without stitching together a collection of disconnected tools.

The built-in demo creates a private, short-lived workspace with realistic synthetic data. It is the quickest way to explore the product safely—no customer data or credit card required.

Built with **Next.js App Router + React Server Components + Prisma + PostgreSQL 17 + NextAuth**.

---

## Table of Contents

- [Product Tour (Screenshots)](#product-tour-screenshots)
- [Core Functionalities (Codebase + Schema Mapped)](#core-functionalities-codebase--schema-mapped)
- [Use Cases](#use-cases)
- [Architecture at a Glance](#architecture-at-a-glance)
- [Installation & Local Development](#installation--local-development)
- [Environment Variables](#environment-variables)
- [Auth Configuration Modes](#auth-configuration-modes)
- [Database & Prisma Notes](#database--prisma-notes)
- [Scripts You’ll Actually Use](#scripts-youll-actually-use)
- [Testing & Quality](#testing--quality)
- [Troubleshooting](#troubleshooting)
- [Documentation & Helpful Paths](#documentation--helpful-paths)

---

## Product Tour (Screenshots)

Every product image below comes from the seeded Software Company demo at a 1440×900 desktop viewport. Your browser automatically selects the light or dark version.

### Start with the command center

See the figures that need attention, upcoming work, receivables, cash movement, and recent activity without hunting through reports.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/product-images/screenshots/dark/dashboard.png">
  <img src="docs/product-images/screenshots/light/dashboard.png" alt="BabaBuilds ERP dashboard in the redesigned workspace" width="1440" height="900">
</picture>

### Move from proposal to payment

Create consistent proposals, understand pipeline health, convert approved work into invoices, and keep the original client context attached.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/product-images/screenshots/dark/proposals.png">
  <img src="docs/product-images/screenshots/light/proposals.png" alt="Proposal workspace with lifecycle and value summaries" width="1440" height="900">
</picture>

### Keep operations and finance connected

Inventory, expenses, documents, tax, reporting, and bank reconciliation share one workspace and one access model.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/product-images/screenshots/dark/inventory.png">
  <img src="docs/product-images/screenshots/light/inventory.png" alt="Inventory workspace with stock and purchasing context" width="1440" height="900">
</picture>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/product-images/screenshots/dark/reconciliation.png">
  <img src="docs/product-images/screenshots/light/reconciliation.png" alt="AI-assisted bank reconciliation workspace" width="1440" height="900">
</picture>

Browse the [complete light/dark product image library](docs/product-images/README.md) for the full set of public, workspace, finance, compliance, payroll, and settings screens.

---

## Core Functionalities (Codebase + Schema Mapped)

Based on static inspection of app modules, Prisma enums/models, scripts, and help docs.

### 1) Business setup, authentication, and access control
- NextAuth-based sign-in architecture (email and/or Google providers)
- Guided persona demos with synthetic, automatically expiring workspaces
- Workspace-aware user model and role system
- Role/permission-gated feature access for optional modules

### 2) CRM & customer lifecycle
- Client management (profiles, contact and relationship data)
- Referral tracking and rewards workflow
- Proposal/quote lifecycle with conversion pathways

### 3) Revenue operations
- Service catalog operations (priceable services/products)
- Shop, order, and point-of-sale workflows for sellable items
- Retainer and recurring revenue tracking
- Invoice lifecycle with schema-backed statuses:
  - `PENDING`
  - `PARTIALLY_PAID`
  - `PAID`
- Payment/revenue event tracking via accounting event types

### 4) Expense, tax, and compliance workflows
- Expense recording and categorization
- Tax workflows with readiness, blocker, and filing status concepts
- CA/audit portal workflows for finance/compliance collaboration
- Compliance task tracking via task status states

### 5) Inventory & operations hub
- Inventory management and stock operational flows
- Operational dashboard with primary action surfaces and drill-down views

### 6) AI-assisted finance tooling
- AI reconciliation workflows
- Optional cash-flow forecasting module with:
  - horizon, scenario tags, direction/source/classification enums
  - risk-level tagging and generation provenance metadata

### 7) Reporting & analytics
- Optional Reporting Center module
- Preset-driven, scoped query execution model
- Export workflows (XLSX pathway in dependencies/scripts)
- Audit logging for reporting actions

### 8) Workforce and payroll (optional modules)
- Workforce module patterns for people/process tracking
- Payroll-related optional workflows

### 9) Document and import subsystems (optional modules)
- Document Vault module surface
- Import Manager workflows for structured data intake

### 10) Partner/channel ecosystem
- Distributor, coupon attribution, and commission schema entities
- Margin basis and payout lifecycle handling
- Reseller/coupon audience concepts in schema enums

---

## Use Cases

### For founders / owner-operators
- Replace fragmented tools (spreadsheets + invoicing app + CRM + notes) with one operational system.
- Track cash in/out, invoices, retainers, and taxes from a single dashboard.

### For finance and accounting teams
- Keep clean revenue/expense visibility with audit-friendly activity trails.
- Standardize filing readiness and compliance blockers before deadlines.

### For sales and account teams
- Move from lead/referral to proposal to invoice without switching products.
- Maintain client context while coordinating with service/ops teams.

### For operations and inventory managers
- Run inventory-aware workflows alongside service catalog and order processes.
- Reduce manual handoff friction between shop floor and finance workflows.

### For growing organizations
- Start with core ERP modules, then enable optional modules (cash flow, reporting center, payroll, document vault, etc.) as maturity increases.

---

## Architecture at a Glance

- **Frontend:** Next.js 16 App Router + React 19 + TypeScript
- **Backend:** Next.js server routes / server components
- **Database:** Prisma ORM with PostgreSQL 17 (separate development database)
- **Auth:** NextAuth with provider toggles
- **Styling/UI:** Tailwind + Radix/UI utilities
- **Tests:** Vitest + Playwright smoke coverage

---

## Installation & Local Development

### 1) Clone and install

```bash
git clone <your-repo-url>
cd BabaBuilds-ERP
nvm install && nvm use
npm ci --no-audit --no-fund
```

### 2) Create `.env` at repo root

Required baseline variables:

```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/bababuilds_erp_ci"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-with-a-random-secret"
AI_TOOL_CONFIRMATION_SECRET="replace-with-an-independent-32-byte-random-secret"
AUTH_GOOGLE_ENABLED=false
AUTH_EMAIL_ENABLED=false
```

### 3) Prepare Prisma client and database

```bash
npx prisma generate
npx prisma migrate deploy
```

(Optional) seed compliance dictionaries:

```bash
npx ts-node prisma/seed.ts
```

### 4) Run the app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), choose **Explore a live demo workspace**, select the business profile that best matches your work, and continue into the seeded workspace.

---

## Environment Variables

### Always required once auth is exercised
- `NEXTAUTH_URL`
- `NEXTAUTH_SECRET`
- `AI_TOOL_CONFIRMATION_SECRET` (independent random value, at least 32 characters; signs two-minute AI mutation confirmations)

### Database
- `DATABASE_URL` (PostgreSQL 17 URL for an isolated local database)

### Provider toggles
- `AUTH_EMAIL_ENABLED`
- `AUTH_GOOGLE_ENABLED`

When enabling email or Google auth, set the related provider credentials as documented in [Auth Configuration Modes](#auth-configuration-modes).

---

## Auth Configuration Modes

### Mode A — Email-only auth
Set:
- `AUTH_EMAIL_ENABLED=true`
- `AUTH_GOOGLE_ENABLED=false`

Also configure SMTP/email variables:
- `EMAIL_SERVER_HOST`
- `EMAIL_SERVER_PORT`
- `EMAIL_SERVER_USER`
- `EMAIL_SERVER_PASSWORD`
- `EMAIL_FROM`

### Mode B — Google + Email auth
Set:
- `AUTH_GOOGLE_ENABLED=true`
- `AUTH_EMAIL_ENABLED=true`

Also configure:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- all SMTP/email variables above

Google OAuth callback URI:
- `https://erp.bababuilds.com/api/auth/callback/google`

---

## Database & Prisma Notes

- Development database: a disposable PostgreSQL 17 database; never connect local tooling to production.
- Production/staging schema changes should always flow through migration files and `npx prisma migrate deploy`.
- For clean database bootstrap, use the baseline + `migrate resolve` workflow documented in `prisma/migrations/README.md`.
- Use `npx prisma db push` only for disposable local prototyping databases, never as a production migration pathway.

---

## Scripts You’ll Actually Use

```bash
npm run dev                 # Start local app
npm run lint                # ESLint + KPI coverage check
npm run typecheck           # TypeScript no-emit check
npm run validate            # Lint + typecheck + production build
npm test                    # Vitest suite
npm run test:browser:smoke  # Playwright smoke tests
npm run codex:quick         # Fast local validation loop
```

---

## Testing & Quality

- **Unit/integration tests:** Vitest
- **Browser smoke tests:** Playwright
- **Static quality gates:** ESLint + TypeScript + route/check scripts

Note: Existing lint debt is known in the codebase; treat lint output as “baseline + regressions” during active development.

---

## Troubleshooting

- **Auth fails early:** verify `NEXTAUTH_URL` and `NEXTAUTH_SECRET` are set correctly.
- **Schema mismatch/local DB issues:** confirm that the database is disposable, then run `npx prisma generate && npx prisma migrate deploy`.
- **Demo sign-in loops back to login:** make sure `NEXTAUTH_URL` uses the same hostname you opened in the browser (for example, use `localhost` consistently rather than mixing it with `127.0.0.1`).
- **A paid module is missing in a demo:** create a fresh demo workspace. Demo entitlements are bound to the short-lived workspace and fail closed when its expiry is missing.

---

## Documentation & Helpful Paths

- Main README: `README.md`
- Prisma schema: `prisma/schema.prisma`
- Product image library: `docs/product-images/README.md`
- Help screenshot index: `content/docs/help-screenshot-gallery.md`
- Help Center source: `content/docs/`
- Frontend rollout docs:
  - `docs/frontend/component-adoption-matrix.md`
  - `docs/frontend/visual-qa-checklist.md`

---

If you want, next PR can add:
- clickable architecture diagram,
- persona-specific quick-starts,
- a “module-to-route map” table for faster onboarding of new engineers and coding agents.


### PostgreSQL 17 production

The production ERP uses PostgreSQL 17 exclusively. Prisma migrations live in `prisma/migrations/` and are applied with `npx prisma migrate deploy`. Use a disposable local PostgreSQL database for development; see `docs/postgres-backup-runbook.md` for encrypted backup and recovery expectations. The original data migration and rollback evidence is retained in Git history and encrypted off-host recovery snapshots, not in the live application tree.

### ERP production release automation (opt-in)

The repository targets Node 26.13.1/npm 11.20.0. See [the Stage 2 release and rollback runbook](docs/erp-node26-release-activation.md) for GitHub-hosted ARM64 production artifacts, the existing authenticated SSH transport, verified PostgreSQL/media recovery gates, the root-owned canary/promoter and monitoring. Merge alone does **not** activate the VPS; the retained Node22 cutover release remains the rollback anchor.
