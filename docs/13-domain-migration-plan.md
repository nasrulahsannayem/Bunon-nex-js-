# 🌐 ডোমেইন মাইগ্রেশন পরিকল্পনা

**সিদ্ধান্ত:** ভবিষ্যতে **`bunonfabrics.com`** হবে প্রধান/ক্যাননিকাল ডোমেইন
**তারিখ:** ০৩ অক্টোবর ২০২৬ | **স্ট্যাটাস:** পরিকল্পনা — কোনো পরিবর্তন করা হয়নি

---

## 🎯 সারসংক্ষেপ

**ভালো খবর:** ৯০% কাজ ইতিমধ্যেই হয়ে গেছে। বাকি কাজ মূলত `bunon.shop`-কে redirect বানানো আর মৃত WP কোড পরিষ্কার করা।

```
WordPress        → সম্পূর্ণ decoupling সম্পন্ন (ফাইল মুছে ফেলা, DB মুছে ফেলা)
ছবি             → ৮৯২টি সব local
DOMAIN_URL       → ✅ bunonfabrics.com (আগেই সেট)
SEO_ORIGIN       → ✅ bunonfabrics.com (আগেই সেট)
canonical        → ✅ bunonfabrics.com
bunonfabrics.com → ✅ React সাইট সার্ভ করছে, HTTP 200
```

---

## 📊 বর্তমান অবস্থার মানচিত্র

### ডোমেইন → কোথায় যায়

| ডোমেইন | vhost | গন্তব্য | অবস্থা |
|---|---|---|---|
| `bunonfabrics.com` | `/etc/nginx/conf.d/bunonfabrics.com.conf` | `127.0.0.1:5001` | ✅ সঠিক |
| `www.bunonfabrics.com` | `www.bunonfabrics.com.conf` | 301 → `bunonfabrics.com` | ✅ সঠিক |
| `bunon.shop` | `/etc/nginx/conf.d/bunon.shop.conf` | `127.0.0.1:5001` | ⚠️ redirect নেই |
| `www.bunon.shop` | — | — | ❌ নেই |

### bunonfabrics.com এর ৯টি vhost
```
bunonfabrics.com              ✅ মূল সাইট
www.bunonfabrics.com          ✅ 301 redirect
dash.bunonfabrics.com         PHP অ্যাডমিন (courier + Meta sync)
mail.bunonfabrics.com         মেইল সার্ভার
prayer.bunonfabrics.com       নামাজ অ্যাপ
iptv.bunonfabrics.com         IPTV
ielts.bunonfabrics.com        IELTS
foundation.bunonfabrics.com   Foundation
srvr-mgt.bunonfabrics.com     সার্ভার ম্যানেজমেন্ট
```
**এই ৮টি subdomain অপরিবর্তিত থাকবে** — মাইগ্রেশনে কোনো কাজ লাগবে না।

---

## 🎯 Phase 1 — মৃত WordPress কোড সরানো (সবচেয়ে জরুরি)

### কেন এটা আগে

WordPress **সম্পূর্ণ মুছে গেছে** — ফাইল নেই, DB নেই, access denied। কিন্তু কোডে এখনো WP কল আছে:

| ফাইল | কী কল করে | বাস্তবতা |
|---|---|---|
| `server/routes/blog.ts:13-14` | `STORE_URL + '/wp-json/wp/v2/posts'` | ❌ মৃত |
| `server/routes/categories.ts:15` | `STORE_URL + '/wp-json/wc/v3/products/categories'` | ❌ মৃত |
| `server/routes/products.ts:136` | `STORE_URL + '/wp-json/wc/v3/coupons'` | ❌ মৃত |
| `server/routes/harvester.ts:96` | `dash.../save_to_wp.php` | ❌ মৃত |
| `server/routes/payment.ts:380` | `dash.../remove_incomplete.php` | ❌ মৃত |

**যাচাই:**
```
https://bunonfabrics.com/api/orders/save_to_wp.php  → HTTP 200 (কিন্তু শুধু SPA shell!)
https://bunonfabrics.com/graphql                     → HTTP 200 (একই)
https://bunonfabrics.com/wp-content/                  → নেই
```

> ⚠️ **২০০ মানে সফল না** — nginx SPA catch-all প্রতিটি পাথেই 200 দেয়। আসলে ফাইল নেই।

### কী করতে হবে

**১. `blog.ts`** — WP fetch ব্লক বাদ দিয়ে সরাসরি `bunon_blogs` টেবিল থেকে পড়ুন (ইতিমধ্যেই ন্যাটিভ ব্লগ আছে, ১০০টি)

**২. `categories.ts`** — `bunon_categories` থেকে পড়ুন (৩৪টি আছে)

**৩. `products.ts`** — WP coupon বাদ দিয়ে `bunon_coupons` ব্যবহার করুন

**৪. `harvester.ts` + `payment.ts`** — মৃত PHP forward সরান

### সুবিধা
- ব্রাউজার কোনো সময় মৃত endpoint-এ ৮ সেকেন্ড অপেক্ষা করে না
- `blog.ts`-এ প্রতিটি রিকোয়েস্টে একটা নেটওয়ার্ক টাইমআউট যাচ্ছে

---

## 🎯 Phase 2 — bunon.shop → 301 redirect

### বর্তমান
```
bunon.shop  ──────►  127.0.0.1:5001  (আলাদা সাইট হিসেবে serve)
```

### লক্ষ্য
```
bunon.shop  ──────►  301  ──────►  bunonfabrics.com
```

### nginx যা যোগ করতে হবে
```nginx
# /etc/nginx/conf.d/bunon.shop.conf এই server block-এ location / এর বদলে:
location / {
    return 301 https://bunonfabrics.com$request_uri;
}

# এছাড়া /image/ ও /uploads/ block-ও redirect করতে হবে:
location ^~ /image/   { return 301 https://bunonfabrics.com$request_uri; }
location ^~ /uploads/ { return 301 https://bunonfabrics.com$request_uri; }
```

### ⚠️ redirect করার আগে যা যাচাই করতে হবে

```
১. bunon.shop-এ কোনো ইউজার localStorage-based state আছে কি?   → পণ্য/কার্ট localStorage-এ, ডোমেইন বদলালে হারাবে (কোনো ক্ষতি নেই, নতুন করে build হবে)
২. Meta Pixel-এ bunon.shop URL আছে কি?                          → যাচাই করতে হবে
৩. Google Search Console-এ দুটো ডোমেইনই আছে?                  → property আছে কি
৪. বাইরের কোথাও bunon.shop লিংক আছে? (ব্লগ, Meta, ফেসবুক)    → খুঁজতে হবে
৫. ads.txt আছে?  → adimg ও ads.txt কোথায় serve হয়
```

### বিকল্প: redirect না করে রাখা
SEO split হবে, কিন্তু কোনো ঝুঁকি নেই। আপনি সিদ্ধান্ত নেবেন।

---

## 🎯 Phase 3 — SEO সম্পূর্ণ নিশ্চয়তা

### যা যাচাই করতে হবে

| বিষয় | বর্তমান অবস্থা | কাজ |
|---|---|---|
| canonical | `https://bunonfabrics.com/` ✅ | শুধু নিশ্চিত করা |
| sitemap.xml | ৯৪ KB তৈরি হচ্ছে ✅ | bunonfabrics.com-এ serve করা |
| robots.txt | ৪৪৩ বাইট ✅ | Cloudflare purge দরকার |
| OG/Twitter image | index.html-এ আছে ✅ | — |
| JSON-LD | সার্ভার-সাইড inject করে ✅ | — |

### Cloudflare সমস্যা
```
মনে আছে: CF purge_cache-এ 401 দেয় (R2-scoped token)
সমাধান: cache-bust বা TTL অপেক্ষা
```

---

## 🎯 Phase 4 — Meta / Google / OAuth

### Meta Pixel
```
Pixel ID: 887459306920960 (ডোমেইন-স্বাধীন) ✅
কিন্তু: Meta Events Manager-এ "Allowed domains" যাচাই
App Review pending থাকলে messenger domain ঠিক করতে হবে
```

### Google OAuth
```
GOOGLE_OAUTH_REDIRECT_URI = https://bunonfabrics.com/api/auth/google/callback ✅
Google Cloud Console-এ Authorized redirect URI ঠিক আছে কি → যাচাই
```

### PayStation
```
STEADFAST_WEBHOOK_URL → dash.bunonfabrics.com (subdomain, অপরিবর্তিত) ✅
IPN URL → https://bunon.shop/api/payment/paystation-ipn
```
> 🔴 **সিদ্ধান্ত দিন:** IPN URL `bunonfabrics.com` করবেন, নাকি `bunon.shop` রাখবেন?
> দুটোই কাজ করবে (একই সার্ভার)। যেহেতু primary domain bunonfabrics.com হবে, সেটিই সুস্থ।

---

## 🎯 Phase 5 — কোড হার্ডকোড সরানো (ঐচ্ছিক কিন্তু দরকারি)

### পরিসংখ্যান
```
server/       ৪৬টি জায়গায় bunonfabrics.com
src/          ২৬টি জায়গায়
index.html     ৫টি
.env           ৫টি
```

### `.env`-এর ৫টি (এগুলো ঠিক আছে ✅)
```
VITE_WOOCOMMERCE_URL   → WP মৃত, সরানো যাবে
DOMAIN_URL             → ✅ bunonfabrics.com
SEO_ORIGIN             → ✅ bunonfabrics.com
GOOGLE_OAUTH_REDIRECT_URI → ✅ bunonfabrics.com
STEADFAST_WEBHOOK_URL  → dash.bunonfabrics.com ✅
```

### সবচেয়ে ভালো সমাধান
সব জায়গায় `process.env.DOMAIN_URL` ব্যবহার করুন। তাহলে ডোমেইন বদলাতে **শুধু ১টি env var** বদলাতে হবে — ঠিক যেভাবে Phase 1.5-এ (২৭ আগস্ট) করা হয়েছিল।

---

## 📋 এক্সিকিউশন প্ল্যান

| ধাপ | কাজ | ঝুঁকি | সময় |
|---|---|---|---|
| **P0** | Phase 1 — মৃত WP কোড সরানো | 🟡 মাঝারি | ১–২ ঘণ্টা |
| **P1** | PayStation IPN URL ঠিক করা | 🟢 কম | ৫ মিনিট |
| **P2** | bunon.shop ৩০১ redirect | 🟡 SEO ঝুঁকি | ৩০ মিনিট |
| **P3** | Cloudflare purge | 🟢 কম | ১৫ মিনিট |
| **P4** | Meta/GSC ডোমেইন verify | 🟢 কম | ৩০ মিনিট |
| **P5** | কোড হার্ডকোড → env var | 🟢 কম | ২ ঘণ্টা |

**P0 সবার আগে** — কারণ মৃত WP কল প্রতিটি রিকোয়েস্টে ৮ সেকেন্ড timeout যাচ্ছে।

---

## 🔄 রোলব্যাক

প্রতিটি ধাপের আগে:
```bash
# কোড
cp server/routes/blog.ts server/routes/blog.ts.bak_dom_<ts>

# nginx
cp /etc/nginx/conf.d/bunon.shop.conf /etc/nginx/conf.d/bunon.shop.conf.bak_dom_<ts>

# env
cp .env .env.bak_dom_<ts>
```

---

## ❓ আপনার সিদ্ধান্ত দরকার

**১. `bunon.shop` কী হবে?**
- (ক) ৩০১ redirect → `bunonfabrics.com` **(সুপারিশ — SEO এক জায়গায়)**
- (খ) আলাদা সাইট থাকবে
- (গ) বন্ধ

**২. PayStation IPN URL কোন ডোমেইনে?**
- `bunonfabrics.com/api/payment/paystation-ipn` **(সুপারিশ)**

**৩. ৮টি subdomain অপরিবর্তিত থাকবে তো?** — `dash`, `mail`, `prayer`, `iptv`, `ielts`, `foundation`, `srvr-mgt`, `www`

---

*এই প্ল্যানের সব তথ্য বাস্তব কমান্ড দিয়ে যাচাই করা (curl, MySQL, nginx config পড়া)। কোনো পরিবর্তন করা হয়নি।*
