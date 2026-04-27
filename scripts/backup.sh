#!/bin/bash

# Configuration
BACKUP_DIR="${BACKUP_DIR:-$PWD/backups}"
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
BACKUP_PATH="$BACKUP_DIR/$TIMESTAMP"
RETENTION_COUNT=5

# Create backup directory for this run
mkdir -p "$BACKUP_PATH"

echo "Starting backup at $TIMESTAMP..."

# 1. Database Backup (SQLite)
# Using `sqlite3 .backup` is safer as it handles concurrent writes better than `cp`
if [ -f "prisma/dev.db" ]; then
    echo "Backing up database..."
    sqlite3 prisma/dev.db ".backup '$BACKUP_PATH/dev.db'"
else
    echo "Warning: prisma/dev.db not found."
fi

# 2. Uploaded Files Backup
echo "Backing up uploaded files..."
mkdir -p "$BACKUP_PATH/uploads"

# Private uploads root (preferred). Mirrors PRIVATE_UPLOADS_DIR default.
PRIVATE_UPLOADS_DIR="${PRIVATE_UPLOADS_DIR:-private_uploads}"
if [ -d "$PRIVATE_UPLOADS_DIR" ]; then
    tar -czf "$BACKUP_PATH/uploads/private_uploads.tar.gz" "$PRIVATE_UPLOADS_DIR"
fi

# Legacy public upload folders (for older deployments).
for folder in "public/logos" "public/receipts" "public/invoices" "public/signatures" "public/products" "public/uploads"; do
    if [ -d "$folder" ]; then
        tar -czf "$BACKUP_PATH/uploads/$(basename $folder).tar.gz" "$folder"
    fi
done

# 3. Repository Mirror (Git Bundle)
echo "Creating repository mirror..."
git bundle create "$BACKUP_PATH/repo_mirror.bundle" main

# 4. Retention Logic (Keep last 5)
echo "Cleaning up old backups (keeping last $RETENTION_COUNT)..."
# List directories in BACKUP_DIR, sort by name (which is timestamp encoded), and remove all but the last N
ls -dt "$BACKUP_DIR"/*/ | tail -n +$((RETENTION_COUNT + 1)) | xargs -I {} rm -rf "{}" 2>/dev/null || true

echo "Backup completed successfully at $(date)."
echo "Backup stored in: $BACKUP_PATH"
