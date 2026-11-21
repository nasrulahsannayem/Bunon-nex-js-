# Bunon Fabrics - Modern Headless E-commerce Platform

**The future of e-commerce: React + Vite frontend + Node.js/Express backend with local database caching, Redis, and comprehensive automation.**

---

## Architecture Overview

A hybrid headless architecture that decouples the fast frontend from the legacy WordPress/WooCommerce backend, while maintaining synchronization through webhooks and local database caching.

### Core Data Flows

| Flow | Path | Purpose |
|------|------|---------|
| **Products** | WooCommerce → Node.js Webhook → MySQL ( DB) → Redis Cache → Frontend () | **Instant product loading** - no WordPress wait |
| **Orders** | Frontend →  → WooCommerce Dashboard | **Direct WP sync** - leverages existing order management |
| **Images** |  →  → Frontend | **Secure proxy** - prevents hotlinking, enforces caching |
| **Admin** | React Admin Panel →  | **Full CRUD** for products, orders, settings |
| **Attribution** | Browser →  (signed) → CAPI / TikTok Events API | **Server-side tracking** - bypasses adblockers |

---

## Key Technologies

### Frontend
- **React 19** + **React Router DOM 7** (data routing)
- **Vite 6** (ESM build, HMR)
- **TailwindCSS 4** (via @tailwindcss/vite)
- **Zustand** (state management)
- **Framer Motion** (animations)
- **React Markdown** (CMS content)
- **Recharts** (analytics dashboards)
- **Lucide React** (icons)
- **Motion** (React 19 compatible animations)

### Backend
- **Node.js 24** + **Express 4** (REST API)
- **TypeScript** (full type safety)
- **MySQL 8** (via mysql2/promise)
- **Redis 6** (Upstash compatible, caching + pub/sub)
- **Helmet + Rate Limiting + CORS** (security)
- **Express Rate Limit** (API protection)
- **Node Cron** (scheduled jobs)

### Infrastructure
- **VPS**: Ubuntu 26.04.1 LTS (15.235.162.246)
- **PM2**: Process management ()
- **Cloudflare**: DNS, SSL, CDN, WAF, Bot Management
- **GitHub**: Source control ( &  branches)
- **SSH**: Reverse tunnel for Android/Termux access

---

## Project Structure



---

## Running the Project

### Development


### Production (VPS)


---

## Key Features

- **Product Catalog**: Local MySQL cache + Redis fallback, variants, SEO URLs.
- **Cart & Checkout**: Server-side price validation, coupons, bKash/SSLCommerz/Stripe/COD, Steadfast courier tracking.
- **Authentication & RBAC**: JWT + Refresh tokens, role-based access.
- **Marketing & Analytics**: Meta CAPI v22, TikTok Events API, Pinterest CAPI, WhatsApp Business Cloud API, Microsoft Clarity, GA4 Measurement Protocol, Push Notifications, Daily Newsletter.
- **Omnichannel Inbox**: WhatsApp, Telegram, Messenger, SMS, Email unified in .
- **Security & Performance**: Helmet, Rate Limiting, Signed tracking, Image proxy, PWA support.

---

## Deployment & Sync
- Deployed on VPS ().
- Synced to GitHub ( &  branches).

---

**© 2026 Bunon Fabrics. All rights reserved.**
