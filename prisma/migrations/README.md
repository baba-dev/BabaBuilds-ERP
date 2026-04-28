# Prisma migration strategy

## Live/deployed databases

- Keep this directory strictly **incremental and forward-only**.
- Do **not** append full-schema bootstrap SQL after production migrations.
- `20260407113000_init` is intentionally a no-op to prevent re-creating existing tables in deployed environments.

## Fresh install baseline workflow

When provisioning a brand-new database from scratch, use a separate baseline artifact/history strategy:

1. Apply `prisma/baseline/00000000000000_init_baseline.sql` to the empty database.
2. Mark migrations as applied (without re-running SQL):
   - `prisma migrate resolve --applied 20260407100000_invoice_status_enum`
   - `prisma migrate resolve --applied 20260407113000_init`
3. Run `prisma migrate deploy` for future incremental migrations.

This keeps production history safe while still supporting clean-room installs.

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
