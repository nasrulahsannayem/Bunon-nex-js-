# ০৭ — ক্রন জব

**সব ক্রন root crontab-এ।** দেখতে: `crontab -l`
লগ: `/var/log/syslog` (CRON লাইন) ও `/www/wwwlogs/*.log`

---

## bunon.shop এর ক্রন

| সময় | কমান্ড | কী করে |
|---|---|---|
| `10 0 * * *` | `bunon.shop/kpi_cron.sh` | দৈনিক KPI রিপোর্ট (গতকালের) |
| `15 0 * * 0` | `dailyKpi.ts mode=send-weekly` | সাপ্তাহিক KPI |
| `20 0 1 * *` | `dailyKpi.ts mode=send-monthly` | মাসিক KPI |
| `*/30 * * * *` | `marketingCron.ts recovery` | কার্ট রিকভারি |
| `0 10 * * *` | `marketingCron.ts newsletter` | দৈনিক নিউজলেটার |

### ১. `kpi_cron.sh` (দৈনিক ০০:১০)
```bash
#!/bin/bash
cd /www/wwwroot/bunon.shop || exit 1
YESTERDAY=$(date -d 'yesterday' +%F)
REPORT_DATE="$YESTERDAY" ./node_modules/.bin/tsx server/services/dailyKpi.ts mode=send \
  >> /www/wwwlogs/bunon-kpi.log 2>&1
```

### ২. সাপ্তাহিক KPI (রবিবার ০০:১৫)
```bash
MODE=send-weekly tsx server/services/dailyKpi.ts
```

### ৩. মাসিক KPI (১ তারিখ ০০:২০)
```bash
MODE=send-monthly tsx server/services/dailyKpi.ts
```

### ৪. কার্ট রিকভারি (প্রতি ৩০ মিনিট)
```bash
*/30 * * * * tsx server/services/marketingCron.ts recovery
```
Queue নিজেই ১ ঘণ্টা / ২৪ ঘণ্টা / attempt gating করে।

**সর্বশেষ লগ:**
```
[REDIS] Connected successfully ⚡
[Recovery] No pending recovery jobs to process.
[Cron] recovery finished in 0.0s
```

### ৫. নিউজলেটার (প্রতিদিন ১০:০০)
```bash
0 10 * * * tsx server/services/marketingCron.ts newsletter
```
সাবস্ক্রাইবার: ২৭ জন (`wc_marketing_emails`)

> ⚠️ **ফেইলিং:** `[Email] Failed to process daily newsletter campaign: read ECONNRESET` — SMTP সমস্যার কারণে

---

## 🔗 bunonfabrics.com / dash সংশ্লিষ্ট ক্রন

| সময় | কমান্ড |
|---|---|
| `10 * * * *` | `dash.bunonfabrics.com/api/meta_sync_today.php` |
| `8 8 1 * *` | `dash.bunonfabrics.com/api/meta_sync_7days.php` |
| `5 * * * *` | `dash.bunonfabrics.com/planner/api/cron_meta_followup.php` |
| `*/30 * * * *` | `dash.bunonfabrics.com/planner/api/orders/pull_courier_status.php` |
| `*/25 * * * *` | `curl http://127.0.0.1:5001/api/v1/wa-analytics/report?hours=24` |
| `*/5 * * * *` | `wget bunonfabrics.com/wp-cron.php` |
| `*/35 * * * *` | `dash/orders/sync.php` (sudo -u www) |
| `*/1 * * * *` | `/www/server/cron/2a1869...` |

### WhatsApp → GA4/Meta (প্রতি ২৫ মিনিট)
```bash
*/25 * * * * curl -s --fail --max-time 90 \
  'http://127.0.0.1:5001/api/v1/wa-analytics/report?hours=24' \
  >> /var/log/wa-analytics.log 2>&1
```
**সর্বশেষ আউটপুট:**
```json
{"ok":true,"scanned":0,"leads":0,"purchases":0,"meta_status":0,"ga4_status":0}
```

---

## 🔗 অন্যান্য সাইটের ক্রন

| সময় | কমান্ড |
|---|---|
| `10 0 * * *` | `metakpi.com/.../cron_daily_reports.php type=midnight` |
| `0 1-23 * * *` | `metakpi.com/.../cron_daily_reports.php type=noon` |
| `* * * * *` | `metakpi.com/.../telegram_worker.php` |
| `* * * * *` | `metakpi.com/.../mail_worker.php` |
| `*/20 * * * *` | `tg-bot/tinderf_bot/auto_post.php` |
| `*/15 * * * *` | `tg-bot/tinderf_bot/news.php` |
| `0 */6 * * *` | `tg-bot/tinderf_bot/autoblog.php` |
| `*/30 * * * *` | `tg-bot/tinderf_bot/channel_post.php` |
| `30 2 * * *` | `app.metakpi.com/ebook_auto_kpi.py` |
| `*/5 * * * *` | `127.0.0.1:3000/api/cron/sync-news` |
| `0 * * * *` | `rm -rf /usr/local/lsws/cachedata/priv/*` |

### @reboot
```bash
socat TCP-LISTEN:2223 → 127.0.0.1:2222
socat TCP-LISTEN:2445,bind=172.18.0.1 → 127.0.0.1:2444
sleep 20 && socat TCP-LISTEN:18022 → 127.0.0.1:8022
```

---

## 🖥️ সার্ভিস-সাইড শিডিউলার

Node ক্রন (`node-cron`) ব্যবহার করে:
- **WA status watcher** — প্রতি ৩০ সেকেন্ডে Steadfast থেকে স্ট্যাটাস পুল

> ℹ️ `dailyPromotionsCron.ts` git থেকে মুছে ফেলা হয়েছে, কিন্তু কোথাও রেফারেন্স নেই এবং ক্রনও নেই — সক্রিয় নয়।

---

## ⚠️ সমস্যা

### ১. KPI লগ ফাইল নেই
```
/www/wwwlogs/bunon-kpi.log  → মুখ্যাফাইল নেই
```
কারণ: সম্ভবত লগ ঘোরানো হয়েছে। ডিরেক্টরি writable ✅ — পরের রান থেকে তৈরি হবে।

### ২. নিউজলেটার ব্যর্থ
```
[Email] Failed to process daily newsletter campaign: read ECONNRESET
```
→ SMTP সমস্যা (দেখুন `10-known-issues.md`)

### ৩. SMTP master অস্থির
`master` pid প্রতি ~৬০ সেকেন্ডে বদলায় — systemd প্রতি মিনিটে restart try করছে, ব্যর্থ হচ্ছে।

---

## 🛠️ ক্রন ডিবাগ

```bash
crontab -l                              # কী আছে
grep CRON /var/log/syslog | tail -20    # চলেছে কিনা
journalctl -u cron --since "2 days ago" | grep <keyword>

# ম্যানুয়ালি চালিয়ে দেখুন
cd /www/wwwroot/bunon.shop
./node_modules/.bin/tsx server/services/marketingCron.ts recovery --dry
./node_modules/.bin/tsx server/services/dailyKpi.ts mode=send   # REPORT_DATE=... দিন
```

> 💡 **dry-run ফ্ল্যাগ আছে:** `recovery --dry`, `newsletter --dry` — কোনো ইমেইল পাঠায় না, শুধু রিপোর্ট দেয়।

---

*পরবর্তী: `08-deployment.md` →*
