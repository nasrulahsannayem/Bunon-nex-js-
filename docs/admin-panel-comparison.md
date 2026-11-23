# Admin Panel Architecture Comparison: Reference Repo (fatiha-salah-chair) vs Bunon Shop

## Executive Summary

| Aspect | Reference Repo (fatiha-salah-chair) | Bunon Shop |
|--------|-------------------------------------|------------|
| **Tech Stack** | PHP 8 + MySQL/SQLite + Vanilla JS (React via CDN) | TypeScript/Express.js + React 19 + Vite 6 |
| **Admin Architecture** | **Frontend Modal-Driven**: ALL features managed via React modals with real-time state sync | **Backend API-Driven**: Many features hardcoded, managed via REST API endpoints |
| **Data Storage** | Document-based (`docs` table with JSON collections) + Key-Value (`kv` table) | Relational (MySQL - dual DB: `bunon_shop_db` + `bunonfabrics_dash_db`) |
| **Auth** | Token-based (admin/customer), OTP, rate limiting (`rl` table) | JWT + Access/Refresh tokens, Redis caching |
| **State Sync** | Polling (`/admin/poll`, `/admin/sync`) + `useDb` hook with localStorage fallback | React Query / SWR + Zustand stores |
| **Courier** | Steadfast integration built-in | Custom delivery fee system (per-product) |

---

## 1. Products Management

### Reference Repo - `Products.jsx` (Modal-Driven)

**Modal Form Fields:**
- Basic: `name`, `slug`, `description`, `shortDesc`, `price`, `salePrice`, `sku`, `barcode`
- Stock: `stock`, `lowStock`, `trackStock` (inline editing in table)
- Categories: Multi-select checkboxes for categories + subcategories
- Color Groups: Multi-select with "Create color variant" action
- SEO: `seoTitle`, `seoDesc`, `seoKeywords`, `canonicalUrl`
- Media: Image uploader (drag-drop, multi-select, reorder, delete)
- Advanced: `weight`, `dimensions`, `tags`, `featured`, `visible`, `meta`

**Key Modal Actions:**
- **Create Product**: Full modal form
- **Edit Product**: Pre-filled modal form
- **Duplicate**: Creates copy with "(Copy)" suffix
- **Create Color Variant**: Duplicates with selected color group
- **Inline Stock Edit**: Click stock cell → edit → save via `save('products', p.id, {stock})`
- **Delete**: Confirmation modal

**State Management:**
```jsx
const db = useDb('products')  // Real-time sync via polling
const [editingStock, setEditingStock] = useState(null)
```

### Bunon Shop - `ProductsManager.tsx` (API-Driven)

**Current Implementation:**
- Table-based listing with pagination
- Separate "Add Product" page/modal (not fully modal-driven)
- Product promotion fields: `isPromoted`, `promoPrice`, `promoBadge`, `promoStart`, `promoEnd`
- Per-product custom delivery charges (`delivery_fee`)
- Backend API endpoints for CRUD

**Gaps vs Reference:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Subcategory multi-select in modal | ✅ | ❌ |
| Color group management in modal | ✅ | ❌ |
| Inline stock editing in table | ✅ | ❌ |
| Duplicate / Color variant actions | ✅ | ❌ |
| SEO fields in modal | ✅ | Partial |
| Image reorder/drag-drop in modal | ✅ | ❌ |
| Real-time sync (polling) | ✅ | Via React Query |

---

## 2. Orders Management

### Reference Repo - `Orders.jsx` (Tabbed Modal-Driven)

**Tabs (Status-based):**
```
All Orders | pending | confirmed | processing | shipped | delivered | cancelled | returned
```

**Order Card/Modal Features:**
- Customer info with phone/email (click to call/WhatsApp)
- Items with images, variants, quantities, prices
- Coupon display with discount breakdown
- Shipping address with country flag
- Payment method badge (COD/Online/Bank)
- **Fraud Check**: Phone-based risk scoring with visual badge
- **Courier Integration (Steadfast)**:
  - Create shipment button
  - Track button (opens tracking URL)
  - Courier history log modal
  - Auto-refresh courier status
- **Status Transitions**: Dropdown with valid next states
- **SMS Sending**: Template-based (order_confirmed, shipped, delivered, etc.)
- **Cancellation/Return**: Reason selection modal
- **Invoice**: Print/Download

**Key Logic:**
```jsx
// Fraud check on phone
fraudCheck(phone, forceRefresh, callback)

// Steadfast courier
sendToCourier(order) → creates shipment, returns tracking
liveCourierRefresh(order) → polls courier status

// SMS with variables
sendSms(phone, SMS_EVENTS.ORDER_CONFIRMED, {orderId, name, ...})
```

**Real-time Features:**
- `liveCourierRefreshAll()` - refreshes all shipped orders
- Courier bell notification badge
- Polling every 30s for courier updates

### Bunon Shop - `OrdersManager.tsx`

**Current Implementation:**
- Basic order listing with status filters
- Order detail view
- Status update via API
- No built-in courier integration
- No fraud check
- No SMS templates system

**Gaps vs Reference:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Tabbed status filtering | ✅ | Basic filter |
| Fraud check (phone-based) | ✅ | ❌ |
| Steadfast courier integration | ✅ | ❌ |
| Courier history log | ✅ | ❌ |
| Auto courier status refresh | ✅ | ❌ |
| SMS template system | ✅ | ❌ |
| Cancellation/Return reason modals | ✅ | Basic |
| Invoice generation | ✅ | ❌ |
| Call/WhatsApp integration | ✅ | ❌ |

---

## 3. Categories Management

### Reference Repo - `Categories.jsx` (Inline + Modal)

**Features:**
- **Table with inline editing**: Click name/slug/order → edit → save
- **Modal for Create/Edit**: Name, slug, parent (for subcategories), image, description
- **SEO Fields**: `seoTitle`, `seoDesc`, `seoKeywords`, `canonicalUrl`
- **Campaign Link**: Custom URL for marketing campaigns
- **Image Uploader**: Drag-drop, preview, delete
- **Drag-Drop Ordering**: `dnd` library for reorder
- **Subcategory Support**: Hierarchical (parent_id)
- **Product Count Badge**: Shows products per category

**State:**
```jsx
const db = useDb('categories')
const [editing, setEditing] = useState(null) // inline edit
```

### Bunon Shop - `CategoriesManager.tsx`

**Current Implementation:**
- Basic CRUD via API
- Category tree structure
- No inline editing
- No SEO fields in UI
- No campaign links
- No drag-drop ordering

**Gaps vs Reference:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Inline editing (name, slug, order) | ✅ | ❌ |
| Subcategory hierarchy in modal | ✅ | Basic |
| SEO fields | ✅ | ❌ |
| Campaign link | ✅ | ❌ |
| Drag-drop reordering | ✅ | ❌ |
| Product count badge | ✅ | ❌ |
| Image uploader in modal | ✅ | ❌ |

---

## 4. Settings Management

### Reference Repo - `Settings.jsx` (6-Tab Modal System)

**Tabs:**
1. **General**: Store name, phone, email, address, currency, timezone, maintenance mode, social links (FB, Insta, YouTube, TikTok, WhatsApp)
2. **Shipping**: Default fee, free shipping threshold, COD fee, shipping zones (JSON)
3. **Tracking**: GA ID, FB Pixel, TikTok Pixel, custom head/body scripts
4. **SEO**: Default title, description, keywords, OG image, robots.txt, sitemap settings
5. **Courier (Steadfast)**: API key, secret, sandbox mode, pickup address, return address
6. **Staff & Backup**: Team management link, database backup (download), restore (upload)

**Key Features:**
- All settings in `kv` table (key-value)
- `save('kv', key, value)` for instant persistence
- Backup/Restore: SQL dump download/upload
- Courier credentials encrypted in KV

### Bunon Shop - `SettingsManager.tsx`

**Current Implementation:**
- General settings (store info, currency)
- Shipping settings (delivery fee)
- SEO settings
- No courier integration tab
- No backup/restore
- No tracking pixels UI
- Settings stored in database tables (not KV)

**Gaps vs Reference:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| 6-tab organization | ✅ | Partial |
| Shipping zones (JSON) | ✅ | ❌ |
| Tracking pixels (GA, FB, TikTok) | ✅ | ❌ |
| Courier credentials management | ✅ | ❌ |
| Backup/Restore UI | ✅ | ❌ |
| Maintenance mode toggle | ✅ | ❌ |
| Social links management | ✅ | ❌ |
| KV-based instant save | ✅ | DB-based |

---

## 5. Team / Roles Management

### Reference Repo - `Team.jsx` + `roles.js` (Role Cards + Permissions Matrix)

**5 Roles Defined:**
```javascript
const ROLES = {
  super_admin: { label: 'Super Admin', color: 'red', permissions: ['*'] },
  admin: { label: 'Admin', color: 'purple', permissions: ['orders','products','categories','coupons','customers','settings','team','landings','home','complaints','sms','incomplete','chat'] },
  order_manager: { label: 'Order Manager', color: 'blue', permissions: ['orders','customers','incomplete','complaints'] },
  support: { label: 'Support', color: 'green', permissions: ['orders','customers','complaints','chat','incomplete'] },
  content: { label: 'Content Manager', color: 'orange', permissions: ['products','categories','coupons','landings','home','sms'] }
}
```

**Permissions Matrix Table:**
- Rows: All permissions (orders, products, categories, coupons, customers, settings, team, landings, home, complaints, sms, incomplete, chat, courier, backup)
- Columns: 5 Roles
- Checkboxes for granular control

**Modal for Add/Edit Member:**
- Name, email, phone, password
- Role selector (radio cards)
- Status (active/inactive)
- Avatar upload

**Route-Permission Mapping:**
```javascript
const ROUTE_PERMISSIONS = {
  '/admin/orders': 'orders',
  '/admin/products': 'products',
  // ... etc
}
```

### Bunon Shop - `UsersRolesManager.tsx` + `TeamPage.tsx`

**Current Implementation:**
- User listing with roles
- Role assignment
- Basic permissions (likely simpler)
- No visual permissions matrix
- No role cards UI

**Gaps vs Reference:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| 5 predefined roles | ✅ | Partial |
| Visual role cards | ✅ | ❌ |
| Permissions matrix table | ✅ | ❌ |
| Route-permission mapping | ✅ | ❌ |
| `can()` helper function | ✅ | ❌ |
| Avatar upload in modal | ✅ | ❌ |
| Granular permissions (13+) | ✅ | Likely fewer |

---

## 6. Coupons Management

### Reference Repo - Managed via `Products.jsx` pattern (Modal)

**Coupon Fields (from `lib/core.php` collections):**
- `code`, `type` (percent/fixed), `value`, `minOrder`, `maxDiscount`
- `usageLimit`, `usedCount`, `perUserLimit`
- `startsAt`, `endsAt`, `active`
- `applicableProducts`, `applicableCategories` (arrays)
- `excludeProducts`, `excludeCategories`

**Modal Actions:**
- Create/Edit modal with all fields
- Product/Category multi-select for applicability
- Usage tracking
- Date range picker

### Bunon Shop - `CouponsManager.tsx`

**Current Implementation:**
- Basic coupon CRUD
- Likely has code, type, value, dates
- Missing: product/category targeting, usage limits per user

**Gaps vs Reference:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Product/Category targeting | ✅ | ❌ |
| Usage limit per user | ✅ | ❌ |
| Max discount cap | ✅ | ❌ |
| Exclude products/categories | ✅ | ❌ |

---

## 7. Customers Management

### Reference Repo - Inline in Orders/Incomplete (No dedicated page)

**Customer Data (from orders/incomplete):**
- Name, phone, email, address
- Order history
- Fraud score
- Notes/tags
- Call/WhatsApp buttons

**Management:**
- View in order detail modal
- Fraud check on phone
- SMS sending

### Bunon Shop - `CustomersManager.tsx`

**Current Implementation:**
- Dedicated customer listing page
- Customer detail view
- Order history
- More structured than reference

**Comparison:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Dedicated page | ❌ | ✅ |
| Order history | In order modal | ✅ |
| Fraud score | ✅ | ❌ |
| Call/WhatsApp integration | ✅ | ❌ |
| SMS from customer view | ✅ | ❌ |

---

## 8. Complaints Management

### Reference Repo - `Complaints.jsx` + `lib/complaints.php` (Full Workflow)

**Complaint Statuses:**
```
submitted → received → reviewing → processing → resolved | rejected
```

**Complaint Types:**
- `product`, `delivery`, `service`, `payment`, `refund`, `other`

**Customer Segments:**
- `new`, `returning`, `vip`, `wholesale`

**Routing Rules (from `lib/complaints.php`):**
- Auto-assign based on type/segment
- SLA deadlines per type
- Escalation rules

**Modal Features:**
- File uploads: Max 8 files (images ≤12MB, videos ≤60MB)
- Status transition dropdown
- Assignment to team member
- Internal notes
- SMS templates for each status change
- Customer reply thread

**SMS Templates:**
```php
$SMS_TEMPLATES = [
  'submitted' => 'Complaint received. Ref: {ref}',
  'resolved' => 'Complaint {ref} resolved. {note}',
  // ...
]
```

### Bunon Shop - (No dedicated complaints page found)

**Gap Analysis:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Full complaint workflow | ✅ | ❌ |
| Status lifecycle (6 states) | ✅ | ❌ |
| Type/Segment classification | ✅ | ❌ |
| Auto-routing rules | ✅ | ❌ |
| File uploads (8 files, 60MB video) | ✅ | ❌ |
| SMS templates per status | ✅ | ❌ |
| Internal notes thread | ✅ | ❌ |
| SLA monitoring | ✅ | ❌ |

---

## 9. Live Chat / Inbox

### Reference Repo - `LiveChat.jsx` (AI Chat Setup)

**4 Chat Modes:**
1. **Off** - Disabled
2. **Local** - Browser-only, no server
3. **Relay** - Server relays to AI provider
4. **Direct** - Client talks directly to AI provider

**Provider Selection:**
- OpenAI, Anthropic, Google, Custom endpoint
- API keys stored server-side (KV) - never exposed to client
- Model selection per provider

**Test Interface:**
- Live test chat in admin panel
- System prompt editor
- Temperature/max tokens settings
- Save to KV (`chatServer` key)

### Bunon Shop - `InboxPage.tsx`

**Current Implementation:**
- Basic message/inbox view
- Likely customer messages
- No AI chat configuration
- No provider management

**Gaps vs Reference:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| 4 chat modes | ✅ | ❌ |
| Provider selection (4+) | ✅ | ❌ |
| Server-side key storage | ✅ | ❌ |
| Test chat interface | ✅ | ❌ |
| System prompt editor | ✅ | ❌ |
| Model/temperature config | ✅ | ❌ |

---

## 10. SMS Management

### Reference Repo - `Sms.jsx` + `lib/sms.php`

**Gateway Config (KV `smsGateway`):**
```php
{
  provider: 'muthofun' | 'bulksmsbd',
  apiKey: '...',
  senderId: '...',
  sandbox: true/false
}
```

**Message Templates (KV `smsTemplates`):**
```php
{
  order_confirmed: 'Hi {name}, order {orderId} confirmed. Total: {total}',
  shipped: 'Order {orderId} shipped. Track: {trackUrl}',
  delivered: 'Order {orderId} delivered.',
  cancelled: 'Order {orderId} cancelled. Reason: {reason}',
  // ... custom templates
}
```

**Variables Available:**
`{name}`, `{phone}`, `{orderId}`, `{total}`, `{trackUrl}`, `{courier}`, `{items}`, `{reason}`, `{ref}`

**Features:**
- SMS Log table (date, phone, event, status, response)
- Test SMS sending modal
- Gateway connection test
- Template editor with variable picker
- Event-based auto-send (from `lib/orders.php`)

### Bunon Shop - (No dedicated SMS page found)

**Gap Analysis:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Multi-gateway support | ✅ | ❌ |
| Template system with variables | ✅ | ❌ |
| SMS log/history | ✅ | ❌ |
| Test sending modal | ✅ | ❌ |
| Event-based auto-send | ✅ | ❌ |
| Gateway connection test | ✅ | ❌ |

---

## 11. Landing Pages

### Reference Repo - `Landings.jsx` (Page Builder)

**Landing Page Fields:**
- `slug`, `title`, `subtitle`, `heroImage`
- `theme` (light/dark/custom)
- `countdownTimer` (date + timezone)
- **Product Linking**: Multi-select products to feature
- **Content Sections** (repeatable):
  - Headline + body
  - Benefits (icon + text grid)
  - FAQ (question/answer pairs)
  - Testimonials (name, role, text, avatar)
  - CTA buttons (text, URL, style)
- SEO fields
- Publish/Unpublish toggle

**Modal Builder:**
- Drag-drop section reordering
- Section type selector
- Live preview toggle

### Bunon Shop - (No dedicated landing page manager found)

**Gap Analysis:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Landing page builder | ✅ | ❌ |
| Product linking | ✅ | ❌ |
| Countdown timers | ✅ | ❌ |
| Content sections (benefits, FAQ, testimonials) | ✅ | ❌ |
| Drag-drop builder | ✅ | ❌ |
| Theme selection | ✅ | ❌ |
| SEO per landing | ✅ | ❌ |

---

## 12. Homepage Editor

### Reference Repo - `HomeEditor.jsx` (Section-Based)

**Homepage Sections (Ordered):**
1. **Hero Banners** - Multi-image carousel, links, scheduling
2. **Flash Sale** - Product picker, countdown timer, badge
3. **Hot Deals** - Product grid, auto/manual selection
4. **All Products** - Category filter, sort options
5. **Category Sections** - Per-category product grids (repeatable)
6. **Reviews** - Customer review carousel
7. **Custom HTML** - Raw HTML blocks

**Section Config:**
- `enabled`, `title`, `subtitle`
- `products` (picker with search)
- `category` (for category sections)
- `schedule` (start/end datetime)
- `layout` (grid/carousel/list)
- `limit` (number of products)

**Product Picker Modal:**
- Search by name/SKU
- Multi-select with checkboxes
- Selected chips with remove
- Category filter

### Bunon Shop - (No dedicated homepage editor found)

**Gap Analysis:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Section-based editor | ✅ | ❌ |
| Hero banner carousel | ✅ | ❌ |
| Flash sale with countdown | ✅ | ❌ |
| Category-based sections | ✅ | ❌ |
| Product picker modal | ✅ | ❌ |
| Datetime scheduling | ✅ | ❌ |
| Layout options per section | ✅ | ❌ |
| Custom HTML blocks | ✅ | ❌ |

---

## 13. Incomplete / Abandoned Orders

### Reference Repo - `Incomplete.jsx`

**Status Tracking:**
```
new → contacted → converted | dropped
```

**Features:**
- Auto-captured from checkout abandonment
- Customer info (name, phone, cart items, total)
- **Call Button**: `tel:` link
- **WhatsApp Button**: Pre-filled message with cart recovery link
- Status update modal (contacted/converted/dropped)
- Notes field for follow-up
- Filter by status/date
- "Open in Orders" if converted

**Recovery Link:**
```
/checkout?recover={incompleteId} → pre-fills cart
```

### Bunon Shop - (No dedicated incomplete page found)

**Gap Analysis:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Abandoned cart capture | ✅ | ❌ |
| 4-status lifecycle | ✅ | ❌ |
| Call/WhatsApp integration | ✅ | ❌ |
| Recovery link generation | ✅ | ❌ |
| Follow-up notes | ✅ | ❌ |
| Auto-convert to order | ✅ | ❌ |

---

## 14. Dashboard / Analytics

### Reference Repo - `Dashboard.jsx`

**KPIs (Real-time via polling):**
- Revenue (today, MTD, YTD)
- Orders count
- Conversion rate
- AOV (Average Order Value)
- Pending orders
- Low stock count

**Charts:**
- Revenue trend (7/30/90 days)
- Orders by status (doughnut)
- Top categories (horizontal bars)
- Top products (table with revenue)
- Courier performance (delivery %, returns %)

**Smart Insights:**
- "Revenue down 12% vs last week"
- "Product X low stock (5 left)"
- "Courier Y delivery rate dropped to 78%"
- "3 complaints unresolved > 24h"

**SLA Monitoring:**
- Complaint response time
- Order processing time
- Courier pickup time

**Live Visitors:**
- Real-time visitor count (via `presence.php`)
- Current page, referrer, country
- "Live" badge in header

### Bunon Shop - `Dashboard.tsx` + `MetaKpi.tsx` + `ReportsPage.tsx`

**Current Implementation:**
- KPI cards (MetaKpi)
- Basic charts
- Reports page
- No live visitors
- No smart insights
- No courier performance
- No SLA monitoring

**Gaps vs Reference:**
| Feature | Reference | Bunon |
|---------|-----------|-------|
| Live visitor tracking | ✅ | ❌ |
| Smart insights (auto-generated) | ✅ | ❌ |
| Courier performance charts | ✅ | ❌ |
| SLA monitoring | ✅ | ❌ |
| Real-time KPI updates (polling) | ✅ | Via React Query |
| Top products/categories tables | ✅ | Partial |

---

## 15. Core Architecture Differences

### Reference Repo: Document-Based + KV Store

**Database Schema (from `lib/core.php`):**
```sql
-- Documents table (JSON collections)
CREATE TABLE docs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  collection VARCHAR(64) NOT NULL,  -- 'products', 'orders', 'categories', etc.
  doc JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_collection (collection)
);

-- Key-Value store (settings, config)
CREATE TABLE kv (
  `key` VARCHAR(128) PRIMARY KEY,
  value JSON NOT NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tokens (auth)
CREATE TABLE tokens (
  token CHAR(64) PRIMARY KEY,
  type ENUM('admin','customer') NOT NULL,
  subject_id INT NOT NULL,
  data JSON,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rate limiting
CREATE TABLE rl (
  `key` VARCHAR(128) PRIMARY KEY,
  count INT DEFAULT 1,
  window_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- OTP
CREATE TABLE otp (
  phone VARCHAR(32) PRIMARY KEY,
  code VARCHAR(8) NOT NULL,
  attempts INT DEFAULT 0,
  expires_at TIMESTAMP NOT NULL
);
```

**Collections:** `products`, `categories`, `coupons`, `reviews`, `landings`, `chats`, `messages`, `incomplete`, `orders`, `smsLog`, `complaints`

**KV Keys:** `settings`, `home`, `pages`, `fraud`, `chatServer`, `voiceAi`, `smsGateway`, `smsTemplates`

### Bunon Shop: Relational MySQL (Dual DB)

**Databases:**
- `bunon_shop_db` - Main e-commerce data
- `bunonfabrics_dash_db` - Dashboard/admin data

**Tables (inferred):**
- `products`, `categories`, `orders`, `order_items`, `customers`, `coupons`
- `users`, `roles`, `permissions` (RBAC)
- `settings` (relational, not KV)
- `delivery_fees` (per-product)

**Redis:** Caching layer for sessions, queries

---

## 16. Modal Pattern Comparison

### Reference Repo: Universal Modal System (`ui.jsx`)

```jsx
// Modal component used EVERYWHERE
<Modal open={open} onClose={close} title="Title" size="lg|xl|full">
  <form onSubmit={handleSubmit}>
    <Field label="Name" name="name" required />
    <Field label="Description" name="desc" as="textarea" />
    <Field label="Category" name="catId" as="select" options={cats} />
    <Field label="Image" name="image" as="file" accept="image/*" multiple />
    <div className="flex justify-end gap-2">
      <button type="button" onClick={close}>Cancel</button>
      <button type="submit">Save</button>
    </div>
  </form>
</Modal>
```

**Modal Patterns Used:**
1. **Create/Edit Entity** - Products, Categories, Coupons, Team, Landings, Complaints
2. **Status Transition** - Orders, Complaints, Incomplete
3. **Configuration** - Settings tabs, SMS Gateway, Chat Providers
4. **Selection/Picker** - Product picker (HomeEditor, Landings), Category picker
5. **Confirmation** - Delete, Cancel order, Resolve complaint
6. **Detail View** - Order detail, Complaint detail, Customer detail
7. **Test Interface** - SMS test, Chat test
7. **Multi-step** - Landing page builder (sections)

### Bunon Shop: Mixed Patterns

**Current Patterns:**
- Dedicated pages for Create/Edit (not modals)
- Some modals for confirmation/delete
- No universal modal component
- Form handling via React Hook Form + Zod
- Separate API calls for each action

---

## 17. Real-Time / State Sync Comparison

### Reference Repo: Polling-Based Sync

```javascript
// In lib/core.php - admin/poll endpoint
/admin/poll?since={timestamp}&collections=products,orders,categories,...

// Returns:
{
  "products": {"123": {...}, "deleted": ["456"]},
  "orders": {"789": {...}},
  "serverTime": 1699999999
}

// Frontend (db.js):
const db = useDb('products')  // Subscribes to polling
// Auto-updates local state when server changes
```

**Polling Interval:** ~30 seconds (configurable)
**Collections Synced:** All admin-relevant collections

### Bunon Shop: React Query / SWR

```typescript
// Typical pattern
const { data: products } = useQuery({
  queryKey: ['products', filters],
  queryFn: () => api.getProducts(filters),
  refetchInterval: 30000,  // Optional polling
});
```

**Differences:**
- Reference: Server pushes changes via polling response (deltas)
- Bunon: Client refetches full lists or uses cache invalidation
- Reference: Single `useDb` hook for all collections
- Bunon: Separate queries per resource

---

## 18. File Upload Handling

### Reference Repo: Unified Upload System

**Endpoints:**
- `POST /admin/upload` - Single file → returns `{url, path}`
- `POST /admin/upload-multi` - Multiple files → returns array
- `POST /admin/mirror-image` - Fetch external URL → store locally

**Constraints (from `lib/complaints.php`):**
- Images: Max 12MB, types: jpeg, png, webp, gif
- Videos: Max 60MB, types: mp4, webm, mov
- Max 8 files per complaint
- Stored in `public/uploads/{year}/{month}/`

**Frontend:** `ImageUploader` component (drag-drop, preview, reorder, delete)

### Bunon Shop: Separate Upload Handling

**Current:** Likely separate upload endpoints per feature
**Gap:** No unified uploader component visible

---

## 19. Authentication & Authorization

### Reference Repo: Token-Based + Role Matrix

**Auth Flow:**
1. Login → `/admin/auth/login` → returns token
2. Token stored in localStorage
3. All requests: `Authorization: Bearer {token}`
4. `requireAdmin()` validates token, checks `tokens` table
5. `can(permission)` checks role permissions matrix

**Roles:** 5 predefined with 13 permissions
**Route Guards:** `ROUTE_PERMISSIONS` mapping

### Bunon Shop: JWT + RBAC

**Auth Flow:**
1. Login → returns access + refresh tokens
2. Access token in memory, refresh in httpOnly cookie
3. JWT middleware validates
4. RBAC via `UsersRolesManager` / `TeamPage`

**Differences:**
- Reference: Simpler token table, no refresh tokens
- Bunon: Industry-standard JWT with refresh rotation
- Reference: Permissions matrix in frontend (`roles.js`)
- Bunon: Permissions likely in database

---

## 20. Summary: What Bunon Needs to Match Reference

### High Priority (Core Admin Features Missing)

| Feature | Reference Implementation | Bunon Gap |
|---------|-------------------------|-----------|
| **Complaints System** | Full workflow with 6 statuses, routing, SMS, files | Missing entirely |
| **SMS Management** | Gateway config, templates, log, test sending | Missing entirely |
| **Live Chat AI Config** | 4 modes, provider management, test interface | Basic inbox only |
| **Landing Page Builder** | Drag-drop sections, product linking, countdown | Missing |
| **Homepage Editor** | Section-based, scheduling, product pickers | Missing |
| **Incomplete Orders** | Abandoned cart recovery with WhatsApp/Call | Missing |
| **Courier Integration** | Steadfast: create/track/history/auto-refresh | Custom delivery fee only |

### Medium Priority (Enhanced Modals)

| Feature | Reference | Bunon Needs |
|---------|-----------|-------------|
| **Universal Modal Component** | `Modal` in `ui.jsx` used everywhere | Create reusable Modal |
| **Inline Table Editing** | Click-to-edit stock, name, order | Add to all managers |
| **Drag-Drop Reordering** | Categories, Home sections, Landing sections | Add where needed |
| **Product Picker Modal** | Search + multi-select + chips | For promotions, homepage |
| **Image Uploader Component** | Drag-drop, reorder, multi, delete | Unified uploader |
| **Permissions Matrix UI** | Visual table (roles × permissions) | Add to Team/Roles |

### Low Priority (Polish)

| Feature | Reference | Bunon |
|---------|-----------|-------|
| **Smart Dashboard Insights** | Auto-generated alerts | Add analytics |
| **Live Visitor Tracking** | Presence system | Add if needed |
| **Backup/Restore UI** | SQL dump download/upload | Add to Settings |
| **Maintenance Mode Toggle** | In Settings > General | Add |
| **Courier Credentials UI** | In Settings > Courier | Add if integrating |

---

## 21. Implementation Recommendations

### Phase 1: Core Missing Features
1. **Complaints System** - New page + backend + SMS integration
2. **SMS Management** - Gateway config + templates + log
3. **Incomplete Orders** - Capture + recovery flow

### Phase 2: Content Management
4. **Landing Page Builder** - Section-based builder
5. **Homepage Editor** - Section management + scheduling
6. **Live Chat Config** - AI provider management

### Phase 3: UX Unification
7. **Universal Modal System** - Extract `Modal`, `Field`, `ImageUploader`
8. **Inline Editing** - Add to Products, Categories, Orders tables
9. **Drag-Drop** - Categories, Home sections
10. **Permissions Matrix** - Visual RBAC UI

### Phase 4: Advanced
11. **Courier Integration** - If Steadfast or similar needed
12. **Smart Insights** - Dashboard analytics
13. **Backup/Restore** - Settings feature

---

## 22. Technical Debt / Architecture Notes

### Reference Repo Strengths to Adopt
1. **Single `useDb` hook** - Eliminates boilerplate for data fetching
2. **KV store for settings** - Simpler than relational settings tables
3. **Modal-first UX** - Faster workflow, fewer page loads
4. **Polling sync** - Real-time feel without WebSockets
5. **Unified components** - `Modal`, `Field`, `Pill`, `Kpi`, `ImageUploader` shared everywhere

### Bunon Strengths to Keep
1. **TypeScript** - Type safety across stack
2. **React 19 + Vite 6** - Modern tooling
3. **JWT + Refresh tokens** - Better security
4. **Redis caching** - Performance
5. **Dual DB separation** - Clean architecture
6. **Zustand + React Query** - Modern state management
7. **Relational schema** - Better for complex queries

### Recommended Hybrid Approach
- Keep Bunon's TypeScript/React/Express stack
- Adopt Reference's **modal-first UX patterns** and **unified components**
- Add **KV-like settings table** for admin config
- Implement **polling sync** for real-time admin updates
- Build **universal modal/form components** to reduce boilerplate

---

## Appendix: File Mapping

### Reference Repo Admin Files
```
src/admin/
├── AdminApp.jsx          # Main router, auth, layout, sync
├── Dashboard.jsx         # KPIs, charts, insights, live visitors
├── Products.jsx          # Product management (modal-driven)
├── Orders.jsx            # Order management (tabs + courier + SMS)
├── Categories.jsx        # Category management (inline + modal)
├── Settings.jsx          # 6-tab settings (KV-driven)
├── Team.jsx              # Team/roles (cards + matrix)
├── Complaints.jsx        # Complaint workflow
├── Landings.jsx          # Landing page builder
├── HomeEditor.jsx        # Homepage section editor
├── Incomplete.jsx        # Abandoned cart recovery
├── LiveChat.jsx          # AI chat configuration
├── Sms.jsx               # SMS gateway + templates + log
├── roles.js              # 5 roles, 13 permissions, can()
├── ui.jsx                # Modal, Field, Pill, Kpi, Panel, Toast, etc.
└── courierLog.jsx        # Courier history modal
```

### Bunon Shop Admin Pages (23 files)
```
src/pages/admin/
├── Dashboard.tsx
├── OrdersManager.tsx
├── ProductsManager.tsx
├── SettingsManager.tsx
├── UsersRolesManager.tsx
├── CouponsManager.tsx
├── CategoriesManager.tsx
├── CustomersManager.tsx
├── InboxPage.tsx
├── InventoryPage.tsx
├── ReturnsPage.tsx
├── TeamPage.tsx
├── MetaKpi.tsx
├── ReportsPage.tsx
├── PromotionsManager.tsx
├── ProductReviewsManager.tsx
├── CouponAnalytics.tsx
├── CouponManager.tsx
├── FooterManager.tsx
├── HeroManager.tsx
├── NavigationManager.tsx
├── PageBuilder.tsx
└── SiteSettings.tsx
```

### Missing in Bunon (Exist in Reference)
- `ComplaintsManager.tsx`
- `SmsManager.tsx`
- `LiveChatConfig.tsx`
- `LandingPagesManager.tsx`
- `HomepageEditor.tsx`
- `IncompleteOrdersManager.tsx`
- `CourierIntegration.tsx`
- Universal `Modal`, `Field`, `ImageUploader` components

---

*Document generated from comprehensive analysis of reference repo (fatiha-salah-chair) and Bunon Shop codebases.*