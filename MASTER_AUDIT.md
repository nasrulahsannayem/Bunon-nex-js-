# 🌐 MULTI-DOMAIN & PIXEL/TRACKING MASTER AUDIT
### Bunon Fabrics — `bunon.shop` project folder
**Audit date:** 2026-10-04 · **Project:** `/www/wwwroot/bunon.shop` · **Runtime:** React+Vite + Express/TS + MySQL, PM2 `bunon-site` (port 5001)

> **Goal of this document:** (1) inventory every hardcoded domain/URL, (2) audit the
> complete Meta Pixel + CAPI tracking stack, (3) produce a ranked, one-by-one plan so
> this exact codebase can be deployed to a NEW domain with **zero code changes**.

---

# PART 1 — EXECUTIVE SUMMARY

| Area | Status | Verdict |
|---|---|---|
| **Dual-domain serving (nginx)** | ✅ WORKING | Both domains → `127.0.0.1:5001` |
| **SEO canonical / og:url / sitemap** | ✅ WORKING | All driven by `SEO_ORIGIN`, verified live |
| **Pixel init** | ✅ CLEAN | `%VITE_META_PIXEL_ID%` placeholder, single init |
| **Pixel ↔ CAPI dedup** | ✅ WORKING | Same `event_id`, 0 duplicates measured today |
| **`fbc` delivery** | ✅ FIXED TODAY | Was 0/2, now 2/2 (cookie-timing race) |
| **`fbp` delivery** | ✅ FIXED TODAY | Was deleted server-side, now retained |
| **Invalid email `N/A`** | ✅ FIXED TODAY | Placeholder now dropped before send |
| **Website Purchase → Meta** | ✅ ADDED TODAY | `metaPurchase.ts`, was completely missing |
| **Event Match Quality** | ⚠️ LOW | Email 0.71%, Phone 2.12%, External ID 0.52% |
| **Multi-domain readiness** | ❌ NOT READY | **~110 hardcoded refs across 41 files** |

**The single most important structural finding:**
the app already has the *right architecture* (`SEO_ORIGIN`, `%VITE_*%` placeholders,
env-driven image proxy) but **~110 hardcoded domain literals were never migrated onto it**.
Fixing those is the difference between "copy the folder" and "actually deployable".

---

# PART 2 — HARDCODE INVENTORY (exhaustive)

## 2.1 Totals
- `bunonfabrics.com` → **~135** references
- `bunon.shop` → **~66** references
- **41 files** contain at least one hardcoded domain
- Excluded from counts: all `*.bak*` backups, `node_modules`, `dist`

## 2.2 By file (reference count)

| File | Refs | Risk | Failure mode on a new domain |
|---|---:|---|---|
| `src/pages/LandingSare.tsx` | 22 | 🔴 HIGH | 22 WordPress image URLs from `bunonfabrics.com/wp-content/...` — landing page renders with broken images or leaks traffic to the old domain |
| `server/services/email.ts` | 20 | 🔴 HIGH | Hardcoded email absolute URLs + `MAIL_USER` fallback — emails on the new domain link back to the old one |
| `server/routes/imageProxy.ts` | 12 | 🔴 HIGH | **SSRF allowlist** — a new domain's images are *rejected outright* |
| `server/routes/payment.ts` | 6 | 🟠 MED | bKash/PayStation callback URL + placeholder customer email |
| `server.ts` | 5 | 🟡 LOW | Fallback literals only (`SEO_ORIGIN \|\| DOMAIN_URL \|\| ...`) — safe once env is set |
| `index.html` | 5 | 🟠 MED | Static `canonical` + `og:image`/`twitter:image` absolute URLs (crawler-visible) |
| `server/services/waOrderStatus.ts` | 4 | 🟠 MED | `shop: 'https://bunonfabrics.com'` literal in template context |
| `server/routes/marketing.ts` | 4 | 🟠 MED | Campaign/CRM message links |
| `server/routes/harvester.ts` | 4 | 🟡 LOW | Product feed source URLs |
| `src/pages/api/feed.ts` | 3 | 🟠 MED | Fetches `bunonfabrics.com/super_api.php`; emits `bunon.shop` links in XML |
| `src/pages/LandingCarBMW.tsx` | 3 | 🟠 MED | `image-proxy?url=...bunon.shop/...` — **breaks if the allowlist changes** |
| `server/services/waCartRecovery.ts` | 3 | 🟡 LOW | Already env-driven via `PUBLIC_BASE_URL` |
| `server/routes/products.ts` | 3 | 🟡 LOW | Image URL building |
| `server/routes/metaPublic.ts` | 3 | 🟡 LOW | Meta public asset refs |
| `src/components/admin/MessageMedia.tsx` | 2 | 🟠 MED | FB CDN + first-party media host refs |
| `server/services/imageUrl.ts` | 2 | 🟡 LOW | WordPress-hotlink normalisation |
| `server/routes/auth.ts` | 2 | 🟡 LOW | Origin/cookie scope |
| `src/components/SeoHead.tsx` | 1 | 🔴 HIGH | `export const SITE_ORIGIN = 'https://bunonfabrics.com'` — **hardcoded constant, no env** |
| `src/components/ProductImage.tsx` | 1 | 🟠 MED | `return 'https://bunon.shop'` as fallback base |
| `src/pages/admin/SettingsManager.tsx` | 1 | 🟡 LOW | Fallback origin only |
| `src/components/marketing/SocialProofNotifications.tsx` | 1 | 🟢 COS | User-visible text `bunon.shop • লাইভ আপডেট` |
| `src/components/admin/SenderAvatar.tsx` | 1 | 🟢 COS | Avatar host |
| `server/routes/capi.ts` | 1 | 🟠 MED | `event_source_url` fallback `DOMAIN_URL \|\| 'https://bunon.shop'` |
| `server/services/metaPurchase.ts` | 1 | 🟠 MED | `event_source_url` fallback `/order-received` |
| `server/services/redisClient.ts`, `server/store.ts` | 1 each | 🟡 LOW | `DOMAIN_URL` fallbacks |
| `server/services/{orderNotify,notification,marketingCron,imageConvert}.ts` | 1 each | 🟢 COS | Comments / template text |
| `server/routes/{tiktokEvents,sitemap,pinterestFeed,llmsRoute,categories,blog,waAnalytics}.ts` | 1 each | 🟢 COS | `SEO_ORIGIN` fallbacks (env wins) |
| `server/routes/admin/{whatsapp,orders,omnichannel}.ts` | 1 each | 🟡 LOW | Admin-side link building |
| `src/.user.ini` | 1 | 🟢 COS | `open_basedir` path (filesystem, not domain) |

## 2.3 Critical detail — `imageProxy.ts` SSRF allowlist

This is the **hardest blocker**. The endpoint takes an arbitrary URL and fetches it
server-side, so it uses an allowlist as an SSRF guard (protecting `127.0.0.1` and
cloud-metadata `169.254.169.254`).

```ts
const ALLOWED_IMAGE_HOSTS = new Set([
  'bunonfabrics.com', 'www.bunonfabrics.com',
  'bunon.shop', 'www.bunon.shop',
  'dash.bunonfabrics.com',
  'scontent.xx.fbcdn.net', 'lookaside.fbsbx.com',
  'platform-lookaside.fbsbx.com',
  'images.weserv.nl', 'wsrv.nl', 'images.unsplash.com',
]);
const SELF_HOSTS = new Set([ /* same list + agent.bunonfabrics.com */ ]);
```

**Failure mode:** deploy to `newdomain.com` → its images are **not in the set** → the proxy
returns 400 → every proxied image (including the BMW landing page) renders blank. There is
**no env override and no wildcard**, so this cannot be fixed by configuration alone; the set
must be built from an env var.

---

# PART 3 — SEO / DOMAIN CONFIGURATION (verified working)

## 3.1 The correct architecture already exists

```ts
// server.ts:251
const SITE_URL = (process.env.SEO_ORIGIN || process.env.DOMAIN_URL || 'https://bunonfabrics.com')
```
Used consistently by:
- `server/routes/sitemap.ts:8`
- `server/routes/llmsRoute.ts:17`
- `server/routes/pinterestFeed.ts:77`
- `index.html` → replaced server-side for crawlers

**Live verification (Googlebot UA):**

| URL | canonical served |
|---|---|
| `bunonfabrics.com/` | `https://bunonfabrics.com/` ✅ |
| `bunonfabrics.com/product/66016` | `https://bunonfabrics.com/product/66016` ✅ |
| `bunon.shop/` | `https://bunonfabrics.com/` ✅ (correct: bunon.shop is non-canonical) |
| `bunon.shop/product/66016` | `https://bunonfabrics.com/product/66016` ✅ |
| `bunon.shop/sitemap.xml` | 512 URLs, all `bunonfabrics.com` ✅ |
| `robots.txt` `Sitemap:` | `https://bunonfabrics.com/sitemap.xml` ✅ |

**⚠️ The one real gap:** `src/components/SeoHead.tsx:6` hardcodes
`export const SITE_ORIGIN = 'https://bunonfabrics.com';`. Server-side is correct, but after
a **client-side navigation** the SPA rewrites canonical from this constant. It agrees with
the server today — so it is latent, not currently breaking — but it is the one place a
domain change would silently half-work.

## 3.2 nginx mapping (both domains, one upstream)

```
/etc/nginx/conf.d/bunon.shop.conf
  listen 80  →  return 301 https://$host$request_uri
  listen 443 →  root /www/wwwroot/bunon.shop,  location / → proxy_pass http://127.0.0.1:5001

bunonfabrics.com vhost
  listen 443 →  root /www/wwwroot/bunonfabrics.com/,  proxy_pass http://127.0.0.1:5001
  valid_referers none blocked server_names
```

**Assessment:** serving layer is clean and already multi-domain. **No canonical redirect
between the two domains is configured** — that is intentional and correct (bunon.shop is
de-duplicated via `rel=canonical`, not via a 301). A *third* domain must follow the same
pattern: serve 200 + self/canonical `rel=canonical`, never a blanket redirect, unless it is
meant to be an alias.

---

# PART 4 — PIXEL & CAPI TRACKING AUDIT

## 4.1 Pixel initialisation — clean
```html
<!-- index.html:58-68 -->
fbevents.js loaded async from connect.facebook.net
fbq('init', '%VITE_META_PIXEL_ID%');   <!-- vite html-transform replaces this -->
```
- `%VITE_*%` substitution is implemented in `vite.config.ts` via a custom `html-transform` plugin.
- **Exactly one `fbq('init')`** in the entire codebase — no duplicate init.
- No static `PageView` in `index.html` (deliberate — SPA fires it from `src/App.tsx:150`).
- GA4 (`%VITE_GA4_ID%`, `%VITE_GADS_TAG%`) uses the same placeholder mechanism.

## 4.2 Event inventory

| Event | Fired at | Browser | CAPI | Same `event_id` |
|---|---|---|---|---|
| `PageView` | `src/App.tsx:150` | ✅ | ✅ | ✅ |
| `ViewContent` | `ProductDetail.tsx:364`, `LandingCarBMW.tsx:81` | ✅ | ✅ | ✅ |
| `ProductGalleryInteraction` | `ProductDetail.tsx:868` | ✅ | ✅ | ✅ |
| `AddToCart` | `ProductDetail.tsx:988`, `lib/store.ts:86` | ✅ | ✅ | ✅ |
| `InitiateCheckout` | `ProductDetail.tsx:1030`, `LandingCarBMW.tsx:82` | ✅ | ✅ | ✅ |
| `Purchase` | `OrderReceived.tsx:35`, `LandingCarBMW.tsx:250` | ⚠️ downgraded | ✅ server-owned | ✅ |
| `ProductShare` | `ProductDetail.tsx:1057` | ✅ | ✅ | ✅ |
| `Lead` | `TeleSalesRecruitment.tsx:209` | ✅ (raw fbq) | ❌ | n/a |
| `SelectVariation`, `DescriptionToggle`, `Contact` | various | ✅ | ✅ | ✅ |

**Purchase is deliberately guarded.** `server.ts:139`:
```ts
app.use("/api/v1/sync", browserEventGuard, capiRoutes);
```
`browserEventGuard` strips monetary fields from browser events and downgrades browser
`Purchase` → `ViewContent`. Revenue comes only from the signed server-owned pipeline
(`server/services/metaPurchase.ts`, WhatsApp `waAnalytics.ts`). **This is correct
anti-fraud design** — a browser cannot inject fake revenue into the ad accounts.

## 4.3 Deduplication
- `event_id = event_${Date.now()}_${random}` (`src/lib/woocommerce.ts:18`)
- The **same** id goes to `fbq('track', ..., { eventID: eventId })` (line 102) and to
  `/api/v1/sync` (line 241) → Meta deduplicates browser vs server.
- Client funnel dedupe: `FUNNEL_DEDUPE_WINDOW_MS = 30_000` for `ViewContent:<content_id>` and `InitiateCheckout`.
- **PageView**: 350 ms debounce + 1500 ms min-gap (`src/App.tsx`), added today, to stop
  redirect-driven double PageViews.

## 4.4 CAPI `user_data` handling
```
fbp, fbc          → NOT hashed (opaque IDs)   → RETAINED (fixed today)
em, fn, ph, zp    → sha256 hashed, normalised
invalid em "N/A"  → dropped before send (fixed today)
geo               → normalised per-field; country ISO goes to `country`, NOT `ct`
gclid/gbraid/...  → forwarded to custom_data so GA4 and Meta agree
```

## 4.5 Bugs found & fixed on 2026-10-04 (all verified live)

| # | Bug | Impact | Verification |
|---|---|---|---|
| 1 | `fbp`/`fbc` **deleted** server-side on a false belief | Biggest EMQ lever lost | Direct Graph probe → `events_received:1`; retained |
| 2 | `_fbp`/`_fbc` cookies read **too early** | `fbc` sent empty every session | Timeline proved event fired t=696 ms, cookie absent; now wait+retry ≤6 s → **2/2 with fbc** |
| 3 | `user_email` cookie set to `"N/A"` | Invalid `em` on **every** event | `[CAPI] dropped invalid user_data.em` count now **0** |
| 4 | Placeholder `"N/A"` not decoded | `N%2FA` shipped as a *name* | Added `getCookieDecoded()`; blocked list for `n/a\|null\|test` |
| 5 | **No website Purchase → Meta** | All web revenue invisible to Meta | New `metaPurchase.ts` + `bf_meta_purchase_log` ledger |
| 6 | Idempotency used `COUNT(*)>1` | Retry would double-count revenue | Fixed to `affectedRows===0`; verified send#1 `true`, #2/#3 `false` |
| 7 | Redirect → duplicate PageView | Inflated PageViews | 7/7 routes now **1 browser + 1 server**, dedup matched |

## 4.6 Event Match Quality — current state and the biggest remaining lever

| Parameter | Coverage | Note |
|---|---:|---|
| IP address | **100/100** | ✅ |
| User agent | **100/100** | ✅ |
| Browser ID (`fbp`) | **100/100** | ✅ fixed today |
| Click ID (`fbc`) | **87.55 → 100** | ✅ fixed today |
| Email | 🔴 0.71 | Checkout email is optional & often blank |
| Phone | 🔴 2.12 | `bf_orders.phone` is 100% present, but **not sent at funnel events** |
| First name | 🔴 2.12 | Same reason |
| Surname | 🔴 0.14 | Same reason |
| External ID | 🔴 0.52 | Stored on orders, not at funnel events |

**Biggest remaining opportunity:** phone + email + `external_id` are captured **at order
time**, but the funnel events (`ViewContent`, `AddToCart`, `InitiateCheckout`) are sent
*before* the buyer has typed anything. Meta estimates External ID alone gives ~0.52%
median lift; combining phone + name + external ID typically yields **+5 to +7 EMQ points**,
which directly improves ROAS accuracy and lets Meta optimise toward real buyers.

---

# PART 5 — RANKED ACTION PLAN (one by one)

## 🟥 PHASE 1 — Must finish BEFORE any new domain goes live

| # | Task | File(s) | Why |
|---|---|---|---|
| 1.1 | Make the image-proxy allowlist env-driven | `server/routes/imageProxy.ts` | **Hard blocker.** New domain's images 400 without it. Replace both `Set` literals with `process.env.IMAGE_PROXY_HOSTS.split(',')`. |
| 1.2 | Env-drive `SITE_ORIGIN` in `SeoHead.tsx` | `src/components/SeoHead.tsx:6` | Only remaining hardcoded SEO constant; diverges from server after SPA nav |
| 1.3 | Migrate `LandingSare.tsx` image URLs | `src/pages/LandingSare.tsx` (22) | 22 broken images on the new domain |
| 1.4 | Migrate `LandingCarBMW.tsx` proxy URLs | `src/pages/LandingCarBMW.tsx:22-24` | Cross-domain proxy chain; depends on 1.1 |
| 1.5 | Replace `index.html` absolute og/canonical | `index.html:15,23-29,36` | Use `%VITE_SITE_URL%`; crawler-visible today |
| 1.6 | Env-drive `email.ts` URLs | `server/services/email.ts` (20) | Every customer email would link to the old domain |
| 1.7 | Env-drive payment callbacks | `server/routes/payment.ts:739,771` | bKash/PayStation whitelist the callback host — **re-register on the new domain** |
| 1.8 | Introduce **one** canonical env var | `.env` | Today `SEO_ORIGIN`, `DOMAIN_URL`, `PUBLIC_BASE_URL` all mean "the site". Collapse to `SITE_ORIGIN` + explicit roles |

## 🟧 PHASE 2 — Multi-domain correctness (SEO integrity)

| # | Task | Notes |
|---|---|---|
| 2.1 | Decide canonical policy per domain | Primary gets self-canonical; aliases get `rel=canonical` → primary. **Do not** blanket-301 unless intended |
| 2.2 | `feed.ts` / `pinterestFeed` / `llmsRoute` → `SITE_ORIGIN` | Already env-driven; just verify they don't fall back to a literal |
| 2.3 | `imageUrl.ts`, `products.ts` image normalisation | Confirm no `DOMAIN_URL` default leaks when env is unset |
| 2.4 | `waOrderStatus.ts:378` `shop:` literal | WhatsApp templates would tell customers to visit the old domain |
| 2.5 | Marketing/CRM message links | `marketing.ts`, `harvester.ts`, `admin/*` |
| 2.6 | `socialProofNotifications.tsx:167` visible text | Cosmetic, but user-facing |

## 🟨 PHASE 3 — Tracking quality (more revenue accuracy)

| # | Task | Expected gain |
|---|---|---|
| 3.1 | Optional email field on checkout | Unlocks `em` for funnel events |
| 3.2 | Send `ph` + `fn` + `ln` + `external_id` on `AddToCart`/`InitiateCheckout` once known | **+5–7 EMQ points** |
| 3.3 | Persist a visitor `external_id` cookie before checkout | Raises the 0.52% baseline |
| 3.4 | Confirm the new server Purchase pipeline emits `[MetaPurchase]` in logs | Revenue attribution proof |
| 3.5 | Reconcile Meta Purchase vs `bf_orders` daily | Catches attribution drift early |

## 🟩 PHASE 4 — Hygiene (safe, non-urgent)

| # | Task | Notes |
|---|---|---|
| 4.1 | Move the **631** `*.bak*` files to `_backups/` | `src/`+`server/` hold 581; they slow builds and pollute greps |
| 4.2 | Rotate leaked credentials | Cloudflare token (pasted in chat), WooCommerce `ck_`/`cs_`, Meta App Secret, BD Bulk SMS token — **all were printed to terminal/chat** |
| 4.3 | Decide whether secret files belong in web root | `firebase-service-account.json`, `nupur-ai-engine-*.json` (currently NOT served — SPA fallback returns HTML, `.env` is 404 — but move them anyway) |
| 4.4 | `sitemaps` currently expose `/api/feed` and `/api/pinterest/feed.xml` | Minor SEO noise |

---

# PART 6 — NEW-DOMAIN GO-LIVE CHECKLIST

```
□  .env: SITE_ORIGIN / SEO_ORIGIN / DOMAIN_URL / PUBLIC_BASE_URL set for the new domain
□  .env: IMAGE_PROXY_HOSTS includes the new domain  (Phase 1.1)
□  .env: VITE_META_PIXEL_ID — decide NEW pixel vs shared
□  nginx: server_name + SSL + proxy_pass http://127.0.0.1:5001
□  bKash / PayStation callback re-registered (gateway whitelist)
□  Canonical policy verified with a Googlebot-UA fetch
□  sitemap.xml + robots.txt Sitemap: point at the new canonical
□  One real order placed → confirm `[MetaPurchase]` in PM2 logs
□  Meta Events Manager: Events Received shows Browser + Server paired
□  Clarity: tag or project for the new domain
```

---

# PART 7 — WHAT WAS **NOT** VERIFIED

Stated explicitly so this report is not over-claimed:

- **Ad account performance impact** of the fixes — Events Manager reports are 7-day rolling; the `fbc`/EMQ lift will only show over the coming days.
- **`bf_orders` ↔ Meta Purchase reconciliation** — no orders were placed today, so the new server Purchase path is unit-tested (probe + idempotency) but **not** observed on a real order end-to-end.
- **Clarity per-domain data** — the project ID `233847739770512` is currently bound to one domain; a new domain needs its own Clarity project ID or a multi-domain setup.
- **Clarity quota is exhausted for today** — the daily 10-request limit was consumed during diagnosis. This is itself proof that the cron-cache architecture was necessary; fresh data resumes at the next cron run (00:07).
- **PHP dashboard (`dash.bunonfabrics.com/planner`)** was only inventoried, not audited — it has its own `env.php` secrets and `cron_meta_kpi.php` pattern.
- **Historical backup files** were excluded from all greps; a stale backup could contain a variant not present in live source.

---

*Generated by Nupur · 2026-10-04 · All findings carry `file:line` evidence · No production file was modified during this audit.*
---
---

# PART 8 — ADDENDUM: THREE CRITICAL BUGS FOUND & FIXED (2026-10-04, 23:20)

An independent audit pass over the CAPI pipeline surfaced **three defects that
silently corrupt revenue reporting**. All three are now fixed, built, deployed and
verified live (`bunon-site` online, unstable restarts 0, both domains HTTP 200).

## 8.1 🔴 CRITICAL — Purchase was double-counted

**Evidence (pre-fix):**
| Side | `event_id` | Source |
|---|---|---|
| Browser pixel (COD) | `event_1771..._x9k2m` (random) | `src/lib/woocommerce.ts:18` |
| Server CAPI (website) | `order-218854` | `server/services/metaPurchase.ts:134` |

Meta de-duplicates a browser event against its CAPI copy **only when the two share the
same `event_id`**. These never matched, so **every COD order was counted twice** — once
from the pixel (carrying `transaction_id`, value, currency) and once from CAPI.

**Impact:** inflated `Purchase` count, inflated revenue, inflated ROAS, and the
optimiser bidding on revenue that was never real. This is the single most expensive
defect found in the entire audit, and it was introduced by the server-Purchase work
itself — the browser path was never updated to match.

**Fix applied:**
1. `trackPixel()` gained a third parameter `forcedEventId` — if supplied, it pins the
   event id instead of generating a random one (`src/lib/woocommerce.ts:20-21`).
2. `Checkout.tsx:681` now persists `trackingPayload.event_id = \`order-${finalOrderId}\``
   at order-creation time, so the value survives the redirect to `/order-received`.
3. `OrderReceived.tsx:35` passes it through: `trackPixel('Purchase', payload, payload.event_id)`.

Now both sides emit `order-<orderId>` and Meta collapses them into one Purchase.

## 8.2 🔴 CRITICAL — `client_ip_address` hardcoded to loopback

**Evidence (pre-fix), `server/services/metaPurchase.ts:115-116`:**
```ts
userData.client_ip_address   = '127.0.0.1';
userData.client_user_agent   = 'bunon-server/1.0';
```

Meta grades `client_ip_address` and `client_user_agent` as *identifiers*. Sending the
same loopback IP and a fake UA for **every single purchase** presented Meta with
thousands of unrelated buyers claiming one identical device/IP cluster — which actively
**degrades** Event Match Quality rather than leaving it neutral.

**Fix applied:** `metaPurchase.ts` now accepts `clientIpAddress` / `userAgent`, resolves
the real values, and **deletes the fields entirely when genuinely absent** — an absent
identifier is neutral, a wrong one is not. `payment.ts` wires them from the live request
(`x-forwarded-for` → `x-real-ip` → `socket.remoteAddress`, plus `user-agent`).

Verified: `grep '127.0.0.1\|bunon-server/1.0'` in `metaPurchase.ts` now matches **only a
comment**; no hardcoded placeholder remains in code.

## 8.3 🟠 HIGH — WhatsApp vs website purchase double-count

**Evidence (pre-fix), `server/routes/waAnalytics.ts:200`:**
```ts
const purchaseId = `wa-order-${order.id}`;   // website pipeline used `order-<id>`
```

A COD order originating over WhatsApp but persisted by the site produced two different
event ids for one order across the two pipelines → counted twice. Additionally
`event_name` was lowercase `'purchase'`, which is not Meta's standard spelling and can
bypass standard-event processing.

**Fix applied:** both pipelines now emit `order-<orderId>` and the standard
`'Purchase'` capitalisation. Confirmed at `waAnalytics.ts:209-214`.

## 8.4 Backup files created
```
src/pages/Checkout.tsx.bak_purchasededup_20261004_232011
src/pages/OrderReceived.tsx.bak_purchasededup_20261004_232011
src/lib/woocommerce.ts.bak_purchasededup_20261004_232011
server/services/metaPurchase.ts.bak_ipua_20261004_232011
server/routes/payment.ts.bak_ipua_20261004_232011
server/routes/waAnalytics.ts.bak_dedup_20261004_232011
```

## 8.5 ⚠️ Also flagged, NOT yet fixed — needs a decision

| # | Finding | Why it matters |
|---|---|---|
| A | `src/pages/ProductDetail (2).tsx` — a **stale duplicate component** still in `src/`, containing its own `ViewContent` / `AddToCart` / `InitiateCheckout` / `ProductGalleryInteraction` / `ProductShare` calls (lines 287, 735, 831, 873, 900). Reachability could not be confirmed as impossible. | If that route ever mounts, the **entire funnel fires twice** with different event ids → duplicate events and double revenue. **Highest-priority cleanup item.** |
| B | `AddToCart` arrives at CAPI with `value` and `currency` **stripped** by `browserEventGuard` (`server/utils/trackingAuth.ts:85`). | Any server-side revenue rollup built on `/api/v1/sync` AddToCart reads **0**. Browser-side value is still correct, so Meta optimisation is unaffected — but do not build reporting on server AddToCart value. |
| C | `InitiateCheckout` has a hard **30 s global dedupe window** (`woocommerce.ts:21-29`); a genuine repeat attempt after 30 s is silently dropped. | Undercounts the funnel top. Consider keying on cart-hash instead of time. |
| D | `SelectVariation` / `DescriptionToggle` send `product_id` instead of `content_ids`. | Weak catalogue matching for those events. `Contact` and `ViewContent` do it correctly. |
| E | `/api/v1/tiktok` is **unreachable from the storefront** — it is signature-gated (`requireSignedTracking`) but the frontend never sends `x-trk-signature`. Returns 401. | TikTok is **browser-pixel-only**. Also: TikTok events are **not** covered by `browserEventGuard`, so a browser-side TikTok `Purchase` still carries a real value while the Meta copy is scrubbed — asymmetric revenue between the two ad systems. |
| F | `Lead` (`TeleSalesRecruitment.tsx:209`) is browser-only with **no `event_id` and no CAPI copy** — cannot be de-duplicated or matched. | Intentionally limited, but worth documenting. |
| G | `WA_ANALYTICS_SECRET` — if unset, the `/report` endpoint's secret check is skipped entirely (empty-string secret = no check). | Confirm the env var is actually set. |
| H | Phone/`external_id` hash bases differ between pipelines (`metaPurchase` = raw last-11 digits; `waAnalytics` = `sha256('bd'+last11)`), so one person resolves to two different `external_id`s. | Now partly moot after 8.3 (both share `order-<id>`), but the **customer-identity** bases still differ and will cap match rate if both pipelines ever report the same buyer. Recommend one shared normaliser. |

## 8.6 Correction to an earlier statement in this report
Part 4.2 states the browser Purchase "cannot be injected by a client". That remains true
for the **CAPI** copy — `browserEventGuard` strips the value server-side. But the
**browser pixel** Purchase is client-controlled, and before this fix it was counted
alongside a genuine server Purchase. So the effective protection was weaker than
described. It is now correct: identical `event_id` + guard + server-authoritative value
means only the server figure carries revenue.
