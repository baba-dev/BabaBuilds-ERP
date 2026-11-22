# Runbook: apply the invoice-designs migrations, then deploy

Audience: the ERP VPS operator. Written 2026-11-21 for PR #686 (invoice designs, TDS, UPI QR) and everything on `main` after it.

## 1. Why this is needed

The release workflow ([run 823](https://github.com/baba-dev/BabaBuilds-ERP/actions/runs/44906389981)) built and copied the release, then the root-owned promoter refused to activate it:

```
BLOCKED: PostgreSQL applied migration history differs from release; no DB changes made
```

That is the intended guard. `ops/erp-release/systemd_promote.py` (`check_db`) requires the production `_prisma_migrations` ledger to equal the release manifest **exactly** (names and checksums), and by design the pipeline never runs a production migration (`docs/erp-node26-release-activation.md`).

State today (verified from the repo and run logs, not from the VPS):

| | |
|---|---|
| Production release | `sha-d34520ec…` (still serving; nothing changed) |
| Migrations in production (expected) | the first 8, up to `20261121120000_email_hosting_accrual_billing` |
| Migrations missing | the 3 below (all from PR #686) |
| Newer migrations on `main` since | none (the Android PR #685 adds no migration) |

| Migration | What it does | `git hash-object` (reviewed blob) | sha256 (Prisma checksum) |
|---|---|---|---|
| `20261121130000_invoice_accent_colors` | 3 nullable `TEXT` columns (`BusinessProfile`, `Client`, `Invoice`) | `8ce212e94bed8195597f150989f5c594367523ff` | `dc7790a5bf7c563056ec46d57e8518d4e84bb557a063727c3ab3b852092a982c` |
| `20261121140000_invoice_tds` | 5 nullable columns (`Client` ×2, `Invoice` ×3) | `8159cd904cb8d713fa159c16fe37e298ed4963d0` | `c2bc1af2dacb36a903e3e53e992e8be0f1e6a93b7fe2ebccd79ee28216db14d7` |
| `20261121150000_upi_payment_qr` | 2 nullable columns on `BusinessProfile`; new table `PaymentQrImage` (FK to `Workspace`, cascade) + index | `6cda39a550b39ca672a7dd287f094e4fc6a9ef54` | `6c9136f70dc1996a98b22727c1f22e4272af6dc93bbf8bd9166a8149b3ceab17` |

All three are **additive**: no column is dropped, renamed or rewritten, no data is touched, and the currently running release ignores the new columns. That is why migrating first, then deploying, is safe and needs no downtime.

Order of operations: **A backup → B restore drill → C apply migrations → D verify ledger → E deploy → F verify → (G rollback if needed)**.

Run everything as root on the VPS unless noted. Never paste or print credentials; the commands below avoid echoing secrets.

## A. Backup with off-host proof

The repo's own gate (Phase 4 doc) requires an encrypted **off-host** snapshot, not just a local dump.

```bash
sudo bash /var/www/bababuilds-erp/scripts/backup.sh
```

Then confirm the snapshot and retrieve the dump so the drill can use it (use the snapshot ID the script's restic tag reports; the tag is `erp-<UTC stamp>`):

```bash
set -a; . /etc/bababuilds-erp/backup.env; set +a
restic snapshots --tag erp-database --latest 1
install -d -m 700 /root/secure-restic-restore
restic restore latest --tag erp-database --target /root/secure-restic-restore --include '*.dump'
DUMP=$(ls -t /root/secure-restic-restore/var/lib/bababuilds-erp/backups/erp-*.dump | head -1)
chmod 600 "$DUMP"; chown root:root "$DUMP"
/usr/lib/postgresql/17/bin/pg_restore -l "$DUMP" > /dev/null && echo DUMP_READABLE
```

Stop here if the snapshot is missing or the dump is unreadable.

## B. Restore drill: apply the SQL to a disposable copy

`scripts/operations/erp-phase4-rehearse.sh` is hard-wired to the outbox migration's blob hash, so it cannot run these files. The same drill, done by hand and touching only a generated throwaway database:

```bash
set -euo pipefail
DRILL="bababuilds_erp_invoice_drill_$(date -u +%m%d%H%M%S)_$(openssl rand -hex 3)"
cleanup() { runuser -u postgres -- /usr/lib/postgresql/17/bin/dropdb --if-exists "$DRILL" && echo DRILL_DB_REMOVED; }
trap cleanup EXIT

# free space check, as the repo's script does (6 GiB)
[ "$(df -Pk /var/lib/postgresql | awk 'NR==2{print $4}')" -gt 6291456 ] || { echo NOT_ENOUGH_SPACE; exit 1; }

runuser -u postgres -- createdb "$DRILL"
runuser -u postgres -- /usr/lib/postgresql/17/bin/pg_restore --no-owner --no-acl -d "$DRILL" "$DUMP"

SRC=/root/reviewed-source   # exact checkout of the SHA you will deploy (see C1)
for m in 20261121130000_invoice_accent_colors 20261121140000_invoice_tds 20261121150000_upi_payment_qr; do
  runuser -u postgres -- psql -X -v ON_ERROR_STOP=1 --single-transaction -d "$DRILL" -f "$SRC/prisma/migrations/$m/migration.sql"
done

# the new objects exist
runuser -u postgres -- psql -X -At -d "$DRILL" -c "
  SELECT table_name||'.'||column_name FROM information_schema.columns
  WHERE (table_name,column_name) IN
   (('BusinessProfile','invoiceAccentColor'),('Client','invoiceAccentColor'),('Invoice','accentColor'),
    ('Client','tdsSection'),('Client','tdsRatePercent'),('Invoice','tdsSection'),('Invoice','tdsRatePercent'),
    ('Invoice','tdsAmount'),('BusinessProfile','upiVpa'),('BusinessProfile','upiPayeeName'))
  ORDER BY 1;
  SELECT 'PaymentQrImage rows: '||count(*) FROM \"PaymentQrImage\";"
# existing data untouched: compare with production counts (read-only)
for q in 'SELECT count(*) FROM "Workspace"' 'SELECT count(*) FROM "Invoice"' 'SELECT count(*) FROM "Client"'; do
  echo "drill:      $(runuser -u postgres -- psql -X -At -d "$DRILL" -c "$q")"
  echo "production: $(runuser -u postgres -- psql -X -At -d bababuilds_erp -c "$q")   # drill may be slightly older than live"
done
```

Expect 10 column rows, `PaymentQrImage rows: 0`, and counts that match the backup. Any error aborts (`ON_ERROR_STOP`, single transaction) and the drill database is dropped on exit.

## C. Apply to production with the official Prisma CLI

The Phase 4 doc requires the pinned official CLI against `bababuilds_erp`, from a checkout of the exact reviewed SHA, never `psql -f` (that would not register the migration, and the promoter checks the ledger).

**C1. Verified checkout**

```bash
SHA=<the main SHA you intend to deploy, from `git ls-remote https://github.com/baba-dev/BabaBuilds-ERP.git refs/heads/main`>
rm -rf /root/reviewed-source
git clone https://github.com/baba-dev/BabaBuilds-ERP.git /root/reviewed-source
git -C /root/reviewed-source checkout --detach "$SHA"
test "$(git -C /root/reviewed-source rev-parse HEAD)" = "$SHA" && echo SHA_OK

cd /root/reviewed-source
check() { [ "$(git hash-object prisma/migrations/$1/migration.sql)" = "$2" ] && echo "BLOB_OK $1" || { echo "BLOB_MISMATCH $1"; exit 1; }; }
check 20261121130000_invoice_accent_colors 8ce212e94bed8195597f150989f5c594367523ff
check 20261121140000_invoice_tds           8159cd904cb8d713fa159c16fe37e298ed4963d0
check 20261121150000_upi_payment_qr        6cda39a550b39ca672a7dd287f094e4fc6a9ef54
```

**C2. Install the pinned CLI (no app build needed)**

```bash
export PATH=/opt/bababuilds-erp/node26/bin:$PATH     # the pinned Node 26 used by the service
cd /root/reviewed-source
node --version                                        # expect v26.13.1
npm ci --no-audit --no-fund                           # installs prisma 7.10.1 as pinned in package-lock.json
npx prisma --version                                  # expect 7.10.1
```

**C3. Point at production without printing the URL**

```bash
# Confirm the variable name in the file first (names only, no values):
grep -oE '^[A-Z_]+=' /etc/bababuilds-erp/production-database.env
export DATABASE_URL="$(grep -E '^DATABASE_URL=' /etc/bababuilds-erp/production-database.env | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//')"
[ -n "$DATABASE_URL" ] && echo DATABASE_URL_SET
```

If the key is named differently, use the right one; do not echo the value.

**C4. Preview, then apply**

```bash
npx prisma migrate status
```

It must report **exactly three** pending migrations, the ones in the table above. If it lists anything else, or reports drift or a failed migration, **stop** and do not continue.

```bash
npx prisma migrate deploy
npx prisma migrate status        # expect: Database schema is up to date
unset DATABASE_URL
```

Do not use `migrate dev`, `migrate reset` or `db push` here, ever.

## D. Verify the ledger matches the release

This is the same query the promoter runs.

```bash
runuser -u postgres -- psql -X -At -F '|' -d bababuilds_erp -c \
 "SELECT migration_name, checksum FROM public.\"_prisma_migrations\" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name" \
 | tail -4
```

The last three rows must show the three migration names with the sha256 values in the table above, and there must be 11 rows in total. Also check the live site is unaffected (the old release keeps running):

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://erp.bababuilds.com/login      # 200
systemctl is-active bababuilds-erp.service                                      # active
```

## E. Deploy

Auto-deploy re-triggers on the next green `main` push. To deploy now:

1. Make sure CI is green for the **current** `main` SHA (the workflow refuses otherwise).
2. GitHub → Actions → **ERP immutable Node 26 systemd release** → *Run workflow* on `main`, tick **confirm_production**. Or:

```bash
gh workflow run deploy.yml --repo baba-dev/BabaBuilds-ERP --ref main -f confirm_production=true
```

Expected: `ERP_POSTGRES_MIGRATION_HISTORY_MATCH`, a private loopback preview on port 3199, then promotion. Only `bababuilds-erp.service` restarts (brief process replacement, not zero downtime; use a quiet window). I can dispatch this for you once you confirm section D passed.

## F. Verify after deploy

```bash
systemctl status bababuilds-erp.service --no-pager
readlink -f /proc/$(systemctl show -p MainPID --value bababuilds-erp.service)/exe       # /opt/bababuilds-erp/node26/bin/node
readlink -f /opt/bababuilds-erp/releases/current
ls /opt/bababuilds-erp/releases/current/public/pdfjs                                     # pdf.min.mjs and pdf.worker.min.mjs (copied by prebuild)
find /opt/bababuilds-erp/releases/current -path '*invoice-fonts*' -name '*.ttf' | head -3   # bundled fonts (path may differ inside the standalone tree)
for u in /login /blog /blog/invoice-design-india-get-paid-faster /features/invoice-designs \
         /help/invoice-designs /help/choose-an-invoice-design /help/change-invoice-colour \
         /help/show-tds-on-an-invoice /help/add-upi-qr-to-invoices /pdfjs/pdf.min.mjs; do
  printf '%s %s\n' "$u" "$(curl -s -o /dev/null -w '%{http_code}' https://erp.bababuilds.com$u)"
done
curl -s https://erp.bababuilds.com/sitemap.xml | grep -c '/blog'                         # 2
```

All should be `200`. Then in the app (signed in): Settings → Invoicing → **Compare all designs** (tiles render), Settings → Bank account → **UPI and QR codes** (save a UPI ID), create a test invoice with **Client deducts TDS** on, and open its PDF.

Also run the read-only audit workflow (`erp-vps-runtime-audit.yml`) and check sibling services (MenuMinute, ClubKeep) are unchanged.

If you serve behind Cloudflare, the workflow purges only the ERP service-worker URL when `CLOUDFLARE_*` secrets are configured. Pages such as `/blog` are new URLs and need no purge.

## G. Rollback

- **Application:** the promoter restores the previous `releases/current` symlink and restarts the ERP service automatically if startup or health fails. Manual: repoint the symlink to the previous `sha-d34520ec…` release and `systemctl restart bababuilds-erp.service`.
- **Database:** the old release works fine with the three migrations applied, so **do not roll them back**. Do not drop columns by hand and do not use `migrate resolve` to hide a problem. A real data restore from the section A dump loses everything written since the backup; treat it as a last resort and plan it separately.

## H. New crons, secrets and environment for this release

**Crons: none new.** The invoice-designs work added no `app/api/cron` route. The existing schedule in `docs/cron.md` stays as it is. Two existing jobs are relevant to invoices and should already be present:

```cron
*/15 * * * *  /var/www/bababuilds-erp/scripts/run-cron.sh sync-payments    >> /var/log/bababuilds/cron.log 2>&1
0  7  * * *   /var/www/bababuilds-erp/scripts/run-cron.sh process-retainers >> /var/log/bababuilds/cron.log 2>&1
```

Check what is installed: `crontab -l | grep run-cron`. Run any job once by hand first and expect `HTTP 200`: `/var/www/bababuilds-erp/scripts/run-cron.sh sync-payments`.

**VPS secrets: none new.** The code added reads no new environment variable. It uses the existing `PRIVATE_UPLOADS_DIR=/var/www/bababuilds-erp/private_uploads`, which the systemd unit already sets; uploaded payment QR images are stored there (persistent, preserved across releases, and already in `backup.sh`).

**Optional, already-existing flags** for the new Redis preview cache. They default off, and without them previews render directly (just slightly slower). Check without printing values:

```bash
grep -oE '^ERP_REDIS_[A-Z_]+=' /var/www/bababuilds-erp/.env /etc/bababuilds-erp/production-database.env 2>/dev/null
```

To use the cache the preview code needs `ERP_REDIS_ENABLED=true`, `ERP_REDIS_CACHE_ENABLED=true` and `ERP_REDIS_DATA_CACHE_URL` (a Redis URL for the ERP's own instance; never reuse a sibling app's Redis). Only add these if your Redis phases (`docs/redis-jobs-phase*.md`) are already provisioned; then `sudo systemctl restart bababuilds-erp.service`. Do not enable anything on Redis ports 6384–6386 (sibling apps).

**GitHub secrets and variables (not on the VPS):**

| Name | Used by | Needed for this release? |
|---|---|---|
| `HOST`, `USERNAME`, `SSH_KEY` | `deploy.yml` (protected SSH to the VPS) | already working (run 823 got as far as activation) |
| `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ZONE_ID` | service-worker purge step | optional |
| `ERP_AUTODEPLOY_ENABLED=true`, `ERP_RECOVERY_VERIFIED=true` (repo variables) | auto activation after green `main` CI | only for auto-deploy; a manual dispatch does not need them |
| `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON` | `android-release.yml` (the separate Android PR #685) | no, unrelated to the web deploy |

Existing app secrets you may want to double-check are present in `/var/www/bababuilds-erp/.env`: `CRON_SECRET` (`grep -c '^CRON_SECRET=' .env` should print 1).

## I. Quick checklist

- [ ] A: `backup.sh` run, off-host snapshot confirmed, dump readable
- [ ] B: drill applied cleanly, 10 columns + `PaymentQrImage`, counts match
- [ ] C1: SHA and three blob hashes match
- [ ] C4: `migrate status` showed exactly 3 pending; `migrate deploy` succeeded
- [ ] D: 11 ledger rows, last three checksums match; site still 200
- [ ] E: deploy dispatched on green current `main`
- [ ] F: service on Node 26, all URLs 200, compare page and UPI settings work
