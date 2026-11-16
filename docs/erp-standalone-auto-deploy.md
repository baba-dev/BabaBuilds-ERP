# ERP immutable standalone production deploy (postgreSQL 17)

## Why this exists

The SQLite→PostgreSQL 17 cutover left the real ERP on Node 22
`/opt/bababuilds-erp-cutover/cut1611b/app/.next/standalone`, while GitHub's
legacy workflow had been replaced by a no-op. Consequently newer dashboard,
company and document changes merged to `main` never reached production.

This workflow restores **automatic deployment after green main CI**.
It uses the already-provisioned `HOST`, `USERNAME` and `SSH_KEY`
GitHub Actions secrets and an isolated root-owned release operator.

## Workflow

1. GitHub Actions `CI` completes successfully for a **push to main**.
2. The deploy workflow selects the exact validated 40-character commit SHA.
3. Its SSH connection to the ERP VPS bootstraps a reviewed root release
   operator from that exact commit (in the existing protected cutover Git
   checkout), then runs its preflight and deploy.
4. On the VPS, the operator confirms isolated Node22 ARM64, original root PM2,
   sibling services, protected production PostgreSQL env, and sufficient disk.
5. It clones the exact SHA into a new `/opt/bababuilds-erp/releases/sha-*/source`
   folder. **No `git reset --hard` or in-place build occurs in `/var/www`.**
6. It verifies each checked-in Prisma migration file SHA256 matches the
   completed production `_prisma_migrations` row. **No automatic SQL
   migrations, backfills, or database reset** occur.
7. `npm ci`, Prisma client generation, and production Next.js/Serwist build
   happen under isolated Node22 with the existing protected auth and PG envs.
8. Standalone traced files, static assets and media symlinks are assembled in
   the immutable `runtime/` directory; private uploads, generated invoices,
   signatures and share-target metadata remain in the persistent ERP roots.
9. A private loopback HTTP preview on port 3199 must serve `/login` and
   `/sw.js` before the public port is touched.
10. The operator replaces **only** root PM2's `erp` process, then probes
    public loopback port 3000. On failure it restores the old standalone
    runtime and persists its prior PM2 definition.
11. A healthy release is recorded under
    `/var/lib/bababuilds-erp/deployment/active.sha`. Cloudflare's `/sw.js`
    is purged if the existing zone/token secrets are available.

## Preconditions and one-time verification

- The original cutover checkout with `.git` must be preserved at
  `/opt/bababuilds-erp-cutover/cut1611b/app`. It remains the **read-only
  bootstrap source**, not the production code deployment target.
- GitHub Actions `HOST`, `USERNAME`, `SSH_KEY` must allow SSH to the VPS
  and noninteractive `sudo -n` for root-owned release operations.
- Production `.env` and
  `/etc/bababuilds-erp/production-database.env` must be root-owned
  mode 0600. Do not copy or log either file.
- The root PM2 `erp` definition must be the reviewed Node22 standalone
  launch with arguments for both protected `--env-file` paths.
- `/opt/bababuilds-erp/releases` is prepared automatically, but do not
  delete the cutover release, `/var/www/bababuilds-erp/private_uploads`, or
  encrypted Restic recovery snapshots.
- The release operator requires over 12 GiB free before starting a build
  and never auto-prunes production or other application directories.

The first deployment after merging this workflow should be verified in
GitHub Actions → **Deploy ERP to Production**. Successful VPS output is
`ERP_STANDALONE_PRODUCTION_DEPLOYED <sha>`; then confirm your updated
dashboard is present in a real authenticated session, receipts/media render,
and MenuMinute and ClubKeep remain healthy.

## Known limitations and guardrails

- An app release containing pending PostgreSQL schema migrations **will fail
  before PM2 switch**. Complete that database change through a separate
  reviewed migration/backup process first.
- There is a brief restart window on port 3000 during PM2 replacement; write
  requests and payment webhooks may need provider retry/reconciliation.
- Preview is HTTP smoke, not an authenticated browser QA gate. Keep CI's
  integration/browser smoke tests mandatory.
- Do not force old Node20, change the systemwide Node executable, migrate
  Prisma versions in this deployment fix, or touch MenuMinute/ClubKeep.
- The workflow can also be started manually on the default `main` branch
  using `workflow_dispatch` to retry a failed rollout.
- A workflow failure before switching PM2 leaves the running ERP intact. A
  failure after switching automatically attempts rollback; check the logs
  and `pm2 status` before retrying.
- Database migrations are independently backed up and must not be rolled back
  by switching to a historical SQLite database.

Tracking: #640.
