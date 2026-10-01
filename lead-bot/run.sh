#!/bin/bash
set -e
cd /www/wwwroot/bunon.shop/lead-bot
# Kill any stale bot.py to avoid Telegram Conflict
pkill -9 -f 'bot.py' 2>/dev/null || true
sleep 3
# Clear any stale telegram connections
curl -s --max-time 5 'https://api.telegram.org/bot8358900283:AAEOkcNhVCCoLo4wwUv_5adNl7wMihcqCq4
8789739797:AAFV8X_0ZMwdpOiqd0GsAIxn2R9olOcPFMU
MTUyOTkwNjA4MjY0OTA4MDAwOQ.GBi7KI.lFreMFCrnEWbhE51LYc_y080US54Q3kpsJdhV8
8358900283:AAEOkcNhVCCoLo4wwUv_5adNl7wMihcqCq4/deleteWebhook' > /dev/null 2>&1 || true
sleep 2
exec /www/wwwroot/bunon.shop/lead-bot/.venv/bin/python /www/wwwroot/bunon.shop/lead-bot/bot.py
