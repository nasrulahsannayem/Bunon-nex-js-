# 🏗️ FULL-STACK WORK PLAN — Bunon Fabrics
### `bunon.shop` · created 2026-10-04 after the multi-domain + tracking audit
**Stack:** React 18 + Vite (SPA) · Express + TypeScript · MySQL · PM2 · nginx
**Size:** 180 source files · ~43,875 LOC · PM2 `bunon-site` → `dist/server.cjs` (port 5001)

---

# CURRENT STATE — measured, not assumed

| Signal | Value | Reading |
|---|---|---|
| PM2 `bunon-site` | online, **481 lifetime restarts** | Historical, **not current instability** |
| Restarts in the error log | **4 total** | 3 = today's deploy mistakes (2 by me), 1 old missing-build |
| Unstable restarts | 0 | ✅ currently healthy |
| Error log size | 4 KB | ✅ no runaway errors |
| Memory ceiling | `--max-old-space-size=512` | 160 MB used → healthy headroom |
| Box memory | 11.6 GB total / 5.0 GB available | Not under pressure |
| Dead source files | 1 (`ProductDetail (2).tsx`, 1,994 lines, **0 imports**) | 🟡 harmless but must go |
| Backup clutter | **624** files (`src/`+`server/` 595, root 29) | 🟡 ~12 MB, poisons every grep/audit |
| Test harness | none (`test_emails.js`, `test_push.ts` are scripts) | 🔴 no safety net for future refactors |

**Important correction:** I earlier flagged `ProductDetail (2).tsx` as a funnel
double-fire risk. I verified it — **it is imported nowhere**, so it is unreachable dead
code. The funnel is safe. The file is still 1,994 lines of a second `ProductDetail`
implementation and should be deleted, but it is **not urgent**.

---

# PRIORITY 0 — URGENCY (do today)

### 0.1 🔴 Rotate every exposed credential
Several secrets reached terminal output or chat and must be treated as compromised.
**Values are never written in this document.**

| Secret | Where it leaked | Action |
|---|---|---|
| Cloudflare API token | pasted in Telegram chat | Revoke + reissue |
| WooCommerce `ck_` / `cs_` | `planner/config/env.php` inspection | Rotate in WP admin |
| Meta App Secret | same inspection | Rotate in Business Manager |
| BD BulkSMS / SMSNOC token | same inspection | Rotate |
| MySQL password | same inspection | Rotate (coordinate with `server/db.ts`) |

Do this **before** anything else — it is the only item with an external attacker window.

### 0.2 🟠 Remove secret files from the web root
`firebase-service-account.json`, `nupur-ai-engine-480322-*.json` sit in
`/www/wwwroot/bunon.shop/`. They are **not currently served** (verified: those URLs return
the SPA fallback HTML, and `.env` is 404), but a future nginx change could expose them.
Move to `~/bunon-secrets/` with `chmod 600` and load via `.env` paths.

---

# PRIORITY 1 — UNBLOCKS THE NEW DOMAIN

Do these in order; each is small and each is verified by a build + HTTP check.

| # | Task | File | Verify |
|---|---|---|---|
| 1.1 | **Env-drive the image-proxy SSRF allowlist** — the hard blocker | `server/routes/imageProxy.ts` | new host returns 200 through the proxy |
| 1.2 | Env-drive `SITE_ORIGIN` (last hardcoded SEO constant) | `src/components/SeoHead.tsx:6` | Googlebot-UA canonical correct after SPA nav |
| 1.3 | Migrate 22 WordPress image URLs | `src/pages/LandingSare.tsx` | page renders on the new domain |
| 1.4 | Migrate proxy URL chains | `src/pages/LandingCarBMW.tsx:22-24` | depends on 1.1 |
| 1.5 | `%VITE_SITE_URL%` for og/canonical | `index.html:15,23-29,36` | FB/OG scraper resolves the new domain |
| 1.6 | Env-drive 20 email URLs | `server/services/email.ts` | a test email links to the new domain |
| 1.7 | Payment callback host | `server/routes/payment.ts` | re-register bKash/PayStation whitelist |
| 1.8 | Collapse `SEO_ORIGIN` / `DOMAIN_URL` / `PUBLIC_BASE_URL` into documented roles | `.env` | no silent fallback |

**Do not merge 1.8's variables blindly.** `DOMAIN_URL` is what the payment gateway
validates; `SEO_ORIGIN` is what canonical/sitemap use. They can differ during a migration.

---

# PRIORITY 2 — REVENUE ACCURACY (money)

| # | Task | Expected effect |
|---|---|---|
| 2.1 | Checkout: make email **optional but encouraged**, and send `ph`/`fn`/`ln`/`external_id` on `AddToCart`/`InitiateCheckout` once known | **+5 to +7 EMQ points** |
| 2.2 | Persist a visitor `external_id` cookie before checkout | lifts the 0.52% baseline |
| 2.3 | Fix the phone-hash mismatch between `metaPurchase.ts` (raw last-11) and `waAnalytics.ts` (`sha256('bd'+last11)`) | one buyer = one identity |
| 2.4 | Replace the hard 30 s `InitiateCheckout` dedupe with a cart-hash key | stops dropping genuine repeat attempts |
| 2.5 | Send `content_ids` on `SelectVariation` / `DescriptionToggle` | catalogue matching |
| 2.6 | Daily reconciliation: Meta Purchase vs `bf_orders` | catches drift early |
| 2.7 | Confirm `WA_ANALYTICS_SECRET` is set (unset = `/report` unauthenticated) | closes a hole |
| 2.8 | Decide the TikTok position: sign the frontend calls, or drop the dead server route | removes an asymmetry where TikTok keeps a browser Purchase value the Meta copy lacks |

---

# PRIORITY 3 — REPO HYGIENE

| # | Task | Why |
|---|---|---|
| 3.1 | Move all 624 `*.bak*` into `_backups/` (outside `src`/`server`) | every audit I ran today returned inflated counts because of them |
| 3.2 | Delete `src/pages/ProductDetail (2).tsx` (0 imports, verified) | removes a second `ProductDetail` implementation |
| 3.3 | Add a deploy guard: build → **smoke-test the bundle exists** → restart | today, 3 of 4 restarts came from restarting against a missing/failed build |
| 3.4 | Add `.gitignore` for `*.bak*`, secrets, `dist` | |
| 3.5 | Investigate `bunon-webhook` (28 restarts, `bunon_social_media_live_agent/webhook.py`) | unrelated app, possible crash loop |

**3.3 is the highest-value item here.** The `ERR_MODULE_NOT_FOUND` restarts happened
because a restart was issued while `dist/server.cjs` did not exist. A 5-line preflight
prevents the exact failure mode I caused twice.

---

# PRIORITY 4 — STRUCTURAL (schedule, don't rush)

| # | Task | Notes |
|---|---|---|
| 4.1 | Introduce a **minimal test harness** | there is none — every change today was verified by hand-written puppeteer probes. Unacceptable for the next phase |
| 4.2 | Turn the audit scripts into a permanent `/admin/health` panel | tracking health, cache age, quota, ledger rows |
| 4.3 | Split the 2,201-line `ProductDetail.tsx` | readability; no behaviour change |
| 4.4 | Single phone/email normaliser shared by all Meta pipelines | closes 2.3 at the root |
| 4.5 | Extract the canonical `SITE_ORIGIN` into one shared module | stops the class of bug in `SeoHead.tsx` |

---

# SUGGESTED ORDER — next 3 days

**Day 1 — security + no-new-bugs**
`0.1` rotate secrets → `0.2` move secret files → `3.3` deploy guard → `3.1` archive backups

**Day 2 — new domain unblocked**
`1.1` image proxy → `1.2` SeoHead → `1.3`/`1.4` landing images → `1.6` email → `1.7` payment

**Day 3 — revenue**
`2.1` checkout identity → `2.3` hash alignment → `2.7` WA secret → `2.8` TikTok decision

Then: `3.2` delete dead file · `2.6` reconciliation · `4.1` test harness.

---

# WHAT I NEED FROM YOU

1. **Credential rotation needs your hands** — WP admin, Business Manager, Cloudflare
   dashboard. I can rotate Meta/DB from the VPS; WP and Cloudflare are yours.
2. **Can I edit `ecosystem.config.cjs`** to add `max_memory_restart` and the build guard?
3. **New domain:** give me the hostname. Phase 1 is then a same-day job.
4. **`bunon-webhook`** — is that service still needed? It has the second-highest restart
   count on the box.
