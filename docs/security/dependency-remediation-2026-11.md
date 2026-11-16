# ERP safe security remediation — 17 November 2026

## Scope

Eight logical commits in one reviewed PR. Apply compatible npm dependency patches without modifying application features, production deploy tooling, PostgreSQL 17 schema, Prisma 6.19.2, Next.js 16.4.5, React 19.3.1 or Node 26.13.1.

## Deferred upgrades

- Prisma 7 CLI/client migration: handled outside this PR (Dependabot #631).
- Serwist / glob major version upgrade: requires independent PWA and Android TWA validation.
- minimatch v10 -> v11: major migration requiring dependency-graph work.
- shadcn / deepmerge: no verified safe deepmerge v4 patch; avoid replacing shadcn or downgrading framework.
- Any additional dependency with forced incompatible API/engine changes.

## Validation

- Reproducible npm ci; lockfile and targeted dependency range assertions.
- npm audit all dependencies and production-only; preserve unresolved advisory visibility.
- CI lint, types, PostgreSQL migrations, full Vitest, Next.js production build, browser smoke and CodeQL.
- Do not run npm audit fix --force; no silent advisory dismissal.

## Deployment

Deployment and runtime activation are explicitly out of scope.
