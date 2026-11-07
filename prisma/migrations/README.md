# Prisma migration strategy

## Why the first two migrations are placeholders

`20260407100000_invoice_status_enum` and `20260407113000_init` are intentionally no-op migrations.

Historically, their SQL depended on existing tables (`Invoice`, etc.), which made clean-room
`prisma migrate deploy` fail on brand-new databases and shadow databases.

To preserve production history without rewriting applied migration IDs, we keep these IDs in place
as placeholders and bootstrap clean databases from a dedicated baseline SQL artifact.

## Canonical clean baseline workflow

For a brand-new database (local, CI, staging bootstrap):

1. Apply baseline schema SQL:
   - `prisma/baseline/00000000000000_init_baseline.sql`
2. Mark placeholder migrations as already applied:
   - `prisma migrate resolve --applied 20260407100000_invoice_status_enum`
   - `prisma migrate resolve --applied 20260407113000_init`
3. Run forward migrations:
   - `prisma migrate deploy`

This yields a deterministic, forward-only history from the first real incremental migration onward.

`npm run check:migrations` runs exactly this flow (in a throwaway copy, so `prisma/dev.db` is never
touched) and fails if the result differs from `prisma/schema.prisma`. CI runs it on every PR.

## Why the baseline ends with extra tables, and what `schema_catch_up` is

Most of the schema (about three quarters: 115 tables) was historically created in real databases with
`prisma db push` and never captured in a migration. Two things closed that gap:

- **Baseline appendix.** Five existing migrations ALTER or copy from tables no migration ever created
  (`BankAccount`, `Product`, `WebAuthnCredential`, `DocumentOcrJob`, `Retainer.currency`). The baseline
  now ends with those tables in the shape each migration expects (final shape minus exactly the
  columns that migration adds). This only affects brand-new databases; existing databases never run the baseline.
- **`20261107100000_schema_catch_up`.** A Prisma-generated migration that brings a baseline-built
  database to exactly `schema.prisma`. Do not edit it; it is checksummed.

## Existing databases (created with `prisma db push`, e.g. production today)

These already have the full schema. **Do not run the migration SQL on them.** Record the history as
applied instead, once:

```bash
for d in $(ls prisma/migrations | grep -E '^[0-9]'); do
  npx prisma migrate resolve --applied "$d"
done
npx prisma migrate status   # "Database schema is up to date!"
```

`schema_catch_up` rebuilds some tables and **drops columns that `schema.prisma` no longer declares**
(`AppActivityLog.message/metadataJson/requestId`, `Retainer.taxRate`, 16 columns of
`TaxDecisionAuditLog`). That is harmless on an empty clean database and destructive on a populated one,
which is why populated databases must adopt it with `migrate resolve --applied`, never `migrate deploy`.

## Changing the schema

`prisma migrate dev` cannot work in this repo: it builds a shadow database from the migrations alone, and
the migrations start from the baseline. To add a migration:

1. Edit `prisma/schema.prisma`.
2. Build a database from the current history (the `check:migrations` flow, or locally: apply the baseline
   to `prisma/dev.db`, resolve the two placeholders, `prisma migrate deploy`).
3. Generate the SQL: `prisma migrate diff --from-url file:<that db> --to-schema-datamodel prisma/schema.prisma --script`.
4. Save it as `prisma/migrations/<UTC timestamp>_<name>/migration.sql` (timestamp after the latest one).
5. `npm run check:migrations` must pass: it fails if the schema and the migrations disagree.

## Validation matrix

Use this matrix when validating migration integrity changes:

- **Blank SQLite DB**: baseline apply -> resolve -> deploy succeeds.
- **Staging-like DB clone/snapshot**: deploy succeeds with no drift.
- **Rollback simulation**: restore from pre-deploy snapshot, rerun deploy, verify idempotent success.

## Product-only shop hardening migration sequence

Apply migration `20260428054000_shop_product_visibility_and_commit_hardening` as part of the product-only shop rollout.

Deployment order:

1. Deploy schema changes adding `Product.showInShop`, `shopSortOrder`, `shopDescription`, `shopImageUrl`, and the composite storefront index.
2. Ensure `ShopOrder` + `ShopOrderItem` tables are present and migration history is up to date.
3. Backfill any legacy references where `ProposalConversion.serviceOrderId` still exists to `shopOrderId` before dropping old columns.
4. Complete enum lineage updates from `SERVICE_ORDER` to `SHOP_ORDER` in conversion/event payloads.
5. Remove deprecated service-order lineage columns/models only after validating row counts and referential integrity in production.

Operator checks after migration:

- Confirm storefront query only returns products with `showInShop = true` and `currentStock > 0`.
- Confirm `ShopOrder` payment commit writes exactly one inventory movement per order/product idempotency key.
- Confirm invoice payment for product lines decrements stock once and does not affect service-only invoices.
