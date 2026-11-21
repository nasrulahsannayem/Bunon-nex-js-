# ০১ — সিস্টেম আর্কিটেকচার

## স্ট্যাক ও লেয়ার

```
┌──────────────────────────────────────────────────────────────┐
│  ক্লায়েন্ট                                                    │
│  ├─ ব্রাউজার (React SPA)                                      │
│  └─ Android অ্যাপ (Capacitor)                                 │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS
┌───────────────────────────▼──────────────────────────────────┐
│  Cloudflare                                                   │
│  ├─ DNS + প্রক্সি                                              │
│  ├─ SSL (edge)                                                │
│  └─ ক্যাশ (assets 1yr immutable, HTML no-store)                │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  nginx  (/etc/nginx/conf.d/bunon.shop.conf)                   │
│  ├─ :80  → 301 redirect to HTTPS                               │
│  ├─ /image/*   → disk alias, 30d cache                        │
│  ├─ /uploads/* → disk alias, 30d cache                        │
│  ├─ *.map|cjs|ts|zip|env|sql|bak|pem|key → 404                 │
│  └─ /*  → proxy_pass 127.0.0.1:5001                           │
└───────────────────────────┬──────────────────────────────────┘
                            │
┌───────────────────────────▼──────────────────────────────────┐
│  Node.js / Express   (PM2: bunon-site, port 5001)             │
│  ├─ helmet, cors, rate-limit                                  │
│  ├─ Router mounts (/api, /api/admin, /api/auth ...)            │
│  ├─ Static serving (dist/) + SEO crawler meta injection       │
│  └─ SPA catch-all fallback                                    │
└──────┬──────────────┬──────────────┬──────────────┬─────────┘
       │              │              │              │
  ┌────▼────┐   ┌─────▼─────┐  ┌─────▼─────┐  ┌─────▼─────┐
  │  Redis   │   │ MySQL     │  │  MySQL    │  │  ডিস্ক    │
  │  cache   │   │ shop_db   │  │  dash_db  │  │  images   │
  │  :6379   │   │ product   │  │  orders   │  │  public/  │
  └─────────┘   └───────────┘  └───────────┘  └───────────┘
```

---

## ফাইল কাঠামো

```
/www/wwwroot/bunon.shop/
├── server.ts                 ← এন্ট্রি পয়েন্ট (472 লাইন)
├── server/
│   ├── db.ts                 ← ২টি MySQL pool
│   ├── store.ts              ← পণ্য hydration + Redis cache
│   ├── middleware/auth.ts    ← verifyAdmin + RBAC
│   ├── routes/               ← ৩১টি route file
│   │   ├── admin/            ← ২৩টি admin router
│   │   └── *.ts              ← ৮টি public router
│   └── services/             ← ১৯টি service (email, telegram, courier...)
├── src/
│   ├── App.tsx               ← ৪৭টি Route (260 লাইন)
│   ├── pages/                ← ২২টি পাবলিক পেইজ
│   │   └── admin/            ← ২৫টি admin পেইজ
│   ├── components/           ← ২৩টি কম্পোনেন্ট
│   └── lib/                  ← store, utils, woocommerce
├── public/
│   ├── image/                ← ১৫টি slug dir, static
│   └── uploads/              ← ৯৩৫টি ফাইল
├── dist/                     ← বিল্ড আউটপুট (62 assets)
├── ecosystem.config.cjs      ← PM2 config
├── index.html                ← ট্র্যাকিং স্ক্রিপ্ট
└── .env                      ← সব ক্রেডেনশিয়াল (chmod 600)
```

---

## ডেটাবেস — দুটি আলাদা

### `bunon_shop_db` (পণ্য/ব্লগ/ইউজার)
| টেবিল | সারি | ভূমিকা |
|---|---|---|
| `bunon_products` | 368 | **লাইভ সোর্স** — storefront এখান থেকে পড়ে |
| `wc_products_full` | 367 | legacy fallback (WordPress sync) |
| `wc_products` | 373 | legacy |
| `bunon_categories` | 34 | ন্যাটিভ ক্যাটাগরি |
| `bunon_blogs` | 100 | ন্যাটিভ ব্লগ |
| `bunon_users` | 24 | ইউজার + স্টাফ + অ্যাডমিন |
| `bunon_human_examples` | 605 | AI training data |
| `wc_marketing_emails` | 28 | নিউজলেটার সাবস্ক্রাইবার |
| `wc_cart_recovery_queue` | 7 | কার্ট রিকভারি কিউ |
| `bunon_inbox_log` | 1,599 | Messenger AI লগ |
| `bunon_audit_logs` | 56 | অ্যাডমিন অ্যাকশন লগ |

### `bunonfabrics_dash_db` (অর্ডার)
| টেবিল | সারি | ভূমিকা |
|---|---|---|
| `bf_orders` | **7,334** | সব অর্ডার |
| `bf_order_items` | 13,109 | অর্ডার আইটেম |
| `bf_notifications` | 18,760 | ইনবক্স নোটিফিকেশন |
| `bf_tracking_logs` | 8,688 | কুরিয়ার ট্র্যাকিং |
| `meta_kpi_breakdowns` | 26,695 | Meta KPI ডেটা |
| `bf_wa_messages` | 619 | WhatsApp মেসেজ |

> ⚠️ **দুটি ডেটাবেস আলাদা pool ব্যবহার করে।** ভুল pool ব্যবহার করলে `Table doesn't exist` এরর।
> - `productDbPool` → `bunon_shop_db`
> - `dbPool` → `bunonfabrics_dash_db`

---

## পণ্য ডেটা ফ্লো

```
ব্রাউজার → /api/products
              ↓
        server/store.ts
              ↓
    ┌─────────┴──────────┐
    │ Redis "products"?  │──হ্যাঁ → return cached
    └─────────┬──────────┘
          না / মিস
              ↓
    SELECT * FROM bunon_products WHERE status='publish'
              ↓
    বসা থাকলে → wc_products_full (fallback)
              ↓
    Image hydration:
      local_images আছে? → DOMAIN_URL + path
      না? → images JSON
      না? → thumbnail
              ↓
    Dual-price normalize:
      sale_price < regular_price ? sale_price : regular_price
              ↓
    Redis-এ cache (products key) → JSON response
```

**দুটি সোর্স টেবিলের সম্পর্ক:** `bunon_products` = `wc_products_full` কে কপি করে নতুন ID দিয়ে বানানো (SKU মিলে 366/367)। এখন **`bunon_products` authoritative**।

---

## ডোমেইন সম্পর্ক

| ডোমেইন | ভূমিকা |
|---|---|
| `bunon.shop` | **প্রধান** — এই অ্যাপ সার্ভ করে |
| `bunonfabrics.com` | একই অ্যাপ (legacy, nginx → 5001) |
| `www.bunon.shop` | redirect |
| `dash.bunonfabrics.com` | আলাদা PHP অ্যাডমিন (courier/Meta sync) |

**WordPress decoupling সম্পন্ন:** ৮৯২টি ছবির সবই local, WP থেকে কোনো রেফারেন্স নেই।

---

## স্ট্যাটিক অ্যাসেট

```
public/image/<slug>/     ← নতুন পণ্যের ছবি (slug ভিত্তিক)
public/uploads/products/ ← legacy পণ্যের ছবি (product id ভিত্তিক)
```
দুটোই nginx alias + Express static দুভাবে সার্ভ হয় (30 দিন cache)।

**নিয়ম:** নতুন ছবি → `local_images` JSON অবশ্যই `"/image/..."` দিয়ে শুরু হতে হবে (slash দিয়ে)।

---

## ক্যাশ কৌশল (nginx)

| ফাইল টাইপ | Cache-Control |
|---|---|
| js/css/img/font/video | `public, max-age=31536000, immutable` |
| HTML/API/JSON | `no-cache, no-store, must-revalidate` |
| /image/*, /uploads/* | `public, max-age=2592000` |

`proxy_hide_header Cache-Control` ব্যবহার করা — যাতে একটাই cache header যায় (Node ও nginx দুটোই দিলে সমস্যা)।

---

## PM2 প্রসেস

| নাম | পোর্ট | কী চালায় |
|---|---|---|
| `bunon-site` | 5001 | bunon.shop মূল সাইট |
| `bunon-webhook` | — | Messenger agent (container path) |
| `bunon-vision` | — | vision.nasrulahsan.com |
| `bunon-tv` | — | iptv.bunonfabrics.com |
| `wa-bridge` | — | WhatsApp bridge |
| `nupur-bridge` | — | AI gateway |
| `ielts-server`, `dearsaba`, `ebook-admin`, `kaptai-eco-valley-live`, `nasrul` | — | অন্য সাইট |

---

## নিরাপত্তা লেয়ার

```
helmet()              → security headers
cors({origin:'*'})    → ⚠️ সব origin অনুমোদিত
express-rate-limit    → /api রুটে
HMAC signing          → CAPI + TikTok Events API
Steadfast webhook HMAC→ কুরিয়ার webhook যাচাই
JWT (30 দিন)         → admin + user session
bcrypt                → পাসওয়ার্ড hash
nginx denylist        → .map/.cjs/.env/.sql/.pem প্রত্যাশ্যন্ত 404
```

---

*পরবর্তী: `02-pages-routes.md` →*
