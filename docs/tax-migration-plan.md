# Tax Domain Migration Plan

## Context and interim migration policy

The current Prisma migration history is known to be inconsistent in local development (the `20260407100000_invoice_status_enum` chain can fail in shadow DB validation). Until that chain is repaired, use this policy:

1. **Development environments:** apply schema changes with `npx prisma db push`.
2. **CI / review gate:** require generated migration SQL to be committed and reviewed before merge.
3. **Production / shared environments:** only deploy reviewed SQL migrations; do not rely on `db push` in production.

This enables forward progress on tax-domain modeling while controlling migration risk and preserving auditable DDL.

## Delivery model per phase

For each phase below, follow the same implementation workflow:

1. Update `prisma/schema.prisma` with the new models, enums, indexes, and relations.
2. Generate a migration artifact (`npx prisma migrate dev --create-only --name <phase_name>` in CI-compatible context, or equivalent SQL generation workflow).
3. In local/dev where migration history is currently unstable, synchronize with `npx prisma db push`.
4. Open PR with SQL diff + rollback notes + data backfill notes (if any).

---

## Phase 1 — Core dictionaries + workspace setup

### Scope

Create baseline reference models and workspace tax profile foundations:

- `TaxCountry`
- `Jurisdiction`
- `TaxRegime`
- `TaxType`
- `TaxForm`
- `WorkspaceTaxProfile`
- Registration/election entities (recommended split):
  - `WorkspaceTaxRegistration`
  - `WorkspaceTaxElection`

### Migration units

- `2026xxxxxx_phase1_tax_dictionaries`
  - Creates dictionary tables and canonical unique constraints (for example, ISO-like codes, regime keys, form keys).
- `2026xxxxxx_phase1_workspace_tax_profile`
  - Creates workspace profile table, registration/election tables, FK relations to dictionaries, and initial indexes.

### Rollback notes

- **DDL rollback:** safe to drop Phase 1 tables only if no downstream Phase 2+ FKs exist yet.
- **Data rollback:** dictionary rows are seed-like; preserve export snapshot before destructive rollback.
- **App rollback:** guard runtime usage behind feature flags or null-safe reads so app can run if tables are absent.

---

## Phase 2 — Operational tax facts + obligations/returns

### Scope

Create event-level tax facts and compliance lifecycle entities:

- `TaxableEvent`
- `TaxDetermination`
- `TaxObligation`
- `TaxPeriod`
- `TaxReturn`

### Migration units

- `2026xxxxxx_phase2_tax_facts`
  - Adds event and determination tables, links to workspace/profile/jurisdiction/regime records, and immutable audit columns.
- `2026xxxxxx_phase2_tax_obligations_returns`
  - Adds obligation/period/return tables, status enums, period boundaries, filing/payment timestamps, and SLA-related indexes.

### Rollback notes

- **DDL rollback:** drop Phase 2 tables in reverse dependency order (`TaxReturn` -> `TaxPeriod`/`TaxObligation` -> `TaxDetermination` -> `TaxableEvent`).
- **Data rollback:** if events are already ingested, perform logical rollback (status cancellation) instead of hard delete unless mandated.
- **Integrity rollback:** include FK disable/reenable scripts only if strictly required; prefer explicit ordered deletes.

---

## Phase 3 — Advanced domains

### Scope

Extend model coverage for advanced tax flows:

- Withholding tax domain
- Foreign tax credit (FTC) domain
- Presumptive taxation domain
- Import tax/customs domain
- Tax-document linkages (supporting evidence, filing artifacts, notices)

### Migration units

- `2026xxxxxx_phase3_withholding_ftc`
  - Adds withholding/credit entities and cross-links to obligations/returns.
- `2026xxxxxx_phase3_presumptive_imports`
  - Adds presumptive/import entities with jurisdictional parameterization.
- `2026xxxxxx_phase3_tax_document_links`
  - Adds polymorphic or typed document-link tables, checksum metadata, and retention flags.

### Rollback notes

- **Feature rollback first:** disable advanced-domain workflows in app config before DDL rollback.
- **Schema rollback:** remove document links first, then advanced computational tables, preserving core Phase 1–2 integrity.
- **Compliance rollback:** archive exported evidence bundles before any destructive rollback of filing-linked artifacts.

---

## CI policy details (until migration chain cleanup)

### Required PR artifacts

Every PR that changes Prisma schema in this initiative should include:

- Updated `prisma/schema.prisma`
- Generated SQL migration files for the intended phase
- Short “apply in dev” note (`npx prisma db push`)
- Rollback section with:
  - DDL order
  - Data handling strategy
  - Operational fallback (feature-flag or read-only mode)

### Recommended CI checks

1. Verify schema formatting and generation (`npx prisma generate`).
2. Validate migration SQL files are present for schema deltas.
3. Run application type/lint/test checks against a database synchronized via `db push`.
4. Block merge if schema changed but migration SQL review artifacts are missing.

## Exit criteria to retire interim policy

Switch back to normal `migrate dev`-first workflow once:

- Migration chain is repaired and validated end-to-end in shadow DB.
- A clean baseline can be applied from scratch in CI.
- The team signs off that `db push` is no longer needed for local iteration.
