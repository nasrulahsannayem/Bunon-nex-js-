#!/bin/bash
echo "⏪ Starting Instant Rollback for Bunon Shop..."

# 1. Check if backup exists
if [ -d "dist_backup" ]; then
    echo "🔄 Restoring from backup..."
    rm -rf dist
    cp -r dist_backup dist
    
    echo "♻️ Restarting PM2 process..."
    pm2 restart bunon-site

    echo "✅ Rollback Successful! (Restored previous build)"
else
    echo "❌ Error: No backup found (dist_backup directory is missing)."
    echo "Cannot perform instant rollback!"
    exit 1
fi
