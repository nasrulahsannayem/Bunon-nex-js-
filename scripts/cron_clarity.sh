#!/bin/bash
# Refresh the Clarity cache consumed by GET /api/admin/clarity.
# Hourly: Clarity allows only 10 requests/day and numOfDays is capped at 3,
# so an hourly warm keeps the admin page fresh while staying far under quota.
cd /www/wwwroot/bunon.shop || exit 1
export NODE_ENV=production
npx tsx scripts/refresh_clarity.ts 2>&1
