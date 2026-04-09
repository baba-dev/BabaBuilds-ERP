#!/bin/bash

# BabaBuilds ERP Deployment Script for VPS
# Usage: ./deploy.sh
set -euo pipefail

echo "--- Starting Deployment for erp.bababuilds.com ---"

# 1. Update Code (assuming you have already git pulled or uploaded)
echo "1. Checking dependencies..."
npm install --production

# 2. Update Database
echo "2. Applying database migrations..."
# Assuming you use SQLite on the VPS and dev.db is in the root
npx prisma migrate deploy

# 3. Build the Next.js App
echo "3. Building the production bundle..."
npm run build -- --webpack

echo "3.1 Validating service worker artifact..."
if [ ! -f "public/sw.js" ]; then
    echo "ERROR: Build failed or service worker artifact generation failed: public/sw.js is missing."
    exit 1
fi
echo "Service worker artifact found: public/sw.js"

# 4. Restart the App (Assuming PM2)
echo "4. Restarting the ERP process via PM2..."
# If this is the first run, use: pm2 start npm --name "baba-erp" -- start
if pm2 list | grep -q "baba-erp"; then
    pm2 restart baba-erp
else
    pm2 start npm --name "baba-erp" -- start
fi

if [ "${ENABLE_SW_SMOKE_CHECK:-0}" = "1" ]; then
    echo "5. Running post-deploy smoke check for service worker..."
    sw_status="$(curl -s -o /dev/null -w "%{http_code}" https://erp.bababuilds.com/sw.js)"
    if [ "$sw_status" != "200" ]; then
        echo "ERROR: Smoke check failed: https://erp.bababuilds.com/sw.js returned HTTP $sw_status"
        exit 1
    fi
    echo "Smoke check passed: https://erp.bababuilds.com/sw.js returned HTTP 200"
fi

echo "--- Deployment Complete ---"
echo "Check Nginx status if the app is still unreachable: sudo systemctl status nginx"
