# Scheduled jobs on the VPS

The app runs under pm2 from `/var/www/bababuilds-erp`. Every job is a `GET /api/cron/<name>` call with `Authorization: Bearer $CRON_SECRET`. `scripts/run-cron.sh <name>` makes the call using the `CRON_SECRET` in the app's `.env` and prints the HTTP status.

## Install

```bash
cd /var/www/bababuilds-erp
grep -c '^CRON_SECRET=' .env          # must print 1; if 0, add CRON_SECRET=<long random string> to .env and run: npx pm2 restart erp
chmod +x scripts/run-cron.sh
scripts/run-cron.sh expense-automation   # test once; expect "HTTP 200"
mkdir -p /var/log/bababuilds
```

Add these lines with `crontab -e` (times are the server's timezone; adjust to taste):

```cron
# BabaBuilds ERP scheduled jobs
15 6  * * * /var/www/bababuilds-erp/scripts/run-cron.sh expense-automation >> /var/log/bababuilds/cron.log 2>&1
30 6  * * * /var/www/bababuilds-erp/scripts/run-cron.sh ar-reminders       >> /var/log/bababuilds/cron.log 2>&1
45 6  * * * /var/www/bababuilds-erp/scripts/run-cron.sh gst-reminders      >> /var/log/bababuilds/cron.log 2>&1
0  6  * * * /var/www/bababuilds-erp/scripts/run-cron.sh trial-expiry       >> /var/log/bababuilds/cron.log 2>&1
# Emails saved reports on their weekly (Monday) and monthly (1st) schedules; needs SMTP in Business Settings
30 7  * * * /var/www/bababuilds-erp/scripts/run-cron.sh report-schedules   >> /var/log/bababuilds/cron.log 2>&1
# Nudges to run payroll in time, approve it, and pay PF / ESI / professional tax / TDS before they are due
0  7  * * * /var/www/bababuilds-erp/scripts/run-cron.sh payroll-reminders   >> /var/log/bababuilds/cron.log 2>&1
# Saves the nightly cash forecast (feeds the accuracy view) and warns about a coming shortfall
0  5  * * * /var/www/bababuilds-erp/scripts/run-cron.sh cash-forecast      >> /var/log/bababuilds/cron.log 2>&1
# Email Hosting: usage snapshots, trial conversion and mailbox-quantity changes; must run BEFORE process-retainers (07:00)
50 6  * * * /var/www/bababuilds-erp/scripts/run-cron.sh email-hosting       >> /var/log/bababuilds/cron.log 2>&1
# Email Hosting: runs scheduled mailbox deletes and retries failed server operations
*/5 * * * * /var/www/bababuilds-erp/scripts/run-cron.sh email-hosting-operations >> /var/log/bababuilds/cron.log 2>&1
# Out-of-stock and low-stock digests, and a nudge when a supplier is late with a purchase order
40 7  * * * /var/www/bababuilds-erp/scripts/run-cron.sh inventory-alerts    >> /var/log/bababuilds/cron.log 2>&1
# Closes abandoned shop checkouts and reminds you about unshipped and refund-due shop orders
20 7  * * * /var/www/bababuilds-erp/scripts/run-cron.sh shop-orders         >> /var/log/bababuilds/cron.log 2>&1
```

## Every job

All 19 routes live under `app/api/cron/` and need `Authorization: Bearer $CRON_SECRET`. Schedule the ones marked **recommended**; the rest are conditional.

| Route | What it does | Schedule | Notes |
| --- | --- | --- | --- |
| `expense-automation` | Posts recurring expenses that have come due and sends each workspace its "bills to pay" digest | daily 06:15 | **recommended** |
| `ar-reminders` | Overdue-invoice reminders for workspaces that enabled AR Collections and opted in to automatic reminders | daily 06:30 | **recommended**; skips workspaces whose module is off or plan has lapsed |
| `gst-reminders` | Due-date reminders (7, 3, 1 days before, on the day, weekly once overdue) plus a Monday digest of what blocks filing | daily 06:45 | **recommended** |
| `trial-expiry` | Expires `TRIALING` workspaces past `subscriptionEndsAt` | daily 06:00 | **recommended** |
| `email-hosting` | Per workspace with Email Hosting on: syncs mail servers on the DAILY/WEEKLY preference, records usage snapshots, ends trials, applies or queues mailbox-quantity changes, raises quota alerts and sends the payments digest | daily 06:50 | **recommended** if Email Hosting is used; must run **before** `process-retainers` so that day's invoices use current quantities |
| `email-hosting-operations` | Runs scheduled mailbox deletes (the soft-delete window) and retries failed Email Hosting server operations; fails operations a crash left half-done | every 5 min | **recommended** if managed mode is used; without it scheduled deletes never run |
| `process-retainers` | Generates one invoice per due active retainer, sends retainer reminders | daily 07:00 | **recommended**; a retainer several cycles behind catches up one cycle per run |
| `sync-payments` | Reconciles pending invoices that have a provider payment link | every 15 min | **recommended** if Razorpay/Stripe links are used; `maxDuration` 300s |
| `alerts` | Deadline, renewal, payment and tax notifications (in-app + web push) | daily 08:00 | **recommended**; push needs `VAPID_*` in `.env` |
| `cash-forecast` | Saves the nightly cash forecast for every non-suspended workspace (feeds the accuracy view) and warns about a coming shortfall | daily 05:00 | **recommended** if the Cash Flow module is used (already in the crontab above) |
| `accounting-integrity` | Runs and stores the ledger integrity check per workspace | nightly 03:00 | **recommended**; review `violationCount` in the response |
| `cleanup` | Prunes activity and file-import logs (`APP_ACTIVITY_LOG_RETENTION_DAYS`, default 90) | weekly, Sun 04:00 | **recommended**; set `APP_ACTIVITY_LOG_ARCHIVE_DIR` to archive before pruning |
| `tax-obligations` | Creates and advances tax obligations, filing periods and compliance tasks (open → ready → overdue/filed) | daily 05:00 | Optional sharding with `TAX_CRON_SHARD_TOTAL` / `TAX_CRON_SHARD_INDEX` |
| `report-schedules` | Emails saved reports on their weekly (Monday) and monthly (1st) schedules | daily 07:30 | **recommended**; needs SMTP in Business Settings (already in the crontab above) |
| `payroll-reminders` | Nudges to run payroll, approve it, and pay PF / ESI / professional tax / TDS before they are due | daily 07:00 | **recommended** if Payroll is used (already in the crontab above) |
| `inventory-alerts` | Out-of-stock and low-stock digests, and a nudge when a supplier is late with a purchase order | daily 07:40 | **recommended** if Inventory is used (already in the crontab above) |
| `shop-orders` | Closes abandoned shop checkouts (24h+) and reminds about unshipped and refund-due shop orders | daily 07:20 | **recommended** if the Shop is used (already in the crontab above) |
| `documents-ocr` | Processes queued OCR jobs | every 5 min | Only when an OCR provider is configured; returns **503** otherwise, so do not schedule it unconfigured |
| `tax-rules-sync` | Syncs fallback tax rates | weekly | **Dry-run in production** unless called with `?apply=1` **and** approved (`?approve=1` or `TAX_RULES_SYNC_APPROVED=1`) |

```cron
# Remaining recommended jobs (same pattern as above; cash-forecast and the reminder jobs are already listed)
0  7  * * *   /var/www/bababuilds-erp/scripts/run-cron.sh process-retainers      >> /var/log/bababuilds/cron.log 2>&1
*/15 * * * *  /var/www/bababuilds-erp/scripts/run-cron.sh sync-payments          >> /var/log/bababuilds/cron.log 2>&1
0  8  * * *   /var/www/bababuilds-erp/scripts/run-cron.sh alerts                 >> /var/log/bababuilds/cron.log 2>&1
0  3  * * *   /var/www/bababuilds-erp/scripts/run-cron.sh accounting-integrity   >> /var/log/bababuilds/cron.log 2>&1
0  4  * * 0   /var/www/bababuilds-erp/scripts/run-cron.sh cleanup                >> /var/log/bababuilds/cron.log 2>&1
0  5  * * *   /var/www/bababuilds-erp/scripts/run-cron.sh tax-obligations        >> /var/log/bababuilds/cron.log 2>&1
```

Run each new job once by hand first and expect `HTTP 200` before adding it to the crontab.
