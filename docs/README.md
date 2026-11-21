# 📚 Bunon.shop — সম্পূর্ণ ডকুমেন্টেশন

**ভার্সন:** 1.0 | **তারিখ:** ০৩ অক্টোবর ২০২৬ | **স্ট্যাটাস:** লাইভ-ভেরিফায়েড

বুনন ফেব্রিক্স — COD (ক্যাশ অন ডেলিভারি) সেলুন ওয়্যার সাইটের সম্পূর্ণ প্রযুক্তিগত নথি।

---

## 📂 ফাইল তালিকা

| # | ফাইল | বিষয় |
|---|---|---|
| 00 | `README.md` | এই ফাইল — ইনডেক্স ও দ্রুত রেফারেন্স |
| 01 | `01-architecture.md` | সিস্টেম আর্কিটেকচার, ইনফ্রাস্ট্রাকচার, ডেটাবেস |
| 02 | `02-pages-routes.md` | সব পেইজ ও রুট (পাবলিক + অ্যাডমিন) |
| 03 | `03-features.md` | সব ফিচার বিস্তারিত |
| 04 | `04-api-routes.md` | সব API এন্ডপয়েন্ট |
| 05 | `05-integrations.md` | Meta, GA4, TikTok, Steadfast, bKash, PayStation, Firebase |
| 06 | `06-database.md` | ডেটাবেস স্কিমা ও টেবিল |
| 07 | `07-cron-jobs.md` | সব ক্রন জব ও শিডিউল |
| 08 | `08-deployment.md` | বিল্ড, ডিপ্লয়, PM2, nginx |
| 09 | `09-operations.md` | দৈনিক অপারেশন ও ট্রাবলশুটিং |
| 10 | `10-known-issues.md` | ⚠️ সব সমস্যা ও অমীমাণীকৃত কাজ |
| 11 | `11-changelog.md` | কী কী পরিবর্তন হয়েছে, কখন |
| 12 | `12-admin-login-fix.md` | অ্যাডমিন লগইন ফিক্স (০৩ অক্টো) |

---

## ⚡ দ্রুত রেফারেন্স

### মূল তথ্য
```
ডোমেইন      bunon.shop (legacy: bunonfabrics.com — একই অ্যাপ)
হোস্ট       15.235.162.246
পোর্ট       5001 (nginx proxy → 127.0.0.1:5001)
প্রজেক্ট     /www/wwwroot/bunon.shop
প্রসেস       PM2: bunon-site → dist/server.cjs
Node        v24.18.0
```

### স্ট্যাক
```
ফ্রন্টএন্ড   React 19 + Vite 6 + Tailwind 4 + React Router 7
ব্যাকএন্ড    Node.js + Express 4 + TypeScript (esbuild)
ডেটাবেস     MySQL × 2  +  Redis 6
কুরিয়ার     Steadfast
পেমেন্ট     COD + bKash + PayStation
মোবাইল      Capacitor Android
ট্র্যাকিং   Meta Pixel + CAPI, GA4, TikTok
```

### ডেটা সংখ্যা (০৩ অক্টো ২০২৬)
```
পণ্য              368
ক্যাটাগরি          34
ব্লগ              100
ইউজার             24
অর্ডার (মোট)      7,334
পণ্যের ছবি        892 (সব local, WP থেকে মুক্ত)
```

---

## 🚨 এখনই জানা দরকার

| সমস্যা | অবস্থা | বিস্তারিত |
|---|---|---|
| **SMTP বন্ধ** — সব ইমেইল যাচ্ছে না | 🔴 | `10-known-issues.md` |
| JWT_SECRET hardcoded | 🟠 | `10-known-issues.md` |
| `webhook.ts` ভুল DB pool | 🟠 | `10-known-issues.md` |

বিস্তারিত → **`10-known-issues.md`**

---

## 🔧 দ্রুত কমান্ড

```bash
# সার্ভার
ssh -i /opt/data/.ssh/id_host_root -p 45262 root@15.235.162.246
cd /www/wwwroot/bunon.shop

# অবস্থা দেখুন
pm2 list
pm2 logs bunon-site --lines 50

# বিল্ড + ডিপ্লয়
rm -rf dist && mkdir -p dist && chmod 777 dist
npm run build
pm2 flush bunon-site
pm2 restart bunon-site --update-env

# যাচাই
curl -s -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:5001/api/products
```

---

## 📞 কে কী করে

| বিষয় | দায়িত্ব |
|---|---|
| সাইট/সার্ভার কোড | নুপুর (Hermes Agent) |
| VPS হোস্ট | Nasrul Ahsan Naim |
| DB ক্রেডেনশিয়াল | `.env` (root-only, chmod 600) |
| Meta Ads | `meta-ads-mcp` + Graph API |

---

*নতুন সেশনে নুপুরকে বললেই `bunon-shop-ops` স্কিল থেকে পুরো অপারেশনাল কনটেক্সট পাওয়া যাবে।*
