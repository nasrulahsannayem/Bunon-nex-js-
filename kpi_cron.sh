#!/bin/bash
cd /www/wwwroot/bunon.shop || exit 1
YESTERDAY=$(date -d 'yesterday' +%F)
REPORT_DATE="$YESTERDAY" ./node_modules/.bin/tsx server/services/dailyKpi.ts mode=send >> /www/wwwlogs/bunon-kpi.log 2>&1
