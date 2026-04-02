#!/bin/bash

# BabaBuilds ERP Deployment Script for VPS
# Usage: ./deploy.sh

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
npm run build

# 4. Restart the App (Assuming PM2)
echo "4. Restarting the ERP process via PM2..."
# If this is the first run, use: pm2 start npm --name "baba-erp" -- start
if pm2 list | grep -q "baba-erp"; then
    pm2 restart baba-erp
else
    pm2 start npm --name "baba-erp" -- start
fi

echo "--- Deployment Complete ---"
echo "Check Nginx status if the app is still unreachable: sudo systemctl status nginx"
