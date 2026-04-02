#!/bin/bash

# BabaBuilds ClamAV Setup Script for Ubuntu VPS
# Run this script with sudo: sudo ./clamav_setup.sh

set -e

echo "--- 🛡️ Starting ClamAV Setup for erp.bababuilds.com ---"

# 1. Update package list
echo "1. Updating package list..."
sudo apt update -y

# 2. Install ClamAV, Daemon, and Freshclam
echo "2. Installing ClamAV components..."
sudo apt install -y clamav clamav-daemon clamav-freshclam

# 3. Stop services for initial database update
echo "3. Stopping services for initial database sync..."
sudo systemctl stop clamav-freshclam || true
sudo systemctl stop clamav-daemon || true

# 4. Update virus database (Freshclam)
echo "4. Updating virus definitions (this may take a few minutes)..."
sudo freshclam || echo "Freshclam might already be running or failed to lock. Continuing..."

# 5. Start and Enable Services
echo "5. Enabling services on startup..."
sudo systemctl start clamav-freshclam
sudo systemctl enable clamav-freshclam
sudo systemctl start clamav-daemon
sudo systemctl enable clamav-daemon

# 6. Configure Permissions (Optional but helpful for Node.js interaction)
# Ensure the clamd socket is accessible
CLAM_SOCKET="/var/run/clamav/clamd.ctl"
if [ -S "$CLAM_SOCKET" ]; then
    echo "✅ ClamAV socket found at $CLAM_SOCKET"
    sudo chmod 666 "$CLAM_SOCKET"
else
    echo "⚠️ Warning: ClamAV socket not found. Checking status..."
    sudo systemctl status clamav-daemon --no-pager
fi

# 7. Verification
echo "7. Verifying ClamAV installation..."
clamscan --version
sudo systemctl is-active clamav-daemon

echo "--- ✅ ClamAV Setup Complete ---"
echo "Note: The first scan may take a bit longer as the daemon loads the database into RAM."
echo "Wait for the 'active (running)' status in the log below:"
sudo systemctl status clamav-daemon --no-pager
