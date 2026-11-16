# ERP PostgreSQL 17 — Phase E operator cutover

**Status: NOT EXECUTED.** Staging proved a 183-table/692-row real-data import,
exact financial and 183/183 fingerprint parity, 68 referenced media assets,
D4 transaction concurrency, and successful HTTP login/auth plus blocked cron/webhooks.
Those results are for a November 16 staging snapshot, not the final live dataset.
Do not merge the stacked PRs #623–#625 or Phase E as a routine live deployment.

## Hard gates — operator must verify

1. Obtain an independent **encrypted off-host SQLite and media backup** and
   actually restore it to separate storage. A local snapshot or a listing of
   archive contents does not prove recoverability.
2. Identify the actual existing PM2 owner/startup command for ERP port 3000,
   Nginx upstream, and all ERP cron/job writers. User-level PM2 is not
   discoverable merely by checking the root shell.
3. Prepare a new **production-mode** Node 22 build; the existing staging
   Next.js output was compiled with staging flags, no Serwist and staging CSP
   and MUST NOT be reused as the public production build.
4. Prepare rollback using the old source checkout, PM2 settings, .env, SQLite
   file, media and Node runtime. Never overwrite the old live SQLite copy.
5. Freeze ALL writes (HTTP, background jobs, outgoing gateway callbacks) before
   the final snapshot. Keeping a maintenance banner up is not a writer freeze.
6. Leave MenuMinute, ClubKeep, their DB roles and Node 24 completely untouched.

## Read-only server inspection

    sudo ss -lntp | grep -E ':3000 |:3101 ' || true
    ps -eo pid,ppid,user,args | grep -E '[p]m2|[n]ext-server'
    sudo systemctl list-units --all 'pm2*' --no-pager
    sudo systemctl list-timers --all --no-pager | grep -Ei 'erp|baba' || true
    sudo crontab -l || true
    sudo -u ubuntu crontab -l || true
    sudo systemctl is-active postgresql@17-main menuminute-web menuminute-worker clubkeep-web
    sudo -u postgres psql -X -Atqc "SELECT datname FROM pg_database WHERE datname='bababuilds_erp';"

Do not print the .env file, database connection URI, payment tokens or secret
values in public logs. Do not proceed until the off-host restore and production
runtime owner / launch method are known.

## 1. Fresh isolated candidate — BEFORE write freeze

A NEW suffix is required; do not reuse successful stage 20261116a.

    CUT=cut1611a
    sudo install -d -o root -g root -m 0700 /var/lib/bababuilds-erp/cutover
    sudo install -d -m 0755 "/opt/bababuilds-erp-cutover/$CUT"
    sudo git clone --depth 1 --branch feature/phase-e-postgresql-production-cutover \
      https://github.com/baba-dev/BabaBuilds-ERP.git \
      "/opt/bababuilds-erp-cutover/$CUT/app"
    sudo python3 -m py_compile \
      "/opt/bababuilds-erp-cutover/$CUT/app/scripts/production/provision_candidate.py" \
      "/opt/bababuilds-erp-cutover/$CUT/app/scripts/production/promote_candidate.py"
    sudo python3 "/opt/bababuilds-erp-cutover/$CUT/app/scripts/production/provision_candidate.py" \
      --suffix "$CUT"

Record the reviewed commit SHA before cloning. The provisioner rejects an
existing production database, candidate, drill or role, and creates ONLY
bababuilds_erp_staging_SUFFIX, bababuilds_erp_drill_SUFFIX, and scoped
migration/runtime roles. Mode-0600 credential files are written under
/var/lib/bababuilds-erp/cutover/SUFFIX/credentials/.
The importer and parity verifier remain *incapable of targeting production*.

## 2. Freeze ERP writes

Announce maintenance and stop the existing ERP PM2 process as the correct
verified Unix owner. Ensure the port 3000 listener is gone, along with all
ERP-specific job writers. Quiesce external webhooks where feasible and retain
provider replay/reconciliation evidence. Keep other apps running.

## 3. Final SQLite snapshot, transactional import, and exact parity

Run from an approved root shell, after ALL writers stop:

    CUT=cut1611a
    APP="/opt/bababuilds-erp-cutover/$CUT/app"
    STATE="/var/lib/bababuilds-erp/cutover/$CUT"
    export PATH="/opt/bababuilds-erp/node22/bin:$PATH"
    python3 "$APP/scripts/staging/snapshot_sqlite.py" \
      --live-sqlite /var/www/bababuilds-erp/prisma/dev.db \
      --output "$STATE/final-sqlite.db"
    set -a
    source "$STATE/credentials/migration.env"
    set +a
    cd "$APP"
    npm ci --no-audit --no-fund
    npx --no-install prisma generate
    npx --no-install prisma migrate deploy
    python3 scripts/sqlite-to-postgres.py \
      --sqlite "$STATE/final-sqlite.db" \
      --target-db "bababuilds_erp_staging_$CUT" --acknowledge-empty-target
    python3 scripts/phase-c-verify.py \
      --sqlite "$STATE/final-sqlite.db" \
      --target-db "bababuilds_erp_staging_$CUT" \
      --evidence "$STATE/full-parity.json"
    python3 scripts/staging/reconcile.py \
      --media-root /var/www/bababuilds-erp \
      --output "$STATE/business-invariants.json"

Stop immediately on mismatch. Do not rerun import into a populated target.

## 4. Independent restore drill and OFF-HOST media/DB restore

    set -a
    source "$STATE/credentials/restore.env"
    set +a
    python3 scripts/phase-c-restore-drill.py \
      --source-db "bababuilds_erp_staging_$CUT" \
      --drill-db "bababuilds_erp_drill_$CUT" \
      --sqlite "$STATE/final-sqlite.db" \
      --evidence "$STATE/restore-parity.json" \
      --acknowledge-empty-drill

Separately back up the FINAL SQLite snapshot plus production media to an
encrypted off-host location, restore both to a disposable location and verify
hashes and representative paths. A PostgreSQL-only drill does not satisfy this
requirement. Build a separately checked, production-mode app release using
Node 22 and the candidate PostgreSQL data. Preserve the original runtime,
media paths and auth secrets; verify the release without external delivery.

Only once the write freeze, actual off-host restore, live/source hash, exact
parity and candidate release are all verified, record these operator assertions:

    sudo install -o root -g root -m 0600 /dev/null "$STATE/write-freeze-confirmed"
    printf '%s\n' WRITE_FREEZE_CONFIRMED | sudo tee "$STATE/write-freeze-confirmed" >/dev/null
    sudo install -o root -g root -m 0600 /dev/null "$STATE/offhost-restore-verified"
    printf '%s\n' OFFHOST_DATABASE_AND_MEDIA_RESTORE_VERIFIED | \
      sudo tee "$STATE/offhost-restore-verified" >/dev/null

Markers are truthful *operator attestations*, not substitutes for recovery tests.
Never create them simply to bypass a failing prerequisite.

## 5. Promote the verified candidate DATABASE NAME

Run only after ensuring production database name bababuilds_erp does not exist,
all writers are stopped and no port-3000 listener exists:

    sudo install -d -m 0750 -o root -g root /etc/bababuilds-erp
    sudo python3 "$APP/scripts/production/promote_candidate.py" \
      --suffix "$CUT" --acknowledge-final-database-rename

The promoter checks that the preserved live SQLite file hash still matches
the FINAL snapshot, no SQLite journal files remain, all accounting/fingerprint
and independent restore evidence PASS, and no other app's DB is touched.
It grants least-privilege runtime DML, protects the Prisma migration ledger,
renames only the candidate to bababuilds_erp, and writes protected
/etc/bababuilds-erp/production-database.env.

The result DATABASE_PROMOTED is **not** proof that the public ERP uses PG.

## 6. Switch application runtime — site-specific mandatory checkpoint

The exact PM2 owner, restart persistence, Nginx upstream and writable media
permissions have NOT been supplied. Therefore no unreviewed generic
pm2 delete/start, git reset --hard or global Node replacement is supplied.
This must be determined from the read-only inspection and tested *before*
changing production. Start the new separately built production release on
127.0.0.1:3000 using private Node 22 and the newly promoted PG URL, with
the original production NEXTAUTH_URL, providers, signing/auth secrets, and
matching media mounts. Do not run two production writers at once.

Verify login, session behavior, customer/workspace RBAC, invoice/payments,
payroll, reports, static assets, documents, webhooks, scheduled jobs and live
PG role connections. Confirm the old SQLite snapshot remains unchanged,
other applications are healthy, and immediate PG custom dump + encrypted
off-host PG/media backup can be restored independently.

Only when LIVE PostgreSQL ERP and backups have been confirmed should
the production deployment workflow gating flag/host marker be enabled.

## Rollback boundary

Before any new PostgreSQL production write, a startup failure can be rolled
back by stopping the new app and restoring the original SQLite-backed PM2
runtime from its immutable release, while preserving the promoted PG DB
for investigation. After the first accepted PostgreSQL production write,
automatically returning to SQLite would DROP accepted transactions:
keep maintenance active and forward-recover/reconcile the PG data instead.
Never silently flip back.

## Tracking

The user-approved real-data staging is complete. The final, fresh production
snapshot, provider continuity, off-host restore and port-3000 application
switch remain mandatory real-host operations. Update the migration tracking
issue with the actual outcome; do not close it based on staging results.
