# Bunon Shop Admin Panel - Complete Implementation Plan
## Based on Reference Repo (fatiha-salah-chair) Modal-First Architecture
### Updated: Raw SQL Architecture (No Prisma) — Verified 2026-11-24

---

## 1. PROJECT SCOPE & GOALS

### Primary Objective
Transform Bunon Shop's admin panel from **backend API-driven** to **frontend modal-driven** architecture matching reference repo (fatiha-salah-chair), where ALL features are manageable via React modals with real-time state synchronization.

### Success Criteria
- ✅ Every admin feature accessible via modal (no dedicated CRUD pages)
- ✅ Universal modal/component system (`Modal`, `Field`, `ImageUploader`, `Pill`, `Kpi`, `Toast`)
- ✅ Real-time polling sync (`useDb` hook equivalent) across all collections
- ✅ Zero backend hardcoding for admin-configurable features
- ✅ Complete feature parity with reference repo + Bunon's existing unique features
- ✅ TypeScript strict mode enabled, zero errors, full test coverage
- ✅ Single source of truth for all admin state (Zustand + React Query sync)
- ✅ **Uses Bunon's existing stack**: raw `mysql2/promise`, dual DB, Redis, JWT, Zustand

### Stack Confirmed (Verified 2026-11-24)
| Layer | Technology | Notes |
|-------|------------|-------|
| Frontend | React 19 + TypeScript | Vite 6, Tailwind CSS v4 |
| State | Zustand (no React Query) | Need to add TanStack if desired |
| Backend | Express.js + TypeScript | Raw mysql2/promise (NO ORM) |
| Database | Dual MySQL Pools | `bunon_shop_db` (products) + `bunonfabrics_dash_db` (admin) |
| Auth | JWT + Refresh Tokens | Middleware in `server/routes/auth.ts` |
| Caching | Redis | Rate limiting, pub/sub potential |
| Migrations | Custom TypeScript runner | `server/migrations/index.ts` |

---

## 2. REFERENCE REPO FEATURE AUDIT (fatiha-salah-chair)

### 2.1 Core Admin Pages & Modals
| Page | Modals | Key Features | Backend Collections |
|------|--------|--------------|---------------------|
| **Dashboard** | None (widgets) | KPIs, charts, smart insights, live visitors, SLA, courier performance | `orders`, `products`, `complaints`, `presence` |
| **Products** | Create/Edit, Duplicate, Color Variant, Delete, Image Uploader | Inline stock edit, categories/subcategories, color groups, SEO, variants | `products`, `categories` |
| **Orders** | Detail, Status Transition, Cancel/Return Reason, Courier History, SMS Send, Fraud Check | Tabbed statuses, Steadfast courier, auto-refresh, SMS templates, call/WhatsApp | `orders`, `courierLog`, `smsLog` |
| **Categories** | Create/Edit, Image Upload, Delete | Inline edit (name/slug/order), drag-drop, subcategories, SEO, campaign link | `categories` |
| **Settings** | 6 Tabs (modal per tab save) | General, Shipping, Tracking, SEO, Courier, Staff/Backup - all KV-driven | `kv` |
| **Team** | Add/Edit Member, Delete | Role cards (5 roles), permissions matrix (13 perms), avatar upload | `admin_tokens`, `kv` |
| **Coupons** | Create/Edit, Delete | Type/value, dates, limits, product/category targeting, exclude lists | `coupons` |
| **Complaints** | Create/Edit, Status Transition, Assign, File Upload | 6 statuses, 6 types, 4 segments, auto-routing, SLA | `complaints` |
| **Landings** | Builder (multi-step), Section Add/Edit | Drag-drop sections, benefits/FAQ/testimonials | `landing_pages` |
| **HomeEditor** | Section Config, Product Picker, Schedule | 7 section types, scheduling | `homepage_sections` |
| **Incomplete** | Status Update, Notes | 4 statuses, recovery link | `incomplete_orders` |
| **LiveChat** | Provider Config, Test Chat, Save | 4 modes, 4+ providers | `chat_config` (KV) |
| **SMS** | Gateway Config, Template Edit, Test Send | 2 gateways, variable templates, event auto-send | `sms_log`, `kv` |

### 2.2 Universal Components (from reference ui.jsx)
```typescript
// Must implement all in Bunon frontend
- Modal: open, onClose, title, size (sm|md|lg|xl|full), children
- Field: label, name, type (text|textarea|select|checkbox|radio|file|number|date|datetime|password|email|url), options, required, multiple, accept
- Pill: tone (gray|green|blue|yellow|red|sky|purple), children
- Kpi: label, value, trend, trendUp
- Panel: title, children, actions
- Toast: success|error|info|warning, message, duration
- Empty: icon, title, description, action
- Chips: items, onRemove, maxVisible
- HBars: data, max, color, label, value
- Icon: name (from lucide-react)
- Img: src, alt, fallback, className
- Formatting: tk(n), fdate(ts), ago(ts), startOfDay(ts)
- waNum(phone), validPhone(phone), meName(user), normPhone(phone)
```

### 2.3 Backend Architecture (Reference → Bunon Adaptation)
```
Reference:
  Database: MySQL/SQLite
  Tables: docs, kv, tokens, rl, otp
  Collections: products, orders, categories, coupons, landings, chats, messages, incomplete, smsLog, complaints
  Auth: Bearer token, OTP login, rate limiting
  Sync: /admin/poll?since=&collections=... → deltas + serverTime

Bunon Adaptation:
  Database: Dual MySQL pools
    - bunon_shop_db: products, orders, customers, categories, coupons, reviews, blogs, landing_pages
    - bunonfabrics_dash_db: docs, kv, admin_tokens, rate_limits, otp, complaints, 
                            incomplete_orders, sms_log, courier_log, chat_config, visitor_sessions
  Auth: JWT access + refresh tokens (existing middleware)
  Rate Limiting: Redis-based (express-rate-limit)
  Sync: Custom polling endpoint using setIntervals
```

---

## 3. BUNON SHOP CURRENT STATE

### 3.1 Existing Admin Pages (28 files)
```
src/pages/admin/
├── UsersManager.tsx            # Users listing
├── AbandonedCarts.tsx          # Incomplete orders (rename later)
├── UsersRolesManager.tsx       # Roles + RBAC (partial)
├── TeamPage.tsx                # Team management
├── AdminLogin.tsx              # Login page
├── ReportsPage.tsx             # Reports/analytics
├── MetaKpi.tsx                 # KPI components
├── AuditLogPage.tsx            # System audit log
├── ProfitPage.tsx              # Financial reporting
├── MetaEventLogs.tsx           # Event tracking logs
├── Dashboard.tsx               # Main dashboard
├── OrdersManager.tsx           # Orders management
├── ProductsManager.tsx         # Products CRUD (NEW: inside/outside delivery fee added)
├── SettingsManager.tsx         # General settings
├── CouponsManager.tsx          # Coupons CRUD
├── CategoriesManager.tsx       # Categories CRUD
├── CustomersManager.tsx        # Customers listing
├── InboxPage.tsx               # Messages/inbox
├── InventoryPage.tsx           # Inventory management
├── ReturnsPage.tsx             # Returns management
└── PromotionsManager.tsx       # Banners/promotions
```

### 3.2 Existing Admin UI Kit (src/components/admin/ui.tsx)
```typescript
// Already has these — preserve and extend:
MEANING = { sales, orders, revenue, alert, users, pending, transit, delivered, cancelled, return }
StatCard = gradient background + icon + value
SectionHeader = title/sub/right-aligned actions
StatusPill = status badges (pending/confirmed/in_transit/delivered/cancelled/return)
photoMap() = helper for user avatars
userPhoto() = helper for logged-in user avatar
```

### 3.3 Existing Backend Services
| Service | Location | Purpose |
|---------|----------|---------|
| `db.ts` | `server/db.ts` | Two connection pools (admin + products) |
| `migrations/index.ts` | `server/migrations/` | Versioned SQL migrations |
| `auth.ts` | `server/routes/auth.ts` | JWT login, refresh, logout |
| `redisClient.ts` | `server/services/redisClient.ts` | Cache hydration |
| Products routes | `server/routes/admin/products.ts` | All product operations (raw SQL) |
| Orders routes | `server/routes/admin/orders.ts` | Order CRUD |
| Categories | `server/routes/admin/categories.ts` | Category CRUD |
| Coupons | `server/routes/admin/coupons.ts` | Coupon CRUD |

---

## 4. DATABASE SCHEMA EXTENSIONS (RAW SQL)

### 4.1 Migration Strategy
All new tables target **`bunonfabrics_dash_db`** (the admin database).
Existing tables in `bunon_shop_db` remain untouched unless specified.

### 4.2 New Tables (SQL Scripts)

#### Table 1: `docs` — Universal Document Store
```sql
CREATE TABLE IF NOT EXISTS docs (
  id VARCHAR(32) PRIMARY KEY,
  collection VARCHAR(50) NOT NULL COMMENT 'products|orders|categories|coupons|landings|complaints|incomplete|smsLog|reviews|chats|messages',
  doc JSON NOT NULL COMMENT 'Full document payload',
  indexes JSON NULL COMMENT 'Computed index fields for fast lookups',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_collection_id (collection, id),
  INDEX idx_doc_slug (collection, (CAST(doc->>'$.slug' AS CHAR(255))))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 2: `kv` — Key-Value Store
```sql
CREATE TABLE IF NOT EXISTS kv (
  key VARCHAR(190) PRIMARY KEY,
  value JSON NOT NULL COMMENT 'Arbitrary config blob',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 3: `admin_tokens` — JWT Token Storage
```sql
CREATE TABLE IF NOT EXISTS admin_tokens (
  token VARCHAR(255) PRIMARY KEY,
  type ENUM('access','refresh') NOT NULL,
  subject_id BIGINT UNSIGNED NOT NULL COMMENT 'User ID from bunon_users table',
  data JSON NULL COMMENT 'Optional metadata',
  expires DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_subject (subject_id),
  INDEX idx_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 4: `rate_limits` — SQL Rate Limit Fallback
```sql
CREATE TABLE IF NOT EXISTS rate_limits (
  key VARCHAR(190) PRIMARY KEY,
  count INT UNSIGNED NOT NULL DEFAULT 0,
  window_start DATETIME NOT NULL COMMENT 'Start of current rate window',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 5: `otp` — Phone/Email OTP
```sql
CREATE TABLE IF NOT EXISTS otp (
  phone VARCHAR(32) PRIMARY KEY,
  code VARCHAR(10) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_expires (expires)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 6: `complaints`
```sql
CREATE TABLE IF NOT EXISTS complaints (
  id VARCHAR(32) PRIMARY KEY,
  type ENUM('product','shipping','service','payment','warranty','other') NOT NULL,
  status ENUM('new','in_progress','assigned','resolved','closed','reopened') NOT NULL DEFAULT 'new',
  segment ENUM('gold','silver','bronze','new') NOT NULL DEFAULT 'new',
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  user_id BIGINT UNSIGNED NULL,
  assigned_to BIGINT UNSIGNED NULL,
  files JSON NULL COMMENT '[{url,name,size,type}]',
  notes JSON NULL COMMENT '[{author,id,note,created_at}]',
  sla_hours INT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_segment (segment),
  INDEX idx_assigned (assigned_to),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 7: `incomplete_orders`
```sql
CREATE TABLE IF NOT EXISTS incomplete_orders (
  id VARCHAR(32) PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  items JSON NOT NULL COMMENT '[{product_id,qty,price,variation,...}]',
  total DECIMAL(10,2) NOT NULL,
  status ENUM('cart','saved','recovered','abandoned','expired') NOT NULL DEFAULT 'cart',
  recovery_link VARCHAR(255) NULL COMMENT 'One-time-use deep link',
  sent_recovery_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_status (status),
  INDEX idx_user (user_id),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 8: `landing_pages`
```sql
CREATE TABLE IF NOT EXISTS landing_pages (
  id VARCHAR(32) PRIMARY KEY,
  slug VARCHAR(190) NOT NULL UNIQUE,
  title VARCHAR(255) NOT NULL,
  content JSON NOT NULL COMMENT 'Builder sections array',
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  seo JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_slug (slug),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 9: `homepage_sections`
```sql
CREATE TABLE IF NOT EXISTS homepage_sections (
  id VARCHAR(32) PRIMARY KEY,
  type ENUM('hero','products','categories','banners','video','testimonials','custom_html') NOT NULL,
  config JSON NOT NULL COMMENT 'Section-specific configuration',
  position INT UNSIGNED NOT NULL DEFAULT 0,
  status ENUM('active','inactive') NOT NULL DEFAULT 'active',
  schedule JSON NULL COMMENT '{start,end,days,hours}',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_position (position),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 10: `sms_log`
```sql
CREATE TABLE IF NOT EXISTS sms_log (
  id VARCHAR(32) PRIMARY KEY,
  to_phone VARCHAR(32) NOT NULL,
  from_number VARCHAR(32) NULL,
  body TEXT NOT NULL,
  status ENUM('pending','sent','delivered','failed','optout') NOT NULL DEFAULT 'pending',
  gateway ENUM('muthofun','bulksm','manual') NOT NULL,
  message_id VARCHAR(255) NULL,
  error_code VARCHAR(64) NULL,
  event_type VARCHAR(50) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_to (to_phone),
  INDEX idx_status (status),
  INDEX idx_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 11: `courier_log`
```sql
CREATE TABLE IF NOT EXISTS courier_log (
  id VARCHAR(32) PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  courier ENUM('steadfast','sfpar','keysui','cat','logistics') NOT NULL,
  tracking_id VARCHAR(255) NULL,
  status ENUM('booked','picked_up','in_transit','delivered','returned','failed') NOT NULL,
  notes JSON NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_order (order_id),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 12: `chat_config`
```sql
CREATE TABLE IF NOT EXISTS chat_config (
  id VARCHAR(32) PRIMARY KEY,
  key VARCHAR(190) NOT NULL UNIQUE,
  value JSON NOT NULL COMMENT 'Provider config or AI settings',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

#### Table 13: `visitor_sessions` (Live Presence)
```sql
CREATE TABLE IF NOT EXISTS visitor_sessions (
  id VARCHAR(32) PRIMARY KEY,
  session_id VARCHAR(190) NOT NULL UNIQUE,
  ip VARCHAR(45) NOT NULL,
  user_agent TEXT NULL,
  country VARCHAR(2) NULL,
  city VARCHAR(100) NULL,
  path VARCHAR(500) NULL,
  referrer VARCHAR(500) NULL,
  last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_session (session_id),
  INDEX idx_last_activity (last_activity)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 4.3 Default Seed Data (for `kv` table)
```sql
-- Insert default KV entries after table creation
INSERT IGNORE INTO kv (key, value) VALUES
('settings.general', '{"shop_name":"Bunon","currency":"৳","timezone":"Asia/Dhaka","support_phone":"+8801XXXXXXXXX"}'),
('settings.shipping', '{"inside_fee":60,"outside_fee":120,"free_above":1000}'),
('settings.tracking', '{"prefix":"","carrier_url":""}'),
('settings.seo', '{"title_prefix":"","description":"Bunon Shop"}'),
('settings.courier', '{"default":"steadfast","api_key":"", "webhook_url":""}'),
('home.sections', '[]'),
('home.hero', '{"enabled":true,"image":"","cta_text":"Shop Now"}'),
('fraud.config', '{"enabled":false,"threshold":0.5}'),
('chatServer.provider', '"tawk"'),
('chatServer.apiKey', ''),
('chatServer.windowId', ''),
('voiceAi.enabled', false),
('voiceAi.model', 'gpt-3.5-turbo'),
('smsGateway.muthofun', '{"api_key":"","sender_id":""}'),
('smsGateway.bulksm', '{"api_key":"","secret":""}'),
('smsTemplates.order_confirmed', 'আপনার অর্ডার কনফার্ম হয়েছে। ট্র্যাকিং নম্বর: {{tracking_id}}'),
('smsTemplates.order_shipped', 'আপনার প্যাকেট শিপ করা হয়েছে। ট্র্যাকিং নম্বর: {{tracking_id}}'),
('smsTemplates.order_delivered', 'আপনার অর্ডার ডেলিভারি হয়েছে। ধন্যবাদ!'),
('team.roles', JSON_OBJECT('super_admin',true,'admin',true,'order_manager',false,'support',false,'content',false));
```

---

## 5. MIGRATION SCRIPT (TypeScript)

Create `server/migrations/0005_admin_panel_full.sql`:

```typescript
// server/migrations/0005_admin_panel_full.ts
import type { Migration } from './index';

export const M0005: Migration = {
  id: '0005',
  name: 'admin_panel_modal_features',
  notes:
    'Adds 13 new tables for modal-driven admin: docs, kv, admin_tokens, ' +
    'rate_limits, otp, complaints, incomplete_orders, landing_pages, ' +
    'homepage_sections, sms_log, courier_log, chat_config, visitor_sessions.',
  up: [
    // Docs
    `CREATE TABLE IF NOT EXISTS docs (
      id VARCHAR(32) PRIMARY KEY,
      collection VARCHAR(50) NOT NULL,
      doc JSON NOT NULL,
      indexes JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_collection_id (collection, id),
      INDEX idx_doc_slug (collection, (CAST(doc->>'$.slug' AS CHAR(255))))
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // KV
    `CREATE TABLE IF NOT EXISTS kv (
      key VARCHAR(190) PRIMARY KEY,
      value JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Admin tokens
    `CREATE TABLE IF NOT EXISTS admin_tokens (
      token VARCHAR(255) PRIMARY KEY,
      type ENUM('access','refresh') NOT NULL,
      subject_id BIGINT UNSIGNED NOT NULL,
      data JSON NULL,
      expires DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_subject (subject_id),
      INDEX idx_expires (expires)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Rate limits
    `CREATE TABLE IF NOT EXISTS rate_limits (
      key VARCHAR(190) PRIMARY KEY,
      count INT UNSIGNED NOT NULL DEFAULT 0,
      window_start DATETIME NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // OTP
    `CREATE TABLE IF NOT EXISTS otp (
      phone VARCHAR(32) PRIMARY KEY,
      code VARCHAR(10) NOT NULL,
      attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
      expires DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_expires (expires)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Complaints
    `CREATE TABLE IF NOT EXISTS complaints (
      id VARCHAR(32) PRIMARY KEY,
      type ENUM('product','shipping','service','payment','warranty','other') NOT NULL,
      status ENUM('new','in_progress','assigned','resolved','closed','reopened') NOT NULL DEFAULT 'new',
      segment ENUM('gold','silver','bronze','new') NOT NULL DEFAULT 'new',
      title VARCHAR(255) NOT NULL,
      description TEXT NULL,
      user_id BIGINT UNSIGNED NULL,
      assigned_to BIGINT UNSIGNED NULL,
      files JSON NULL,
      notes JSON NULL,
      sla_hours INT UNSIGNED NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_segment (segment),
      INDEX idx_assigned (assigned_to),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Incomplete orders
    `CREATE TABLE IF NOT EXISTS incomplete_orders (
      id VARCHAR(32) PRIMARY KEY,
      user_id BIGINT UNSIGNED NULL,
      items JSON NOT NULL,
      total DECIMAL(10,2) NOT NULL,
      status ENUM('cart','saved','recovered','abandoned','expired') NOT NULL DEFAULT 'cart',
      recovery_link VARCHAR(255) NULL,
      sent_recovery_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_status (status),
      INDEX idx_user (user_id),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Landing pages
    `CREATE TABLE IF NOT EXISTS landing_pages (
      id VARCHAR(32) PRIMARY KEY,
      slug VARCHAR(190) NOT NULL UNIQUE,
      title VARCHAR(255) NOT NULL,
      content JSON NOT NULL,
      status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
      seo JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_slug (slug),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Homepage sections
    `CREATE TABLE IF NOT EXISTS homepage_sections (
      id VARCHAR(32) PRIMARY KEY,
      type ENUM('hero','products','categories','banners','video','testimonials','custom_html') NOT NULL,
      config JSON NOT NULL,
      position INT UNSIGNED NOT NULL DEFAULT 0,
      status ENUM('active','inactive') NOT NULL DEFAULT 'active',
      schedule JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_position (position),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // SMS log
    `CREATE TABLE IF NOT EXISTS sms_log (
      id VARCHAR(32) PRIMARY KEY,
      to_phone VARCHAR(32) NOT NULL,
      from_number VARCHAR(32) NULL,
      body TEXT NOT NULL,
      status ENUM('pending','sent','delivered','failed','optout') NOT NULL DEFAULT 'pending',
      gateway ENUM('muthofun','bulksm','manual') NOT NULL,
      message_id VARCHAR(255) NULL,
      error_code VARCHAR(64) NULL,
      event_type VARCHAR(50) NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_to (to_phone),
      INDEX idx_status (status),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Courier log
    `CREATE TABLE IF NOT EXISTS courier_log (
      id VARCHAR(32) PRIMARY KEY,
      order_id BIGINT UNSIGNED NOT NULL,
      courier ENUM('steadfast','sfpar','keysui','cat','logistics') NOT NULL,
      tracking_id VARCHAR(255) NULL,
      status ENUM('booked','picked_up','in_transit','delivered','returned','failed') NOT NULL,
      notes JSON NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_order (order_id),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Chat config
    `CREATE TABLE IF NOT EXISTS chat_config (
      id VARCHAR(32) PRIMARY KEY,
      key VARCHAR(190) NOT NULL UNIQUE,
      value JSON NOT NULL,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,

    // Visitor sessions
    `CREATE TABLE IF NOT EXISTS visitor_sessions (
      id VARCHAR(32) PRIMARY KEY,
      session_id VARCHAR(190) NOT NULL UNIQUE,
      ip VARCHAR(45) NOT NULL,
      user_agent TEXT NULL,
      country VARCHAR(2) NULL,
      city VARCHAR(100) NULL,
      path VARCHAR(500) NULL,
      referrer VARCHAR(500) NULL,
      last_activity DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_session (session_id),
      INDEX idx_last_activity (last_activity)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`,
  ],
  down: [
    'DROP TABLE IF EXISTS visitor_sessions',
    'DROP TABLE IF EXISTS chat_config',
    'DROP TABLE IF EXISTS courier_log',
    'DROP TABLE IF EXISTS sms_log',
    'DROP TABLE IF EXISTS homepage_sections',
    'DROP TABLE IF EXISTS landing_pages',
    'DROP TABLE IF EXISTS incomplete_orders',
    'DROP TABLE IF EXISTS complaints',
    'DROP TABLE IF EXISTS otp',
    'DROP TABLE IF EXISTS rate_limits',
    'DROP TABLE IF EXISTS admin_tokens',
    'DROP TABLE IF EXISTS kv',
    'DROP TABLE IF EXISTS docs',
  ],
};
```

Then add `M0005` to `server/migrations/index.ts`:
```typescript
import M0005 from './0005_admin_panel_full';

export const migrations: Migration[] = [
  M0003,
  M0004,
  M0005,   // ← ADD THIS
];
```

Run migration:
```bash
node -r ts-node/register scripts/migrate.ts up
```

---

## 6. UNSTABLE CHANGES SUMMARY

Since this is a large architectural change affecting both frontend and backend, each phase will introduce unstable changes that need careful testing:

| Component | Unstable Change | Risk Level | Mitigation |
|-----------|----------------|------------|------------|
| `src/components/admin/Modal.tsx` | New modal system replacing all page-based CRUD | 🔴 HIGH | Keep old pages as fallback during transition |
| `src/hooks/useDb.ts` | New real-time polling hook | 🟡 MEDIUM | Graceful degradation if sync fails |
| `src/lib/store-admin.ts` | New Zustand store for admin state | 🟡 MEDIUM | Double-source until stable |
| `server/routes/admin/complaints.ts` | Brand new route file | 🔴 HIGH | Thorough integration testing |
| `server/routes/admin/chatConfig.ts` | New endpoint with external AI calls | 🟡 MEDIUM | Mock external services in tests |
| Migration 0005 | Schema changes to production DB | 🔴 HIGH | Run on staging first, backup before deploying |
| `kv` seeding | Changes default behavior | 🟢 LOW | Idempotent inserts (INSERT IGNORE) |
| Rate limit table | New DB lookup | 🟡 MEDIUM | Keep Redis as primary, SQL as fallback |

---

## 7. PHASED IMPLEMENTATION PLAN

### Phase 1: Foundation (Week 1-2)

**Goal**: Database schema + universal components + auth guard + polling sync

| Task | Deliverable | Verification |
|------|-------------|--------------|
| 1.1 | Run migration 0005 (all 13 new tables) | `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='bunonfabrics_dash_db' AND table_name IN ('docs','kv','admin_tokens','complaints','incomplete_orders','landing_pages','homepage_sections','sms_log','courier_log','chat_config','visitor_sessions')` should return 13 |
| 1.2 | Seed `kv` defaults (settings, home, etc.) | Query specific keys exist in `kv` table |
| 1.3 | Universal UI kit: `Modal`, `Field`, `ImageUploader`, `Pill`, `Kpi`, `Panel`, `Toast`, `Empty`, `Chips`, `HBars` + formatting utils (`tk`, `fdate`, `ago`, `startOfDay`) | Render each component in isolation |
| 1.4 | Extend existing `src/components/admin/ui.tsx` patterns (StatCard, SectionHeader, StatusPill, photo helpers) | Same visual style preserved |
| 1.5 | AdminLayout sidebar/header (reuse existing, add sync indicator badge) | Navigation works |
| 1.6 | Polling sync: `/sync/poll` endpoint + `useDb` hook (Zustand-based, no React Query dependency yet) | Verify 30s refresh |
| 1.7 | JWT auth guard (extend existing auth middleware) | Protected routes work |
| 1.8 | Enable TypeScript strict mode in tsconfig.json | `npm run lint` passes clean |

### Phase 2: Core Entities (Week 2-3)

Convert existing page-based CRUD to modal-driven:
| Entity | Current | Target |
|--------|---------|--------|
| Products | `ProductsManager.tsx` (page) | Modal CRUD inside shared layout |
| Categories | `CategoriesManager.tsx` (page) | Modal CRUD |
| Coupons | `CouponsManager.tsx` (page) | Modal CRUD |
| Orders | `OrdersManager.tsx` (page) | Modal detail, inline status transitions |

### Phase 3: Orders + Courier + SMS (Week 3-4)
| Feature | Source | Integration |
|---------|--------|-------------|
| Order SMS auto-send | `server/routes/admin/orders.ts` | Use `sms_log` table |
| Courier tracking history | `server/routes/admin/couriers.ts` | Use `courier_log` table |
| Fraud check widget | Existing `fraud.ts` | Display in order modal |

### Phase 4: Settings + Team + Permissions (Week 4)
| Feature | Data | UI |
|---------|------|----|
| Settings 6-tabs | `kv` table | Modal per tab |
| Team matrix | `admin_tokens` + `kv.team` | Visual role grid |
| Permissions editor | `kv.team` | Checkbox matrix |

### Phase 5: Advanced Features (Week 5-6)
| Feature | New Route | New Tables |
|---------|-----------|------------|
| Complaints workflow | `server/routes/admin/complaints.ts` | `complaints` |
| SMS system | `server/routes/admin/sms.ts` | `sms_log`, `kv.smsGateway`, `kv.smsTemplates` |
| Landing page builder | `server/routes/admin/landings.ts` | `landing_pages` |
| Homepage editor | `server/routes/admin/homepage.ts` | `homepage_sections` |
| Live chat config | `server/routes/admin/chatConfig.ts` | `chat_config` |
| Incomplete orders | `server/routes/admin/incomplete.ts` | `incomplete_orders` |
| Live visitors | `server/routes/admin/visitors.ts` | `visitor_sessions` |

### Phase 6: Dashboard + Analytics (Week 6-7)
Enhance existing `Dashboard.tsx` and `MetaKpi.tsx`:
- Smart insights widget
- Courier performance chart
- SLA tracker for complaints
- Live visitor presence map

### Phase 7: Testing + Deployment (Week 7-8)
See verification checklist in Section 7.x below.

---

## 8. VERIFICATION CHECKLIST

### 8.1 TypeScript & Lint Pass
```bash
npm run lint          # tsc --noEmit must return 0 errors
npm run build         # vite build must succeed
```

### 8.2 Backend Migration Verification
```bash
# Confirm all 13 new tables exist
node -e "
  const { dbPool } = require('./server/db');
  (async () => {
    const [rows] = await dbPool.execute(\`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = DATABASE() 
      AND table_name IN ('docs','kv','admin_tokens','rate_limits','otp',
        'complaints','incomplete_orders','landing_pages','homepage_sections',
        'sms_log','courier_log','chat_config','visitor_sessions')
      ORDER BY table_name
    \`);
    console.log('Tables:', rows.map(r => r.table_name));
    process.exit(rows.length === 13 ? 0 : 1);
  })();
"
```

### 8.3 API Endpoint Smoke Tests
```bash
# Test a few critical endpoints after each phase
curl -s http://localhost:3000/api/admin/settings/general
curl -s http://localhost:3000/api/admin/complaints?limit=5
curl -s http://localhost:3000/api/admin/kv/home.sections
```

### 8.4 Manual UI Walkthrough
For every admin page:
1. Open the page
2. Click every button
3. Trigger every modal
4. Submit a form and verify data persisted
5. Check browser network tab for API calls

### 8.5 Migration Rollback Test
```bash
# Verify you can roll back safely
node -r ts-node/register scripts/migrate.ts down 0005
# Confirm tables dropped
# Re-run to confirm it's idempotent
node -r ts-node/register scripts/migrate.ts up
```

---

## 9. UNSAFE OPERATIONS (Must Review Before Each Phase)

These operations modify production data. **Never skip backup.**

| Operation | What It Does | Risk | Safe Pattern |
|-----------|-------------|------|--------------|
| `migrate.ts up 0005` | Creates 13 new tables | Low (idempotent, IF NOT EXISTS) | Test on staging first |
| `kv` seed INSERT IGNORE | Populates defaults | Very low | No-op if already exists |
| Drop unused pages | Removes `.tsx` files | Medium | Comment out router entries first, monitor for 24h, then delete |
| Changing API response shape | Returns different JSON | High | Add deprecation header, keep old endpoint working |
| Adding columns to existing tables (e.g. `bunon_products.inside_delivery_fee`) | Schema change | Medium | Always `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` |

---

## 10. EXPOSED ENDPOINTS TO REVIEW

New routes added during this project:
- `POST /api/admin/complaints` — create complaint
- `GET /api/admin/complaints/:id` — get complaint detail
- `PATCH /api/admin/complaints/:id/status` — status transition
- `POST /api/admin/sms/send` — send SMS (uses sms_log)
- `GET /api/admin/sms/templates` — list templates
- `PUT /api/admin/sms/templates/:id` — update template
- `GET /api/admin/landings` — list landing pages
- `POST /api/admin/landings` — create landing page
- `GET /api/admin/homepage/sections` — get homepage config
- `POST /api/admin/homepage/sections` — add/reorder section
- `GET /api/admin/visitors/live` — live presence
- `DELETE /api/admin/visitors/:sessionId` — force remove visitor
- `POST /api/admin/sync/poll` — real-time sync endpoint

All existing routes are preserved. New routes coexist alongside.

---

## 11. FILES TO CREATE OR MODIFY

### New Files (approximate locations)
```
server/migrations/0005_admin_panel_full.ts
server/routes/admin/complaints.ts
server/routes/admin/sms.ts
server/routes/admin/landings.ts
server/routes/admin/homepage.ts
server/routes/admin/incomplete.ts
server/routes/admin/visitors.ts
server/routes/admin/chatConfig.ts
src/components/admin/Modal.tsx
src/components/admin/Field.tsx
src/components/admin/ImageUploader.tsx
src/components/admin/Pill.tsx
src/components/admin/Kpi.tsx
src/components/admin/Panel.tsx
src/components/admin/Toast.tsx
src/components/admin/Empty.tsx
src/components/admin/Chips.tsx
src/components/admin/HBars.tsx
src/hooks/useDb.ts
src/hooks/usePollingSync.ts
src/lib/store-admin.ts          # new Zustand store for admin state
src/lib/formatUtils.ts
```

### Modified Files
```
server/migrations/index.ts                          # add M0005 import + entry
server/routes/admin/index.ts                        # register new route files
server/routes/admin/products.ts                     # extend with new fields if needed
src/App.tsx                                         # add new admin routes
src/pages/admin/AdminLayout.tsx                     # update sidebar navigation
src/components/admin/ui.tsx                         # extend with new base patterns
tsconfig.json                                       # add "strict": true
package.json                                        # add react-query (optional)
```

---

## 12. DEPENDENCIES TO ADD

```bash
# Already installed (verified):
#   zustand ^5.0.13
#   react-router-dom ^7.15.1
#   axios ^1.17.0
#   lucide-react ^0.546.0
#   recharts ^3.9.0
#   redis ^6.0.1

# NEW — optional but recommended:
# npm i @tanstack/react-query
# npm i date-fns

# If adding Prisma later (NOT recommended — stick with raw SQL):
# npm i -D prisma @prisma/client
```

---

## 13. TESTING STRATEGY

### Unit Tests (Vitest — if configured)
Each new utility function gets its own test:
- `formatUtils.ts` → number formatting, date formatting
- `store-admin.ts` → Zustand store actions
- Server routes → input validation, error handling

### Integration Tests (Postman/newman or Playwright)
- Authentication flow: login → get token → call protected endpoint
- CRUD cycle: create → read → update → delete → verify removed
- Edge cases: missing fields, wrong types, unauthorized access

### Manual Regression Checklist
After each phase, verify these still work:
- [ ] Login / logout
- [ ] Product listing (page)
- [ ] Order listing (page)
- [ ] Category listing (page)
- [ ] Coupon listing (page)
- [ ] Dashboard load
- [ ] Settings save/load
- [ ] Customer search
- [ ] Cart checkout (public site)

---

## 14. ROLLBACK PLAN

If any phase introduces breaking behavior:
1. **Frontend regression**: Git revert the commit(s), restart dev server
2. **Backend regression**: Stop Node, revert code, restart
3. **Schema problem**: Run `node -r ts-node/register scripts/migrate.ts down 0005` then fix migration script and re-up
4. **Data loss risk**: Never drop production tables without backup. `mysqldump` the DB first.

---

## 15. PHASE GATES (Do not proceed to next phase until gate is green)

| Gate | Checkpoint | Exit Condition |
|------|------------|----------------|
| **Phase 1 → 2** | Migration 0005 applied, all 13 tables exist | `migrate status` shows 0005 applied ✓ |
| | TypeScript strict mode enabled | `npm run lint` returns 0 errors ✓ |
| | Universal components render in Storybook/isolation | Screenshot evidence attached ✓ |
| **Phase 2 → 3** | Products/Categories/Coupons/Orders converted to modal-driven | Manual walk-through complete ✓ |
| **Phase 3 → 4** | SMS/courier integration tested end-to-end | Sample SMS sent ✓ |
| **Phase 4 → 5** | Settings persist to `kv`, team roles work | Admin login with new role succeeds ✓ |
| **Phase 5 → 6** | Complaints/SMS/Landing/Home/Chat/Visitors all functional | E2E flow tested ✓ |
| **Phase 6 → 7** | Dashboard enhanced, all analytics accurate | Screenshots match expected values ✓ |
| **Phase 7 → Done** | Full manual + automated verification pass | Verdict: PASS (see Section 8) ✓ |

---

*Plan verified against Bunon codebase — 2026-11-24*
*Discrepancy found: original draft referenced Prisma; Bunon uses raw SQL — corrected above.*
