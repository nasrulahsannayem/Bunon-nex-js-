# ০২ — সব পেইজ ও রুট

`src/App.tsx`-এ মোট **৪৭টি `<Route>`**। ৪৫টি `lazy()` দিয়ে লোড হয় (শুধু Home সরাসরি import)।

---

## পাবলিক সাইট — ২৪টি রুট

| # | রুট | পেইজ | বিবরণ |
|---|---|---|---|
| 1 | `/` | `Home` | হিরো, ফ্ল্যাশ সেল, ক্যাটাগরি, টেস্টিমোনিয়াল, ট্রাস্টবার, সোশ্যাল ফিড |
| 2 | `/shop` | `Shop` | সব পণ্য, সার্চ, ফিল্টার |
| 3 | `/product-category/:slug` | `CategoryPage` | ক্যাটাগরি ভিত্তিক তালিকা |
| 4 | `/product/:id` | `ProductDetail` | গ্যালারি, ভ্যারিয়েন্ট, স্টক, ডিসকাউন্ট, SEO JSON-LD |
| 5 | `/checkout` | `Checkout` | COD / bKash / PayStation |
| 6 | `/order-received` | `OrderReceived` | অর্ডার কনফার্মেশন |
| 7 | `/track` | `TrackOrder` | Steadfast ট্র্যাকিং |
| 8 | `/wishlist` | `Wishlist` | পছন্দের পণ্য |
| 9 | `/login` | `Login` | ইউজার লগইন |
| 10 | `/profile` | `Profile` | প্রোফাইল, অর্ডার লিস্ট |
| 11 | `/about` | `About` | সম্পর্কে |
| 12 | `/contact` | `Contact` | যোগাযোগ |
| 13 | `/refund-policy` | `RefundPolicy` | রিফান্ড পলিসি |
| 14 | `/terms` | `Terms` | শর্তাবলী |
| 15 | `/privacy-policy` | `Privacy` | প্রাইভেসি |
| 16 | `/dmca` | `DMCA` | DMCA নোটিশ |
| 17 | `/blog` | `Blog` | ব্লগ লিস্ট |
| 18 | `/blog/:slug` | `BlogDetail` | ব্লগ পড়া |
| 19 | `/:slug` | `LegacyBlogSlug` | পুরানো WP slug → redirect |
| 20 | `/telesales` | `TeleSalesRecruitment` | টেল-সেল্স রিক্রুটমেন্ট ফর্ম |
| 21 | `/p/sare` | `LandingSare` | সেলুন ল্যান্ডিং পেইজ |
| 22 | `/carbmw` | `LandingCarBMW` | BMW কার ল্যান্ডিং পেইজ |
| 23 | `/admin/login` | `AdminLogin` | অ্যাডমিন লগইন |
| 24 | `*` | — | `→ /` redirect |

---

## অ্যাডমিন — ২৩টি রুট

সবগুলো `/admin` এর নিচে, `AdminLayout` র্যাপে।

| # | রুট | পেইজ | পারমিশন |
|---|---|---|---|
| 1 | `/admin` | `Dashboard` | `view_dashboard` |
| 2 | `/admin/orders` | `OrdersManager` | `view_orders` |
| 3 | `/admin/products` | `ProductsManager` | `view_products` |
| 4 | `/admin/categories` | `CategoriesManager` | `view_categories` |
| 5 | `/admin/blogs` | `BlogManager` | `view_blogs` |
| 6 | `/admin/customers` | `CustomersManager` | `view_customers` |
| 7 | `/admin/abandoned` | `AbandonedCarts` | `view_marketing` |
| 8 | `/admin/coupons` | `CouponsManager` | `view_coupons` |
| 9 | `/admin/settings` | `SettingsManager` | `view_settings` |
| 10 | `/admin/users` | `UsersManager` | `manage_users` |
| 11 | `/admin/reports` | `ReportsPage` | `view_reports` |
| 12 | `/admin/inventory` | `InventoryPage` | `view_inventory` |
| 13 | `/admin/profit` | `ProfitPage` | `view_reports` |
| 14 | `/admin/payout` | `PayoutPage` | `view_reports` |
| 15 | `/admin/returns` | `ReturnsPage` | `view_orders` |
| 16 | `/admin/audit` | `AuditLogPage` | `manage_users` |
| 17 | `/admin/couriers` | `CouriersPage` | `view_orders` |
| 18 | `/admin/team` | `TeamPage` | `view_reports` |
| 19 | `/admin/fraud` | `FraudPage` | `view_orders` |
| 20 | `/admin/leave` | `LeavePage` | `view_dashboard` |
| 21 | `/admin/tasks` | `TasksPage` | `view_dashboard` |
| 22 | `/admin/meta` | `MetaKpi` | `view_marketing` |

---

## কম্পোনেন্ট (২৩টি)

### লেআউট
```
layout/Navbar.tsx
layout/Footer.tsx
layout/MobileMenuDrawer.tsx
layout/ScrollToTop.tsx
```

### হোম
```
home/Hero.tsx
home/FlashSale.tsx
home/TrustBar.tsx
home/Testimonials.tsx
home/SocialFeed.tsx
home/AppDownload.tsx
```

### পণ্য
```
products/FilterBar.tsx
products/ProductCard.tsx
products/ProductModal.tsx
shop/CategoryHero.tsx
```

### কার্ট
```
cart/CartDrawer.tsx
```

### মার্কেটিং
```
marketing/NewsletterPopup.tsx
marketing/PushSubscriptionPrompt.tsx
marketing/SocialProofNotifications.tsx
AppBanner.tsx
```

### Admin UI
```
admin/AdminRoute.tsx        ← ⚠️ dead code, কোথাও import হয় না
admin/ConfirmModal.tsx
admin/WAChatModal.tsx
admin/WAFloatingBubble.tsx
admin/ui.tsx
admin/ux.tsx
```

### সাধারণ
```
ProductImage.tsx           ← ক্যাননিক্যাল ইমেজ হেল্পার
SeoHead.tsx
ImagePicker.tsx
ArticleBody.tsx
AdSenseArticle.tsx
```

---

## ফাইল সংখ্যা

```
src/pages/            22টি
src/pages/admin/      25টি   ← ২২টি routed + UsersRolesManager (unrouted)
src/components/       23টি+
src/lib/               6টি
```

> ⚠️ **`UsersRolesManager.tsx` কোনো রুটে নেই** — dead code, App.tsx-এ import-ও নেই।

---

## রুট যাচাই (লাইভ টেস্ট)

সব পাবলিক পেইজ Cloudflare-এর মধ্য দিয়ে HTTP 200:
```
/  /shop  /blog  /about  /contact  /terms  /privacy-policy
/refund-policy  /dmca  /telesales  /p/sare  /carbmw
/track  /wishlist  /login  /profile  /checkout  /order-received
/admin/login
```

> ⚠️ **সব 200 দেখলেই বিশ্বাস করবেন না** — SPA catch-all প্রতিটি অজানা পাথকেও HTML শেল 200 দেয়।
> যাচাইয়ের জন্য headless Chromium ব্যবহার করুন (রুটের `#root` children > 0 আর broken image = 0 দেখুন)।

---

*পরবর্তী: `03-features.md` →*
