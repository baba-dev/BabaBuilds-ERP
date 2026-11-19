# ERP VPS lean cleanup — November 17, 2026

This is a **single reviewed, guarded cleanup**, not a recurring vacuum job.
It does not touch PostgreSQL, customer files, MenuMinute, ClubKeep, shared
Node installations, production environment files or systemd unit definitions.

## Measured before cleanup
The [root-owned read-only inventory run](https://github.com/baba-dev/BabaBuilds-ERP/actions/runs/44046296417)
confirmed:
- ERP Node22 already absent, Node26 v26.13.1 serving systemd, no ERP PM2 app.
- All sibling services healthy; PostgreSQL17 has 185 ERP application tables.
- ERP releases 8.05 GB, including two stale 3.8–3.9 GB releases.
- Retired ERP cutover directories 5.39 GB and stopped staging checkout 3.99 GB.
- Historical /var/www ERP Next.js cache copies 2.88 GB + 2.28 GB.
- Root npm cache 0.91 GB; regenerable Prisma/SWC caches ~0.11 GB.
- Root Playwright browser cache 1.54 GB is **excluded** (runtime impact not reviewed).
- MenuMinute incoming archives 3.03 GB and ClubKeep release store 7.25 GB
  are **excluded**, pending their own deployment-retention checks.

These are disk usage measurements, **not** permissions to wipe everything
under those roots.

## Safety rules
1. Execute only on ARM64 root after the exact Node26 systemd interpreter,
   boot-enabled ERP service, live immutable runtime and PostgreSQL/three
   sibling service states are verified. Reject if old staging is active/enabled.
2. Acquire `/var/lib/bababuilds-erp/deployment/systemd-deploy.lock`
   nonblocking (same lock as the production release manager). GitHub also
   shares `erp-immutable-production` concurrency with systemd deployment.
3. Resolve actual `/opt/bababuilds-erp/releases/current` target.
   Never include the active release. Retain the latest three immutable releases
   **by timestamp** as rollback candidates, plus the active release even if older.
   A sitewide worker-release receipt mismatch blocks destructive cleanup.
   Only prune other directories with strictly validated SHA and timestamp names.
4. Remove **only** exact retired `cut1611b`, `dry1611a`, `cut1611a`
   cutover directories, disabled `20261116a` ERP staging checkout,
   the two named old Next build caches, two root npm caches,
   and the tiny root Prisma/SWC caches. Every target must be a
   root-owned real directory (not a symlink/mountpoint) and have no
   running process cwd/executable/open file underneath it.
5. The cleanup operator itself is verified against an exact reviewed
   Git blob SHA before running on the VPS. It emits JSON `--plan`
   and `--apply --confirm-erp-only` evidence including before/after disk free.
6. No file extensions or wildcards in MenuMinute/ClubKeep, no recursive
   delete at `/var/www/bababuilds-erp`, no PostgreSQL database drop,
   no Node26 or global Node24 deletion, no PM2 service action,
   and no application restart.

## Scope and trade-off

The user explicitly opted out of additional backups and reversal exercises.
Deleting the old Node22 code directories removes historic application
artifacts; it does not modify the live database or customer media. The
currently live release remains available for the next immutable deployment
to use as its application rollback target.

If the cleanup gate fails, the operator stops instead of guessing. For
MenuMinute incoming archives and ClubKeep releases, use those products'
own retention policies after verifying current symlinks and pending jobs;
do not delete their archives based only on this ERP inventory.

## Phase 5 sign-off update (2026-11-19)

The sitewide email, push and scheduled-report worker was activated by a
verified latest-main immutable release at commit
`8f5eab37a52498adccb5e506c83682579d0f4298`.
The activation sign-off authorizes safe ERP-only pruning under this reviewed
operator; it **does not** authorize deletion of PostgreSQL delivery ledger
records, Redis 6387 queues, uncertain provider sends, encryption keys, backups,
service overrides, or sibling application artifacts.

The cleanup gate now requires the recorded Phase 5 worker release SHA to match
the live ERP web release, and retains three recent immutable rollback releases.
It is safe to report zero eligible space if earlier cleanup already reclaimed
obsolete caches and cutover directories. Actual disk savings must come from the
cleanup workflow's structured runtime output, not historical measurements.
