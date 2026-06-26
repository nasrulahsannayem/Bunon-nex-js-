#!/bin/bash

echo "🚀 Starting Deployment..."

# Set the remote URL with the Personal Access Token for authentication
git remote set-url origin https://nasrulahsannayem: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@github.com/nasrulahsannayem/Bunon-nex-js-.git

# Fetch the latest code from GitHub
echo "📥 Fetching latest code from GitHub..."
git fetch origin

# Hard reset the local repository to match GitHub master branch exactly
echo "🔄 Resetting local files to match GitHub..."
git reset --hard origin/master

# Build the project (This compiles server.ts into server.cjs!)
echo "🏗️ Building the project (Compiling server.ts)..."
npm install
npm run build

# Run the database setup script to ensure tables exist
echo "🛠️ Ensuring database tables exist..."
node "$(dirname "$0")/setup_db.cjs"

# Restart the PM2 process
echo "♻️ Recreating PM2 process (bunon-site)..."
pm2 delete bunon-site || true
pm2 start dist/server.cjs --name "bunon-site"

# Show the logs
echo "📜 Tailing PM2 logs..."
pm2 logs bunon-site
