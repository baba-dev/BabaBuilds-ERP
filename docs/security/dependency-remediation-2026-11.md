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

## Patched versions in lockfile

- axios: 1.21.1 [node_modules/axios]
- follow-redirects: 1.16.3 [node_modules/follow-redirects]
- js-yaml: 4.3.2 [node_modules/js-yaml]
- @humanfs/node: 0.16.8 [node_modules/@humanfs/node]
- postcss: 8.5.33 [node_modules/postcss]
- nanoid: 3.3.20 [node_modules/nanoid]
- source-map-js: 1.2.2 [node_modules/source-map-js]
- postcss-selector-parser: 6.1.5 [node_modules/@tailwindcss/typography/node_modules/postcss-selector-parser], 7.1.7 [node_modules/postcss-selector-parser]
- zod: 4.6.7 [node_modules/zod]

## Audit snapshots

- Before: {"info":0,"low":2,"moderate":14,"high":14,"critical":0,"total":30}
- After: {"info":0,"low":2,"moderate":14,"high":3,"critical":0,"total":19}

One-shot generator has been removed. No production deployment workflow was changed.
