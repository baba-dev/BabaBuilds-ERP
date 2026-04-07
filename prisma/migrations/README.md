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
