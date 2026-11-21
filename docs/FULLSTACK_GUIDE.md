# Bunon.shop — Full-Stack Architecture & Operations Guide
**Project:** `/www/wwwroot/bunon.shop` | **Runtime:** PM2 `bunon-site` on port 5001  
**Last updated:** 2026-11-16 | **Author:** Nupur AI (Claude Code assisted)

---

## 1. What This Is

Bunon.shop is a **multi-domain e-commerce platform** selling sarees/fabrics in Bangladesh. It serves two live domains from the same codebase:
- `bunonfabrics.com` (canonical primary)
- `bunon.shop` (alias, de-duped via `rel=canonical`)

Tech stack: **React 19 + Vite 6** (frontend) / **Express + TypeScript** (backend) / **MySQL** (orders + products) / **Redis** (caching) / **PM2** (process manager).

Everything runs on VPS `15.235.162.246` (Ubuntu 26.04, aaPanel nginx).

---

## 2. Directory Map (what lives where)

```
/www/wwwroot/bunon.shop/
├── server.ts                  ← Express app entry (1360 lines)
├── package.json               ← React+Vite+Express+TS+Tailwind+Zustand stack
├── tsconfig.json
├── vite.config.ts             ← html-transform plugin replaces %VITE_*% at build time
├── ecosystem.config.cjs       ← PM2 config for bunon-site (port 5001)
├── .env                       ← Runtime secrets (do NOT commit)
│
├── src/                       ← React SPA source
│   ├── pages/                 ← Route components (Home, Shop, ProductDetail, Checkout, admin/*)
│   ├── components/            ← Shared UI (cart/, products/, admin/, marketing/, layout/)
│   └── lib/                   ← woocommerce.ts, store.ts (zustand cart), tracking helpers
│
├── server/                    ← Express backend
│   ├── db.ts                  ← Two MySQL pools: productDbPool + dbPool (dash DB)
│   ├── store.ts               ← Redis cache sync layer
│   ├── routes/                ← All API endpoints
│   │   ├── products.ts        ← Product catalog API
│   │   ├── payment.ts         ← bKash + PayStation IPN callbacks
│   │   ├── capi.ts            ← Meta Conversions API (server-side)
│   │   ├── webhook.ts         ← Meta/Facebook webhook receiver
│   │   ├── tele-sales.ts      ← Telesales CRM routes
│   │   ├── admin/             ← Admin panel APIs (orders, products, KPI, WhatsApp automation...)
│   │   └── ...
│   └── services/              ← Background jobs
│       ├── email.ts           ← Transactional emails via local Postfix
│       ├── metaPurchase.ts    ← Server-owned Purchase events → Meta CAPI
│       ├── redisClient.ts     ← Redis wrapper
│       ├── waStatusWatcher.ts ← WhatsApp order-status cron
│       └── notification.ts    ← Push notification cron
│
├── dist/                      ← Built output (vite build + esbuild server bundle)
├── public/                    ← Static assets served by nginx directly
└── docs/                      ← Project documentation
```

---

## 3. Build & Deploy Pipeline

### Local dev (on VPS)
```bash
cd /www/wwwroot/bunon.shop
npm run dev          # starts tsx hot-reload server on :5001 (dev only)
npm run build        # vite build (SPA) + esbuild bundle (server.ts → dist/server.cjs)
npm run start        # node dist/server.cjs  (production)
```

### PM2 lifecycle (production)
```bash
pm2 start ecosystem.config.cjs   # or: pm2 start bunon-site
pm2 restart bunon-site           # after code changes
pm2 logs bunon-site --lines 100  # tail logs
```

### Deploy shortcut (commit → build → restart)
```bash
cd /www/wwwroot/bunon.shop
git pull origin main
npm run build
pm2 restart bunon-site
```

**NOTE:** The `.bak_*` files in `src/` and `server/` are deployment snapshots — **do not delete** them until you decide on a backup strategy. They total ~600 files and slow greps.

---

## 4. Environment Variables (`.env`)

| Var | Purpose | Default |
|-----|---------|---------|
| `PORT` | Backend listen port | `5001` |
| `NODE_ENV` | `production` / `development` | — |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | Product DB pool (`bunon_shop_db`) | — |
| `DASH_DB_HOST`, `DASH_DB_PORT`, `DASH_DB_USER`, `DASH_DB_PASSWORD`, `DASH_DB_NAME` | Dashboard DB pool (`bunonfabrics_dash_db`) | — |
| `WP_DB_*` | Legacy WordPress DB (read-only) | — |
| `SITE_ORIGIN` or `DOMAIN_URL` | Canonical site URL for sitemaps, og:url, email links | — |
| `VITE_META_PIXEL_ID` | Injected into `index.html` as `%VITE_META_PIXEL_ID%` | `887459306920960` |
| `VITE_GA4_ID` | Google Analytics 4 tag | `G-Y4KWR202X6` |
| `VITE_GADS_TAG` | Google Ads conversion | `AW-16837869483` |
| `VITE_TIKTOK_PIXEL_ID` | TikTok pixel | `CU40Q4JC77UC5BF3IBNG` |
| `META_CAPI_TOKEN` | Meta CAPI access token | — |
| `BKASH_USERNAME` | bKash merchant ID | — |
| `PAYSTATION_MERCHANT_ID` | PayStation merchant ID | — |
| `GOOGLE_CLIENT_ID` | OAuth for mobile app login | — |
| `MAIL_HOST`, `MAIL_PORT` | Local Postfix relay | `127.0.0.1:587` |
| `IMAGE_PROXY_HOSTS` | Comma-separated SSRF allowlist for `/api/image-proxy` | — *(see §7)* |

**CRITICAL:** `SEO_ORIGIN` and `DOMAIN_URL` both resolve to the same thing. Consolidating on `SITE_ORIGIN` is the #1 multi-domain readiness task (see MASTER_AUDIT.md Phase 1.8).

---

## 5. Database Schema (key tables)

Two databases, two pools — purpose-built separation:

### `bunon_shop_db` (productDB pool — order + product data)
Core tables:
- `bf_products` — product catalogue (synced from WooCommerce)
- `bf_orders` — customer orders (COD + payment-gateway settled)
- `bf_order_items` — line items per order
- `bf_customers` — customer profiles
- `bf_categories` — product categories
- `bf_coupons` — discount codes
- `bf_newsletter_subscribers`
- `bf_wa_lead_queue` — WhatsApp outreach queue
- `bf_meta_purchase_log` — CAPI purchase ledger (idempotency)
- `bf_admin_users` — admin team accounts

### `bunonfabrics_dash_db` (dashDB pool — analytics & CMS)
Core tables:
- `kpi_daily` — daily sales summary
- `visitors`, `events` — tracking raw data
- `cms_pages`, `cms_posts` — blog/content

**Accessing via CLI:**
```bash
mysql -u bunon_shop_db -p bunon_shop_db -e "SELECT * FROM bf_orders LIMIT 5;"
mysql -u bunonfabrics_dash_db -p bunonfabrics_dash_db -e "SELECT * FROM kpi_daily ORDER BY date DESC LIMIT 5;"
```

---

## 6. API Surface (public + admin)

### Public routes
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/products` | GET | Product catalogue with filters |
| `/api/categories` | GET | Category tree |
| `/api/blog` | GET | Blog posts list |
| `/api/blog/{slug}` | GET | Single post (SSR for crawlers) |
| `/api/payment/bkash/*` | POST | bKash payment flow |
| `/api/payment/paystation/*` | POST | PayStation IPN callback |
| `/api/image-proxy` | GET | Image proxy with SSRF allowlist |
| `/api/thumbs` | GET | On-the-fly image resizing |
| `/api/v1/sync` | POST | Meta CAPI endpoint (signed) |
| `/api/track/capi` | POST | Alternative CAPI path |
| `/api/webhook/meta` | POST | Meta pixel/webhook receiver |
| `/api/tiktok/events` | POST | TikTok pixel events |
| `/sitemap.xml` | GET | Dynamic sitemap (SEO) |
| `/robots.txt` | GET | SEO robots directive |
| `/api/llms.txt` | GET | LLM-focused documentation route |

### Admin routes (require JWT auth)
| Endpoint | Prefix | Purpose |
|----------|--------|---------|
| `/api/admin/orders` | GET/PUT | Order management |
| `/api/admin/products` | CRUD | Product CRUD |
| `/api/admin/customers` | GET | Customer list |
| `/api/admin/kpi` | GET | Dashboard KPIs |
| `/api/admin/profit` | GET | Profit & loss |
| `/api/admin/team` | CRUD | Team member management |
| `/api/admin/settings` | GET/PUT | Site settings |
| `/api/admin/wa-automation` | CRUD | WhatsApp broadcast automation |
| `/api/admin/omnichannel` | GET | Unified inbox |
| `/api/admin/audit` | GET | Audit log |
| `/api/admin/clarity` | GET | Microsoft Clarity insights |

---

## 7. Tracking Architecture (Pixel + CAPI + GA4 + TikTok)

This is the most complex subsystem. Understand it before modifying any event code.

### Dual-pipeline model
Every commercial event fires **simultaneously**:
1. **Browser** → `window.fbq('track', 'EventName', data)` + `gtag()` + TikTok pixel
2. **Server** → Signed POST to Meta CAPI via `/api/v1/sync`

Both use the **same `event_id`** (`event_${Date.now()}_${random}`) so Meta deduplicates automatically.

### Anti-fraud design
- `/api/v1/sync` requires a HMAC signature (`requireSignedTracking`)
- Browser-side `Purchase` events are **downgraded to ViewContent** — only the server pipeline sends real revenue numbers
- Idempotency table (`bf_meta_purchase_log`) prevents double-counting on retry

### Event map
| Event | Browser | Server | Dedupe key |
|-------|---------|--------|------------|
| PageView | ✅ debounced (350ms) | ✅ | Same eventId |
| ViewContent | ✅ | ✅ | Same eventId |
| AddToCart | ✅ | ✅ | Same eventId |
| InitiateCheckout | ✅ | ✅ | Same eventId |
| Purchase | ⚠️ downgraded to ViewContent | ✅ server-only | Same eventId |
| Lead | ✅ (raw fbq) | ❌ | n/a |

### Known bugs (all fixed 2026-10-04)
- `fbp`/`fbc` cookies were being stripped server-side → fixed by retaining them
- Cookie-read timing race (event fired before cookie set) → fixed with wait+retry ≤6s
- Invalid email `"N/A"` sent on every event → now filtered pre-send
- Website Purchase → Meta was completely missing → new `metaPurchase.ts` added

### Current EMQ (Event Match Quality) gap
Email: 0.71%, Phone: 2.12%, External ID: 0.52% — funnel events fire **before** checkout data is known. Fix: send `ph`, `fn`, `ln`, `external_id` on cart/add-to-cart once available → expected **+5-7 EMQ points**.

---

## 8. Multi-Domain Readiness Status

**Current state:** ~110 hardcoded domain literals across 41 files block zero-code redeployment.

### Hard blockers (Phase 1)
1. **`imageProxy.ts` SSRF allowlist** — new domain images return 400; must be env-driven
2. **`SeoHead.tsx:6`** — `export const SITE_ORIGIN = 'https://bunonfabrics.com'` hardcoded
3. **`LandingSare.tsx`** — 22 WordPress image URLs hardcoded to old domain
4. **`email.ts`** — 20 absolute URLs linking back to old domain
5. **`payment.ts`** — bKash/PayStation callback hosts whitelisted per-domain

### nginx configuration pattern (for new domains)
```nginx
server {
    listen 80;
    server_name newdomain.com www.newdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name newdomain.com www.newdomain.com;
    root /www/wwwroot/bunon.shop;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
        proxy_pass http://127.0.0.1:5001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

Canonical policy: **never 301 between domains.** Serve 200 on all, use `rel=canonical` pointing to primary domain. This lets each domain rank independently while consolidating SEO signal.

---

## 9. Key Files Cheat-Sheet

| File | Lines | What it does | Edit with caution |
|------|-------|--------------|-------------------|
| `server.ts` | 1360 | Main Express app, all route registrations, crawler SSR | High — breaking change risk |
| `server/db.ts` | 30 | Two MySQL connection pools | Low — just credentials |
| `server/routes/capi.ts` | ~200 | Meta CAPI endpoint | Med — tracking logic |
| `server/routes/payment.ts` | ~800 | Payment gateways | High — money movement |
| `server/services/metaPurchase.ts` | ~150 | Server-owned Purchase events | Med — add revenue attribution |
| `src/components/SeoHead.tsx` | ~80 | Client-side SEO tags | Low — just the constant |
| `src/pages/ProductDetail.tsx` | ~1000 | Main product page + all Pixel events | High — core UX + tracking |
| `vite.config.ts` | ~100 | Build config, chunk splitting, html-transform | Med — affects bundle size |
| `.env` | ~50 | All runtime secrets | **NEVER commit** |

---

## 10. Common Ops Commands

```bash
# Check if server is healthy
curl -s http://127.0.0.1:5001/api/products?limit=1 | head -c 200

# Tail production logs
pm2 logs bunon-site --lines 50

# Restart after code change
cd /www/wwwroot/bunon.shop && npm run build && pm2 restart bunon-site

# Check MySQL connectivity
mysql -u bunon_shop_db -p bunon_shop_db -e "SHOW TABLES;"

# Rotate log files (if filling disk)
pm2 delete bunon-site && pm2 start ecosystem.config.cjs

# Backup current deployable state
cp -r /www/wwwroot/bunon.shop /www/wwwroot/bunon.shop.bak_$(date +%Y%m%d_%H%M%S)
```

---

## 11. Next Logical Steps (Prioritised)

1. **Fix image-proxy allowlist** (Phase 1.1) — one-line env var change, removes hard blocker
2. **Fix `SeoHead.tsx` SITE_ORIGIN** (Phase 1.2) — read from `import.meta.env.VITE_SITE_ORIGIN`
3. **Consolidate env vars** → single `SITE_ORIGIN` replacing `SEO_ORIGIN`/`DOMAIN_URL`/`PUBLIC_BASE_URL`
4. **Run full deploy test** to a staging subdomain (`staging.bunonfabrics.com`) using a fresh `.env` to verify Phase 1 fixes work end-to-end

---

## 12. Secrets & Security Notes

- **Never push `.env` to git.** The repo already has it in `.gitignore`.
- Credential files (`firebase-service-account.json`, `nupur-ai-engine-*.json`) are in web root but NOT served (fallback returns HTML, `.env` returns 404). Move them out of web root when convenient.
- Cloudflare API token was exposed in chat logs — rotate it via Cloudflare dashboard.
- Meta App Secret and WooCommerce keys were printed to terminal during debugging — rotate all exposed secrets.
- HTTPS is enforced via nginx; aaPanel manages SSL certs via Let's Encrypt.
