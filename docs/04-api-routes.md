# ০৪ — API রুট

## সার্ভার-সাইড মাউন্ট

```typescript
app.use("/api",            productRoutes)
app.use("/api",            webhookRoutes)
app.use("/api",            paymentRoutes)
app.use("/api",            imageProxyRoutes)
app.use("/api",            marketingRoutes)
app.use("/api",            harvesterRoutes)
app.use("/api",            thumbsRoutes)
app.use("/api/auth",       authRoutes)
app.use("/api/blog",       blogRoutes)
app.use("/api/categories", categoriesRoutes)
app.use("/api/meta",       metaPublicRoutes)
app.use("/api/v1/sync",    browserEventGuard, capiRoutes)
app.use("/api/v1/tiktok",  requireSignedTracking, tiktokRoutes)
app.use("/api/v1/wa-analytics", waAnalyticsRoutes)
app.use("/api/recruitment",      teleSalesRoutes)
app.use("/api/admin/whatsapp",   waAutomationRoutes)
app.use("/api/admin",      adminRoutes)
app.use("/",               sitemapRoute)
```

---

## পাবলিক এন্ডপয়েন্ট

### পণ্য
```
GET  /api/products              → {ok, source, total, data:[]}
GET  /api/products?q=           → সার্চ
GET  /api/products/:id          → একটি পণ্য
GET  /api/categories            → ক্যাটাগরি লিস্ট
GET  /api/blog                  → ব্লগ লিস্ট
GET  /api/blog/:slug            → একটি ব্লগ
GET  /api/feed                  → XML (Meta Commerce catalog)
GET  /sitemap.xml               → সাইটম্যাপ
GET  /robots.txt                → robots
```

### অর্ডার ও পেমেন্ট
```
POST /api/checkout/place-order  → {ok:false, msg:"Cart or Customer details missing!"}
GET  /api/payment/bkash-callback
GET  /api/payment/paystation-callback
```

> ⚠️ `forgot-password` **`/api/` ছাড়া** মাউন্ট করা: `POST /forgot-password`

### ট্র্যাকিং
```
POST /api/track/pv              → পেভিউস (live visitor)
POST /api/track/*               → no-op sink
```

### ইউজার
```
POST /api/auth/login
POST /api/auth/register
POST /forgot-password            ← /api ছাড়া!
GET  /api/auth/profile          [JWT]
PUT  /api/auth/profile          [JWT]
GET  /api/auth/orders           [JWT]
GET  /api/auth/track-order
POST /api/auth/device-token
GET  /api/auth/google
GET  /api/auth/google/callback
```

### CAPI ও পিক্সেল
```
POST /api/v1/sync               → browserEventGuard দিয়ে সুরক্ষিত
POST /api/v1/tiktok             → requireSignedTracking (HMAC)
GET  /api/v1/wa-analytics/report
```

> ✅ **যাচাইকৃত:** অস্বীকৃত POST-এ `/api/v1/sync` → **400**, `/api/v1/tiktok` → **401**

### মার্কেটিং
```
GET  /api/unsubscribe?email=
```

### টেল-সেল্স
```
POST /api/recruitment/tele-sales
```

> ✅ **যাচাইকৃত:** → `{"success":true,"appId":"web"}`

### মেটা (পাবলিক)
```
GET  /api/meta/webhook          → 403 (যাচাই ছাড়া ব্লক)
GET  /api/meta/public
```

---

## অ্যাডমিন এন্ডপয়েন্ট

সব `/api/admin/*` → **JWT + role check** (`verifyAdmin`)
role অবশ্যই `admin` / `staff` / `super_admin`

> ✅ **যাচাইকৃত:** token ছাড়া সব → **401**

### `/me`
```
GET  /api/admin/me              → ভূমিকা + পারমিশন রিফ্রেশ
```

### Orders (16 এন্ডপয়েন্ট)
```
GET    /api/admin/orders
GET    /api/admin/orders/:id
GET    /api/admin/orders/:id/journey      → DB log + Steadfast timeline
GET    /api/admin/orders/:id/invoice
GET    /api/admin/orders/returns/analytics
GET    /api/admin/orders/returns/list
GET    /api/admin/orders/check
POST   /api/admin/orders/:id/status
POST   /api/admin/orders/bulk-status
POST   /api/admin/orders/bulk-courier
POST   /api/admin/orders/manual
GET    /api/admin/orders/export
GET    /api/admin/orders/print
```

### Products
```
GET    /api/admin/products
GET    /api/admin/products/:id
POST   /api/admin/products
PUT    /api/admin/products/:id
DELETE /api/admin/products/:id
```

### Media (WebP)
```
POST /api/admin/media/upload
```

> ✅ নতুন আপলোড স্বয়ংক্রিয়ভাবে `.webp` সংস্করণও তৈরি করে (মূল ফাইল অপরিবর্তিত থাকে)

### Categories / Blogs / Coupons (প্রতিটি ৪-৬টি)
```
GET/POST/PUT/DELETE /api/admin/categories
GET/POST/PUT/DELETE /api/admin/blogs
GET/POST/PUT/DELETE /api/admin/coupons
```

### Inventory (৮টি)
```
GET  /api/admin/inventory/grid
GET  /api/admin/inventory/low
GET  /api/admin/inventory/alerts
GET  /api/admin/inventory/logs
GET  /api/admin/inventory/history
POST /api/admin/inventory/bulk_update
POST /api/admin/inventory/move
POST /api/admin/inventory/product
```

### Analytics
```
GET /api/admin/stats/overview
GET /api/admin/stats/sales
GET /api/admin/stats/funnel
GET /api/admin/stats/live
GET /api/admin/stats/snapshots
GET /api/admin/reports/sales
GET /api/admin/reports/courier
GET /api/admin/reports/coupons
GET /api/admin/reports/returns
GET /api/admin/reports/export
GET /api/admin/profit
GET /api/admin/kpi/advanced
```

### Meta (৬টি)
```
GET /api/admin/meta/status
GET /api/admin/meta/account
GET /api/admin/meta/accounts
GET /api/admin/meta/ads
GET /api/admin/meta/kpi
GET /api/admin/meta/true-roas
```

### Couriers / Steadfast (২০টি)
```
GET    /api/admin/couriers
GET    /api/admin/couriers/status
GET    /api/admin/couriers/steadfast/balance
GET    /api/admin/couriers/steadfast/payments
GET    /api/admin/couriers/steadfast/police-stations
GET    /api/admin/couriers/steadfast/returns
GET    /api/admin/couriers/steadfast/returns/:id
POST   /api/admin/couriers/steadfast/pickup
POST   /api/admin/couriers/steadfast/return
POST   /api/admin/couriers/steadfast/webhook   ← HMAC, auth skip
```

### WhatsApp Automation
```
GET  /api/admin/whatsapp/automation/templates
PUT  /api/admin/whatsapp/automation/templates/:status
POST /api/admin/whatsapp/automation/preview
POST /api/admin/whatsapp/automation/send
GET  /api/admin/whatsapp/automation/log
GET  /api/admin/whatsapp/automation/optin
POST /api/admin/whatsapp/automation/optin
```

### Marketing
```
GET    /api/admin/marketing/abandoned-carts
DELETE /api/admin/marketing/abandoned-carts/:id
POST   /api/admin/marketing/abandoned-carts/:id/remind
POST   /api/admin/marketing/abandoned-carts/:id/offer
```

### বাকি
```
/api/admin/customers, /api/admin/audit, /api/admin/settings,
/api/admin/leave, /api/admin/tasks, /api/admin/team,
/api/admin/fraud/check, /api/admin/users
```

---

## স্ট্যাটাস কোড

| কোড | অর্থ |
|---|---|
| 200 | সফল |
| 400 | validation ব্যর্থ (যেমন CAPI ছাড়া) |
| 401 | token নেই / invalid / expired |
| 403 | role অনুমোদিত নয় |
| 404 | নেই |
| 500 | সার্ভার ত্রুটি |

---

## ⚠️ গুরুত্বপূর্ণ পিটফল

**ভুল DB pool** — দুটি pool আলাদা:
```typescript
productDbPool → bunon_shop_db    (পণ্য, ব্লগ, ইউজার)
dbPool         → bunonfabrics_dash_db  (অর্ডার, কুরিয়ার)
```
`bf_orders` শুধু `dbPool`-এ আছে। ভুল pool = `Table doesn't exist`।

**জীবিত বাগ:** `server/routes/webhook.ts:218,220,223` → `productDbPool` ব্যবহার করছে `bf_orders` এর জন্য → কাজ করে না।

---

*পরবর্তী: `05-integrations.md` →*
