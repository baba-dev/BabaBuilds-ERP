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
```

Other routes exist (`process-retainers`, `sync-payments`, `cash-forecast`, `tax-obligations`, `tax-rules-sync`, `documents-ocr`, `accounting-integrity`, `alerts`, `cleanup`); check what each does in its `route.ts` before scheduling it, and ask which ones you already run.
