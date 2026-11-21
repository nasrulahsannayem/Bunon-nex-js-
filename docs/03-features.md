# ০৩ — সব ফিচার

---

## 🛒 স্টোরফ্রন্ট

| ফিচার | বিবরণ |
|---|---|
| প্রোডাক্ট গ্রিড | কার্ড, স্কেলেটন লোডিং, ইমেজ lazy load |
| সার্চ | লাইভ ফিল্টার, ক্যাটাগরি/দাম/স্টক ফিল্টার বার |
| প্রোডাক্ট ডিটেইল | গ্যালারি (মাল্টি ছবি), ভ্যারিয়েন্ট সিলেক্টর, স্টক কাউন্টার, ডিসকাউন্ট ব্যাজ, স্কেল সাইজ গাইড |
| কার্ট | ড্রয়ার, qty update, remove, localStorage persist |
| চেকআ | ঠিকানা ফর্ম, বাংলাদেশ ডিভিশন, কুরিয়ার চার্জ |
| Wishlist | লোকাল স্টোরেজ |
| অর্ডার ট্র্যাকিং | Steadfast API real-time |
| ফ্ল্যাশ সেল | টাইমার সহ |
| টেস্টিমোনিয়াল | স্লাইডার |
| ট্রাস্টবার | ডেলিভারি/রিটার্ন গ্যারান্টি ব্যাজ |
| সোশ্যাল ফিড | Instagram/Facebook ফিড পুল |
| অ্যাপ ডাউনলোড ব্যানার | APK ডাউনলোড প্রম্পট |
| ক্যাটাগরি হিরো | ক্যাটাগরি পেইজ ব্যানার |

---

## 💳 পেমেন্ট

| মাধ্যম | স্ট্যাটাস | কোড |
|---|---|---|
| **COD** (ক্যাশ অন ডেলিভারি) | ✅ কার্যকর | main flow |
| **bKash** | ✅ কার্যকর | `/api/payment/bkash-callback` |
| **PayStation** | ✅ কার্যকর | `/api/payment/paystation-callback` |
| Nagad | ❌ নেই | — |
| SSLCOMMERZ | ❌ নেই | — |
| aamarPay | ❌ নেই | — |
| Rocket | ❌ নেই | — |

**অর্ডার প্রবাহ:**
```
place-order → validate → bf_orders INSERT → bf_order_items INSERT
     ├─ COD    → সরাসরি confirmed
     ├─ bKash  → create payment → redirect → callback → status update
     └─ PayStation → create payment → redirect → callback → status update
          ↓
   WhatsApp notification + Telegram alert + Email confirmation
          ↓
   Courier booking (Steadfast API)
```

---

## 👤 ইউজার ও অথ

| ফিচার | এন্ডপয়েন্ট |
|---|---|
| লগইন | `POST /api/auth/login` |
| রেজিস্ট্রেশন | `POST /api/auth/register` |
| পাসওয়ার্ড ভুলে গেছি | `POST /forgot-password` ⚠️ `/api/` prefix নেই |
| প্রোফাইল দেখা | `GET /api/auth/profile` |
| প্রোফাইল এডিট | `PUT /api/auth/profile` |
| আমার অর্ডার | `GET /api/auth/orders` |
| অর্ডার ট্র্যাক | `GET /api/auth/track-order` |
| FCM push token | `POST /api/auth/device-token` |
| Google OAuth | `GET /api/auth/google` + `/callback` |

**লগইন ফ্লো:**
```
POST {identifier, phone, username, password}
  ↓
১১ ডিজিট ফোন? → bunon_users WHERE phone = ?
না?            → bunon_users WHERE username = ?
  ↓
bcrypt.compare(password, password_hash)
  ↓
jwt.sign({id, phone, role, permissions}, secret, {expiresIn:'30d'})
  ↓
{ token, user: {id, name, phone, email, role, permissions, photo} }
```

**রোল:** `super_admin`, `admin`, `staff`, `customer`

---

## 📦 কুরিয়ার (Steadfast)

| ফিচার | এন্ডপয়েন্ট |
|---|---|
| ব্যালেন্স | `GET /api/admin/couriers/steadfast/balance` |
| পেমেন্ট লিস্ট | `GET .../payments` |
| পিকআপ রিকোয়েস্ট | `POST .../pickup` |
| থানার তালিকা | `GET .../police-stations` |
| রিটার্ন তৈরি | `POST .../return` |
| রিটার্ন লিস্ট | `GET .../returns` |
| রিটার্ন ডিটেইল | `GET .../returns/:id` |
| ট্র্যাকিং | Steadfast API → order timeline |
| Webhook | `POST /api/admin/couriers/steadfast/webhook` (HMAC signed) |

**ম্যাপ করা ১৩টি রাইডার স্ট্যাটাস** → অর্ডার স্ট্যাটাসে রূপান্তর।

---

## 📊 অ্যাডমিন ফিচার

### কমার্স
- **Orders** — লিস্ট, ফিল্টার, বাল্ক স্ট্যাটাস, বাল্ক কুরিয়ার, এক্সপোর্ট, প্রিন্ট ইনভয়েস, ম্যানুয়াল অর্ডার
- **Products** — CRUD, ইমেজ আপলোড, স্টক, ফিচার/ফ্ল্যাগ
- **Categories** — CRUD, রি-অর্ডার
- **Inventory** — গ্রিড, বাল্ক আপডেট, লো-স্টক অ্যালার্ট, মুভ, হিস্ট্রি
- **Coupons** — CRUD, টাইপ/মিন অর্ডার/ইউজ লিমিট

### কাস্টমার
- **Customers** — লিস্ট, ডিটেইল, অর্ডার ইতিহাস
- **Cart Recovery** — অ্যাবানডন কার্ট, remind, special offer

### অ্যানালিটিক্স
- **Dashboard** — সারসংক্ষেপ, লাইভ ভিজিটর
- **Reports** — সেলস, কুরিয়ার, কুপন, রিটার্ন, এক্সপোর্ট
- **Profit** — লাভ হিসাব
- **Payout** — Steadfast পেমেন্ট + পিকআপ বিল
- **Meta KPI** — Meta Ads account, campaign, ROAS
- **Funnel** — কনভার্সন ফান্নেল

### অপারেশন
- **Couriers** — স্ট্যাটাস, রাইডার
- **Fraud Check** — ফোন/ইনভয়েস যাচাই
- **Returns** — রিটার্ন অ্যানালিটিক্স ও লিস্ট
- **Audit Log** — সব অ্যাডমিন অ্যাকশন
- **Settings** — কী-ভ্যালু স্টোর

### পিপল
- **Users** — সব ইউজার
- **Users Roles** — RBAC পারমিশন (⚠️ unrouted)
- **Team** — টিম সামারি, সক্রিয় সদস্য
- **Leave** — আবেদন, অনুমোদন
- **Tasks** — টাস্ক, অ্যাসাইনমেন্ট, স্ট্যাটাস

### WhatsApp অটোমেশন
- টেমপ্লেট ম্যানেজার (১২টি স্ট্যাটাস)
- লাইভ preview (পাঠানো ছাড়া)
- এক অর্ডারে ম্যানুয়াল send
- send log + opt-in/opt-out
- ফ্লোটিং চ্যাট বাবল

---

## 📈 ট্র্যাকিং ও বিজনেস ইন্টেলিজেন্স

| টুল | ID | স্ট্যাটাস |
|---|---|---|
| Meta Pixel | `887459306920960` | ✅ |
| Meta CAPI | `/api/v1/sync` | ✅ সাইনড, লাইভ SUCCESS |
| GA4 (G-ads) | `AW-16837869483` | ✅ |
| GA4 (GA) | `G-Y4KWR202X6` | ✅ |
| TikTok Pixel | `CU40Q4JC77U` | ✅ |
| TikTok Events API | `/api/v1/tiktok` | ✅ HMAC signed |
| WhatsApp→GA4/Meta | `/api/v1/wa-analytics` | ✅ |
| HOORIN | সেট | ✅ |
| GTM | — | ❌ `.env`-এ ফাঁকা |
| Clarity | — | ❌ `.env`-এ ফাঁকা (প্যাকেজ ইনস্টলড কিন্তু অচল) |

**CAPI ইভেন্ট:** PageView, ViewContent, AddToCart, InitiateCheckout, Purchase

---

## 🧠 AI ফিচার

| ফিচার | বিবরণ |
|---|---|
| প্যাকেজ | `@google/genai` |
| ট্রেনিং ডেটা | `bunon_human_examples` — ৬০৫টি রেকর্ড |
| জিরো-কোয়েরি লগ | `bunon_zero_queries` — ২৫টি (উন্নতির জন্য) |
| Messenger AI | `bunon_inbox_log` — ১,৫৯৯টি ইন্টারঅ্যাকশন |
| Meta KPI AI | সাপোর্ট টাইপ AI ইনসাইট |

---

## 📱 মোবাইল (Capacitor)

```
appId      com.bunon.fabrics
appName    Bunon Fabrics
webDir     dist
APK        bunonfabrics.apk (11.9 MB)
```
⚠️ APK **২৬ জুন ২০২৬** — ২ মাস পুরানো, নতুন বিল্ড তৈরি হয়নি।

**Firebase:** `firebase-service-account.json` (push notification)

---

## 🔒 নিরাপত্তা ফিচার

| ফিচার | বাস্তবায়ন |
|---|---|
| পাসওয়ার্ড | bcrypt hash |
| JWT | ৩০ দিন expiry |
| RBAC | ডাইনামিক পারমিশন অ্যারে, DB থেকে লোড |
| Rate limit | `/api` রুটে |
| Security headers | helmet() |
| Webhook HMAC | Steadfast + TikTok |
| ফাইল denylist | `.map/.cjs/.env/.sql/.pem/.key` → 404 |
| Audit log | প্রতিটি admin অ্যাকশন রেকর্ড |

---

*পরবর্তী: `04-api-routes.md` →*
