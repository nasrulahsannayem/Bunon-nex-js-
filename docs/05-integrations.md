# ০৫ — ইন্টিগ্রেশন

---

## 📘 Meta (Facebook)

| বিষয় | মান |
|---|---|
| Pixel ID | `887459306920960` |
| CAPI এন্ডপয়েন্ট | `POST /api/v1/sync` |
| গার্ড | `browserEventGuard` (server-side revenue gating) |
| ক্যাটালগ | `https://bunon.shop/api/feed` |
| অ্যাপ | Agent Nupur (`895834282774584`) |
| পেজ | Bunon Fabrics (`117184704704594`) |
| IG | `@bunonfabricsbd` |

**ইভেন্ট:** PageView, ViewContent, AddToCart, InitiateCheckout, Purchase

### CAPI ডুপ্লিকেট রোধ
ব্রাউজার থেকে ইভেন্ট যায় → সার্ভার revenue event যাচাই করে → শুধু **real order** হলে Meta-তে পাঠায় (test code বাদ)।

**লাইভ প্রমাণ (out log):**
```
[CAPI SUCCESS] PageView - ID: event_1790986082997_9wbx0q5ca
[GA4 MP] PageView -> HTTP 204
```

### ⚠️ Meta App Review
`pages_messaging` পারমিশন এখনো রিভিউ পেন্ডিং → Messenger ইনবক্স read/reply কাজ করে না (code 190)।

### Meta ক্যাটালগ
```
ক্যাটালগ ID: 1043697484251466 ("বুনন ফেব্রিক্স -2026")
ফিড:        /api/feed (hourly scheduled)
ব্যাচ সাইন্ক: catalog_sync.py --once
```
✅ **WP decoupling সম্পন্ন** — ক্যাটালগে ০টি `bunonfabrics.com` লিংক।

### ক্যাটালগ টোকেন
```
DB KV (integration_config)  → ❌ INVALID (code 190, ভুল পেজ)
হোস্ট ফাইল → ✅ VALID
/www/wwwroot/bunonfabrics.com/tg_auto_bot/storage/meta_token_cache.json
   key: page_access_token
   scopes: catalog_management + business_management + ads_management
```
**সবসময় হোস্ট ফাইল থেকে পড়ুন, DB KV কখনো নয়।**

---

## 📊 Google Analytics 4

| প্রপার্টি | ID |
|---|---|
| Google Ads | `AW-16837869483` |
| GA4 | `G-Y4KWR202X6` |

**এনপয়েন্ট:** `https://analytics.google.com/g/collect`

**সার্ভার-সাইড Measurement Protocol:**
```
GA4 MP PageView → HTTP 204 ✅
```
এটা Meta CAPI-এর সাথে যুক্ত — একটা event দুই জায়গাতেই যায়।

### ⚠️ GTM ও Clarity
```
VITE_GTM_ID     = ""   ❌ ফাঁকা
VITE_CLARITY_ID = ""   ❌ ফাঁকা
```
`@microsoft/clarity` প্যাকেজ ইনস্টলড আছে কিন্তু কোথাও কাজে লাগছে না।

> ⚠️ **Pre-existing noise:** প্রতিটি পেজে TikTok-এর `ttq.set is not a function` কনসোল এরর আসে। এটা TikTok-এর নিজের স্ক্রিপ্টের বাগ, আমাদের কোডে নয় — ছাড়বেন না।

---

## 🎵 TikTok

| বিষয় | মান |
|---|---|
| Pixel ID | `CU40Q4JC77U` |
| Events API | `POST /api/v1/tiktok` |
| গার্ড | `requireSignedTracking` (HMAC) |
| Env | `TIKTOK_API_TOKEN`, `TIKTOK_ACCESS_TOKEN`, `TRACKING_SIGNING_SECRET` |

✅ **যাচাইকৃত:** সাইনেচার ছাড়া POST → **401**

---

## 📦 Steadfast কুরিয়ার

| Env | ব্যবহার |
|---|---|
| `STEADFAST_API_BASE_URL` | API বেস |
| `STEADFAST_API_KEY` | API key |
| `STEADFAST_SECRET_KEY` | HMAC সিক্রেট |
| `STEADFAST_WEBHOOK_TOKEN` | Webhook auth |
| `STEADFAST_WEBHOOK_URL` | Callback URL |

### Webhook
```
POST /api/admin/couriers/steadfast/webhook
```
- HMAC যাচাই (ভুল signature → reject ✅)
- ১৩টি রাইডার স্ট্যাটাস ম্যাপ করা
- `updated_at` আপডেট করে যাতে watcher দেখে

### ⚠️ জীবিত বাগ
`server/routes/webhook.ts:218,220,223` → `pickup_request`/`payment_request`/`user_update` ইভেন্টে **ভুল pool** (`productDbPool`) ব্যবহার করে `bf_orders` query করে → `Table doesn't exist` → ওই ইভেন্টগুলো log হয় না।

> ✅ ডেলিভারি স্ট্যাটাস আপডেট কাজ করে (`applySteadfastUpdate` → `dbPool`)।

### ⚠️ Unmapped ইভেন্ট
`delivery.status.updated` — নতুন Steadfast ইভেন্ট টাইপ, হ্যান্ডলার নেই (log-only)।

---

## 💳 পেমেন্ট গেটওয়ে

### bKash
```
Env: BKASH_USERNAME, BKASH_PASSWORD, BKASH_APP_KEY, BKASH_APP_SECRET
Endpoint: /api/payment/bkash-callback
```

### PayStation
```
Env: PAYSTATION_MERCHANT_ID, PAYSTATION_PASSWORD
Endpoint: /api/payment/paystation-callback
```

### COD
ডিফল্ট — কোনো gateway লাগে না।

---

## 📧 ইমেইল (SMTP) — 🔴 ভাঙা

| Env | মান |
|---|---|
| `MAIL_HOST` | `127.0.0.1` (লোকাল Postfix) |
| `MAIL_PORT` | `587` |
| `MAIL_USER` | Gmail অ্যাকাউন্ট |

### আলাদা সার্ভিস
```
server/services/email.ts         → অর্ডার কনফার্মেশন
server/services/recoveryCron.ts  → কার্ট রিকভারি
server/services/marketingCron.ts → নিউজলেটার
server/services/notification.ts  → বিভিন্ন নোটিফিকেশন
```

### রুট কেস
```bash
# /var/spool/postfix/pid এর owner ভুল
drwxr-xr-x root root   ← হওয়া উচিত postfix:postfix

# ফলাফল
smtpd → fatal: open lock file pid/inet.smtp: cannot create file exclusively
     → প্রতিটি SMTP কানেকশন ECONNRESET
```

### ফিক্স
```bash
chown postfix:postfix /var/spool/postfix/pid
chown postfix:postfix /var/spool/postfix/maildrop
systemctl restart postfix
```

### অতিরিক্ত সমস্যা
`dovecot` ফেইলড — `/etc/letsencrypt/live/mail.nasrulahsan.com/fullchain.pem` নেই।

### ইমেইল লগ
`bf_email_logs` টেবিল (sent ৩০, failed ১৭)

---

## 🤖 Telegram

| Env | ব্যবহার |
|---|---|
| `TELEGRAM_BOT_TOKEN` | বট টোকেন |
| `TELEGRAM_RECRUITMENT_CHANNEL_ID` | টেল-সেল্স চ্যানেল |
| `TELEGRAM_KPI_CHAT_ID` | KPI রিপোর্ট |
| `META_WEBHOOK_ALERT_CHAT_ID` | Meta অ্যালার্ট |

**ব্যবহার:**
- টেল-সেল্স অ্যাপ্লিকেশন → রিক্রুটমেন্ট চ্যানেল ✅
- অর্ডার নোটিফিকেশন → `orderNotify.ts`
- দৈনিক KPI রিপোর্ট → `dailyKpi.ts`

---

## 🔥 Firebase

| ফাইল | ব্যবহার |
|---|---|
| `firebase-service-account.json` | FCM push |
| `nupur-ai-engine-*.json` | Realtime DB |

⚠️ `firebase-service-account.json` **git-এ tracked** — secret history-তে আছে।

---

## 🌐 অন্যান্য

| সার্ভিস | Env | ব্যবহার |
|---|---|---|
| HOORIN | `HOORIN_API_KEY` | হোরিন ইন্টিগ্রেশন |
| Google OAuth | `GOOGLE_OAUTH_*` | ইউজার লগইন |
| EcomOS | `ECOMOS_API_TOKEN` | পণ্য ম্যাপিং |

---

*পরবর্তী: `06-database.md` →*
