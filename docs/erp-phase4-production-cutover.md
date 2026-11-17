# Phase 4 production cutover: A–C readiness, then gated D–H

Tracking: #670. Merged baseline PR #669, `2a139144fbd9ed13bf28fa06a133aa1c240e3acf`. Phase 4 background processing is **not** activated by merging its code.

## A: audited source, deployment and live read-only state

Latest main postmerge CI and CodeQL were green on 2026-11-17. The immutable Node26 release workflow builds a candidate after CI; its promotion compares *every* applied Prisma migration checksum to the manifest and refuses to deploy if the new outbox migration is not registered.

On the ERP VPS, run `sudo bash scripts/operations/erp-phase4-audit.sh` from a verified pinned checkout, not an untrusted downloaded script. Output reports active release, non-secret flags, migration state, HTTP codes, port 6387, sibling service health and resource headroom. **Do not infer live state from GitHub CI.**

## B: independent restored PostgreSQL drill (no production writes)

1. Run the preinstalled root-owned ERP backup operator `scripts/backup.sh` with protected `/etc/bababuilds-erp/backup.env` and independently confirm the **encrypted off-host Restic snapshot**. Obtain its concrete snapshot ID, retrieve the actual `.dump` into a protected root-only directory and verify the dump checksum against the recovered archive and snapshot. Mere local `pg_dump` is not an off-host recovery proof.
2. Verify the reviewed source checkout SHA matches the intended main commit and the migration SQL Git blob equals `d2aca4d4ef0eaff8b9286e65826212ed5a6b8868`. Never print or paste credentials.
3. Run `sudo bash scripts/operations/erp-phase4-rehearse.sh /root/secure-restic-restore/erp-YYYYMMDDTHHMMSSZ.dump /root/reviewed-source/prisma/migrations/20261117190000_erp_jobs_outbox/migration.sql`. The script generates a uniquely named `bababuilds_erp_phase4_drill_*` database, restores the off-host dump, applies reviewed DDL **in that disposable database only**, compares Workspace/Invoice/Expense row counts and verifies the outbox table. It drops only its own drill database on exit.
4. This tests actual SQL against restored data but **does not register the Prisma migration**. Before the live migration use the official pinned Prisma CLI with `DATABASE_URL` pointing to `bababuilds_erp`, not `psql -f`. The exact official CLI command must be reviewed separately in step D. Never run a CLI migration command from an unchecked checkout or against sibling databases.

## C: exactly one workspace canary

- `ERP_REDIS_INAPP_DEADLINE_WORKSPACE_IDS` is a *single exact workspace ID*, not `*`, `all`, or a comma-separated group. The worker/master/pilot flags remain independently default OFF.
- If the pilot switch is true but this ID is missing/malformed, queued pilot routing is disabled; other workspaces remain on the legacy notification code path.
- In the authorized workspace, a queued event can only be sent once: after an ambiguous PostgreSQL outbox write error, the cron returns a retriable error instead of blindly falling back to an in-app notification that could duplicate a committed outbox event.
- Never enable the pilot before a verified internal workspace, the new Redis 6387, worker health and migration canary evidence.

## D–H gates remain separate

- D: reviewed production Prisma migration **after independent restore**, then verified checksum and Node26 release health.
- E: capacity and port preflight, independently provision only ERP jobs Redis 6387 with AOF+ACL; never touch Redis 6384–6386, MenuMinute or ClubKeep.
- F: install/activate ERP-only worker after validating immutable runtime, protected config and DB connection budget; pilot stays OFF.
- G: enable the explicitly allowlisted internal workspace, verify one event→DONE→one notice per eligible user and membership/prefs revocation. Do not test external email/push with customer accounts.
- H: 24-hour+ soak, monitor Redis memory, DB connections, retries and sibling app health; record acceptance or rollback. Never flush Redis or delete outbox rows during rollback.
