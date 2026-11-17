# ERP CodeQL security remediation — 17 November 2026

## Scope and evidence

Base: `main` at `c85e7ea46e6c6178dde18f0082760ad91c5bdac1` (Node 26.13.1, Next.js 16.4.5, Prisma 7.10.1, PostgreSQL 17). This branch changes neither the lockfile nor schema, migrations, authentication providers, payment calculations, or deployment workflow.

The linked GitHub Code Scanning alert inventory is restricted by the currently available integration (HTTP 401 / security page 404), so **no exact alert IDs or resolved alert counts are claimed here**. The changes below are source-reviewed defense-in-depth fixes, not an attestation that all currently open CodeQL alerts have been addressed.

## Change register

| Commit | Boundary | Preservation / negative tests |
| --- | --- | --- |
| 1 | Private file path components reject empty, dot, and control characters | Valid namespaced paths preserved |
| 2 | Invoice private PDF path bound to invoice workspace | Legacy nested valid paths remain supported |
| 3 | Public invoice PDF fallback confined to `public/invoices` and its tenant | Legacy single-level invoice names remain supported; invalid files return PDF_NOT_FOUND |
| 4 | Web Share Target checks document module and `documents.upload` RBAC before parsing | Authenticated share remains available to permitted users |
| 5 | Staging has bounded file count/bytes and sniff-verified extensions | Valid images/PDFs keep canonical MIME and preview paths |
| 6 | Mail Billing blocks reserved IPv6 CIDRs and localhost aliases | Public DNS and address targets retain support |
| 7 | Auth diagnostics avoid exposing accidentally credential-bearing config values | Credential-free HTTP/HTTPS deployments still work |
| 8 | Source review, CodeQL workflow contract and outstanding verification gate | No deployment or database modification |

## Required before merge

1. Retrieve the complete `state:open` Code Scanning inventory using an authorized maintainer or the GitHub REST Code Scanning Alerts API; record alert number, rule ID, file, line, source/sink trace, severity and dismissal status.
2. Map each genuine finding to a patch and regression test. Do not dismiss or suppress genuine alerts to manufacture a green dashboard. If findings remain outside scope, record them as follow-up issues.
3. Run the current repository's `CI gate` (Vitest, lint, typecheck, PG17 schema/migrations, production build, standalone Node 26 smoke, ARM64 release and browser smoke), plus the `CodeQL` analysis on the final PR head. Confirm no new relevant CodeQL alerts.
4. Review legacy invoice fallback behavior against real records and test the PWA Web Share Target with small images, PDFs, unauthorized users, large files, malicious extension mismatches and cross-workspace access.
5. Merge only after green checks and security-alert review. The main-branch deployment is automatic; draft PR is intentionally non-deploying.

## Invariants

No changes to invoices' financial fields, ledger transactions, database models or customer UI. The Web Share Target aligns its staged upload caps with existing Document Center policy (10 MiB per file upper bound; 50 MiB cumulative per share). Existing private media and legacy public invoices are not deleted or migrated.

## Remaining risk

CodeQL alerts are not available to this integration. This branch must not be treated as a comprehensive resolution of the repository's alert dashboard until the current inventory is compared with new analysis. The Mail Billing DNS check still uses separate DNS resolution and fetch operations; DNS rebinding is not fully eliminated. Pinned-address outbound transport would be a separate, carefully tested architectural change.
