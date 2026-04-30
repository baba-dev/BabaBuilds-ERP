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
