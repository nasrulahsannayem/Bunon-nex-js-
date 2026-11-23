# Admin Panel Documentation Index

## Documents

| Document | Lines | Description |
|----------|-------|-------------|
| [Admin Panel Comparison](./admin-panel-comparison.md) | 1,023 | Complete feature-by-feature comparison between reference repo (fatiha-salah-chair) and Bunon Shop |
| [Implementation Plan](./admin-panel-implementation-plan.md) | 1,047 | Full phased implementation plan with DB schema, API routes, component library, verification checklist |
| [Architecture Overview](./01-architecture.md) | 205 | Project architecture documentation |
| [Pages & Routes](./02-pages-routes.md) | 159 | Admin page routing structure |
| [Features List](./03-features.md) | 205 | Feature inventory |
| [API Routes](./04-api-routes.md) | 259 | API endpoint documentation |
| [Integrations](./05-integrations.md) | 215 | External service integrations |
| [Database Schema](./06-database.md) | 191 | Database design |
| [Cron Jobs](./07-cron-jobs.md) | 156 | Scheduled tasks |
| [Deployment Guide](./08-deployment.md) | 212 | Production deployment |

## Quick Start

### Read Sequence for Full Understanding
1. **Start here**: [Admin Panel Comparison](./admin-panel-comparison.md) — understand what exists vs what's needed
2. **Then**: [Implementation Plan](./admin-panel-implementation-plan.md) — follow the phased build order
3. **Reference**: [Existing Architecture](./01-architecture.md) — understand Bunon's current stack

### Key Files Referenced
- Reference repo: https://github.com/nasrulahsannayem/fatihaayatsalahchair/tree/main/fatiha-salah-chair/src/admin
- Current Bunon admin pages: `src/pages/admin/*.tsx` (28 files)
- Existing components: `src/components/ImagePicker.tsx`, `src/components/AdminRoute.tsx`, `src/pages/admin/AdminLayout.tsx`

### Current Bunon Stack (Confirmed)
- React 19 + TypeScript strict mode
- Vite 6 + Tailwind CSS
- Zustand + React Query (TanStack)
- Express.js backend + MySQL (dual DB)
- Redis caching
- JWT + Refresh token auth
- Prisma ORM

### What's Already Built (Bunon vs Reference)
| Feature | Bunon Status | Reference Has | Gap |
|---------|-------------|---------------|-----|
| Products CRUD | ✅ Page-based | ✅ Modal-driven | Convert to modal |
| Categories CRUD | ✅ Page-based | ✅ Inline+Modal | Convert to modal |
| Orders Management | ✅ Basic | ✅ Tabs+Courier+SMS | Missing courier/SMS |
| Coupons CRUD | ✅ Basic | ✅ Targeting | Missing targeting |
| Settings | ✅ Partial | ✅ KV 6-tab | Incomplete |
| Team/Roles | ✅ Basic | ✅ Matrix | Missing visual matrix |
| Complaints | ❌ Missing | ✅ Full workflow | Build from scratch |
| SMS System | ❌ Missing | ✅ Gateway+Templates | Build from scratch |
| Landing Pages | ✅ PageBuilder | ✅ Builder | Merge/enhance |
| Homepage Editor | ✅ HeroManager | ✅ Section editor | Enhance |
| Incomplete Orders | ✅ AbandonedCarts | ✅ Recovery flow | Verify parity |
| Live Chat | ✅ InboxPage | ✅ AI config | Add AI config |
| Courier Integration | ⚠️ Delivery fee only | ✅ Steadfast | Need integration |
| Dashboard Insights | ✅ MetaKpi | ✅ Smart insights | Enhance |
| Live Visitors | ❌ Missing | ✅ Presence | Build from scratch |
| Backup/Restore | ❌ Missing | ✅ SQL dump | Build from scratch |
| Universal Components | ❌ Missing | ✅ Modal,Field,Uploader | Build new lib |

### Phases Summary
- **Phase 1**: Foundation (components, sync, auth) — Week 1-2
- **Phase 2**: Core Entities (Products, Categories, Coupons) — Week 2-3
- **Phase 3**: Orders + Courier + SMS — Week 3-4
- **Phase 4**: Settings + Team + Permissions — Week 4
- **Phase 5**: Advanced Features (Complaints, Landings, HomeEditor, Chat) — Week 5-6
- **Phase 6**: Dashboard + Analytics + Polish — Week 6-7
- **Phase 7**: Testing + Verification + Deployment — Week 7-8