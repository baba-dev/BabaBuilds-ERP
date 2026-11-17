# ERP Node 26 / Prisma 7 / PostgreSQL 17 / systemd transition

## Verified repository contract (November 17, 2026)
- CI/main: Linux ARM64 build and PostgreSQL 17 migration checks have passed.
- `.nvmrc`: Node 26.13.1; `package.json`: npm 11.20.0.
- Prisma CLI, generated client and `@prisma/adapter-pg` pinned together at 7.10.1.
- `prisma/schema.prisma` and `prisma.config.ts`: PostgreSQL only.
- CI jobs are GitHub-hosted; **they do not run under systemd**, which is specific to persistent VPS services.
- Nightly Playwright regression must provision a disposable PostgreSQL 17 instance.
- Backups are **manual only** in GitHub Actions per the operator's explicit opt-out. This does not imply that PostgreSQL data is protected.

## Incomplete live cutover
The user's direct Node26 deployment compiled and passed exact migration checksum checks,
but aborted after `main` moved during its build. It did **not** switch the live ERP
PM2 process. Node22 is therefore not a proven unused interpreter. **Do not remove it.**

The old `.github/workflows/deploy.yml` still invokes an opt-in PM2/recovery operator
rather than a systemd activation, and is not an operationally completed pipeline.
Do not enable it expecting systemd deployment. Older one-shot bootstrap workflows
should remain retired after the initial provisioning is verified.

## Independent, read-only VPS evidence
The `ERP VPS runtime inventory (read-only)` GitHub workflow uses the already-provisioned
protected SSH path and the pinned `ops/erp-release/audit_vps.py` SHA. It reports:
- The actual running ERP PM2 interpreter and release path
- Whether `bababuilds-erp.service` is active and its PID's actual executable
- Node22 process count and service unit references
- PostgreSQL application table count, sibling service states and free disk

It does **not** print secrets, run migrations, restart services or delete runtimes.
The `safe_to_retire_node22` signal is false unless an active **systemd-managed**
ERP uses the exact Node26 binary, PM2 has no ERP app, Node22 has zero running
processes, and no service unit still references the old interpreter.

## Prepared systemd service
`ops/systemd/bababuilds-erp.service` is a **template only**; it is not automatically
installed or started. It runs the approved immutable runtime from
`/opt/bababuilds-erp/releases/current` under the pinned Node26 binary with the
same two protected env files used by the existing ERP. It binds to port 3000 and
keeps private uploads in their pre-existing persistent directory.

**A live transition must not launch systemd concurrently with PM2 on port 3000.**
Before activation:
1. Confirm the new `main` is green, and its immutable Node26 standalone release
   can start and pass login/session/service-worker health on a *private* loopback port.
2. Check PostgreSQL 17 `_prisma_migrations` checksums equal the candidate's committed
   migrations. Do not run production Prisma migrations as part of runtime cutover.
3. Link `/opt/bababuilds-erp/releases/current` to the exact verified Node26 release
   (without moving user media) and install the reviewed unit.
4. Stop **only** the `erp` PM2 process, save the updated PM2 process list, start
   `bababuilds-erp.service`, verify `/proc/<MainPID>/exe` is the pinned Node26
   executable, and test the public ERP and private auth endpoints.
5. Verify a reboot-safe systemd service and scheduled jobs independently.
6. Re-run the read-only VPS inventory and **only if** the retirement guard passes
   remove `/opt/bababuilds-erp/node22`. Do not delete the original release or PM2
   globally while any other process relies on them.

The operator chose not to create new Restic/PostgreSQL backups or to rehearse
application rollback; that decision increases risk of irrecoverable data loss
during any subsequent schema or data-changing operation.
