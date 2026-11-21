# ০৬ — ডেটাবেস

**দুটি ডেটাবেস, দুটি আলাদা pool:**

| Pool | ডেটাবেস | কী আছে |
|---|---|---|
| `productDbPool` | `bunon_shop_db` | পণ্য, ব্লগ, ইউজার, মার্কেটিং |
| `dbPool` | `bunonfabrics_dash_db` | **অর্ডার**, কুরিয়ার, Meta KPI |

```typescript
// server/db.ts
export const dbPool         = createPool({ database: DASH_DB_NAME })  // bunonfabrics_dash_db
export const productDbPool  = createPool({ database: DB_NAME })      // bunon_shop_db
```

> ⚠️ **সবচেয়ে সাধারণ বাগ:** ভুল pool ব্যবহার → `Table 'bunon_shop_db.bf_orders' doesn't exist`

---

## `bunon_shop_db` — ৩৫টি টেবিল

### মূল (কোডে ব্যবহৃত)

| টেবিল | সারি | ভূমিকা |
|---|---|---|
| `bunon_products` | **368** | ⭐ **স্টোরফ্রন্ট লাইভ সোর্স** |
| `bunon_categories` | 34 | ক্যাটাগরি |
| `bunon_blogs` | 100 | ব্লগ |
| `bunon_users` | 24 | ইউজার + স্টাফ + অ্যাডমিন |
| `bunon_settings` | 13 | সেটিংস KV |
| `bunon_audit_logs` | 56 | অ্যাডমিন অ্যাকশন |
| `bunon_human_examples` | 605 | AI training |
| `bunon_zero_queries` | 25 | AI gap analysis |
| `bunon_inbox_log` | 1,599 | Messenger AI |
| `processed_messages` | 1,180 | প্রসেসড msg |
| `bf_pageviews` | 1,099 | পেভিউস |
| `meta_webhook_log` | 99 | Meta webhook |
| `fb_error_log` | 64 | Facebook এরর |
| `wc_marketing_emails` | 28 | নিউজলেটার সাবস্ক্রাইবার |
| `wc_cart_recovery_queue` | 7 | কার্ট রিকভারি কিউ |
| `bf_email_logs` | 46 | ইমেইল লগ |
| `bf_app_settings` | 5 | অ্যাপ সেটিংস |
| `bf_kpi_snapshots` | 2 | KPI snapshot |
| `bunon_order_requests` | 2 | অর্ডার রিকোয়েস্ট |
| `steadfast_webhook_events` | 1 | Webhook ইভেন্ট |
| `bf_device_tokens` | 1 | FCM token |
| `bsma_state` | 580 | (orphan) |

### খালি (০ সারি)
| টেবিল | কোডে রেফারেন্স |
|---|---|
| `bunon_coupons` | ✅ ৪টি (কুপন ফিচার আছে, ডেটা নেই) |
| `bunon_inventory_logs` | ✅ ২টি |
| `bunon_customer_notes` | ✅ ১টি |
| `bsma_analytics` | ❌ ০ |
| `bsma_comments` | ❌ ০ |
| `bsma_posts` | ❌ ০ |
| `bf_users` | ❌ ০ |
| `bf_otps` | ❌ ০ |
| `bf_user_sessions` | ❌ ০ |
| `bf_app_banners` | ❌ ০ |
| `ad_events` | ❌ ০ |

### Legacy
| টেবিল | সারি | অবস্থা |
|---|---|---|
| `wc_products_full` | 367 | fallback সোর্স |
| `wc_products` | 373 | legacy |
| `bunon_products_bak_pimg_20260925` | 286 | ব্যাকআপ |

---

## `bunonfabrics_dash_db` — ৪০+ টেবিল

### মূল

| টেবিল | সারি | ভূমিকা |
|---|---|---|
| `bf_orders` | **7,334** | ⭐ সব অর্ডার |
| `bf_order_items` | 13,109 | অর্ডার আইটেম |
| `bf_notifications` | 18,760 | ইনবক্স |
| `bf_tracking_logs` | 8,688 | কুরিয়ার ট্র্যাকিং |
| `bf_order_logs` | 8,548 | অর্ডার টাইমলাইন |
| `meta_kpi_breakdowns` | 26,695 | Meta KPI |
| `meta_kpi_campaigns` | 8,100 | ক্যাম্পেইন |
| `meta_sync_logs` | 1,926 | সিঙ্ক লগ |
| `chat_seen` | 4,832 | পঠিত চ্যাট |
| `bf_wa_messages` | 619 | WhatsApp |
| `bf_wa_status_templates` | 32 | স্ট্যাটাস টেমপ্লেট |
| `bf_wa_order_events` | 22 | WA ইভেন্ট |
| `bf_wa_autoreply` | 54 | অটো-রিপ্লাই |

### কর্মী
| টেবিল | সারি |
|---|---|
| `kpi_orders` | 612 |
| `attendance_log` | 755 |
| `tasks` / `kpi_tasks` | ৩৬৫ |
| `meta_kpi_daily` | 360 |
| `stock_movements` | 280 |
| `profit` | 87 |
| `leave_requests` | 9 |
| `ai_chat_history` | 94 |
| `ai_customers` | 42 |
| `bf_ai_memory` | 12 |

---

## ⚠️ অর্ডার স্ট্যাটাস ফ্লো

```
pending → confirmed → processing → packed → shipped
       → in_transit → out_for_delivery → delivered

বিকল্প শাখা:
  cancelled / cancell (⚠️ বানান ভুল, উভয়ই আছে)
  return / returned / partial_returned
  on-hold / trash / completed
```

**ডিস্ট্রিবিউশন:**
| স্ট্যাটাস | সংখ্যা | শতাংশ |
|---|---|---|
| delivered | 4,828 | 65.8% |
| return | 1,117 | 15.2% |
| cancelled | 991 | 13.5% |
| returned | 169 | 2.3% |
| trash | 71 | 1.0% |
| completed | 61 | 0.8% |
| partial_returned | 27 | 0.4% |
| cancell ⚠️ | 24 | 0.3% |
| অন্যান্য | 46 | 0.6% |

> ⚠️ **`cancelled` ও `cancell` — দুটো আলাদা স্ট্যাটাস কোডে।** ড্যাশবোর্ড ফিল্টারে দুটোই যোগ করা নিরাপদ।

---

## 📅 সাম্প্রতিক অর্ডার

| তারিখ | অর্ডার | আয় |
|---|---|---|
| ২৬ সেপ্ট | ২৫ | ৳৩৫,৫২০ |
| ২৭ সেপ্ট | ১৯ | ৳১৪,৮৮০ |
| ২৮ সেপ্ট | ৫ | ৳৯,০৫৯ |
| ২৯ সেপ্ট | ১৪ | ৳২৪,৫৫৬ |
| ৩০ সেপ্ট | ১০ | ৳২২,২০০ |
| **১ অক্টো** | **৩৮** | **৳৪,৩৩,১৮০** 🔥 |
| ২ অক্টো | ৬ | ৳৪,৫০০ |
| ৩ অক্টো | ২ | ৳৮৬০ |

---

## 🔌 ডেটাবেস অ্যাক্সেস

### এনভায়রনমেন্ট ভ্যারিয়েবল
```bash
DB_HOST DB_PORT DB_USER DB_PASSWORD DB_NAME
DASH_DB_HOST DASH_DB_PORT DASH_DB_USER DASH_DB_PASSWORD DASH_DB_NAME
WP_DB_HOST WP_DB_PORT WP_DB_USER WP_DB_PASSWORD WP_DB_NAME
```

> ⚠️ **`.env`-এ পাসওয়ার্ডে ডাবল কোট থাকে।** CLI ব্যবহারের সময় বাদ দিন:
> ```bash
> PW=$(grep '^DB_PASSWORD' .env | cut -d= -f2- | tr -d '"')
> MYSQL_PWD="$PW" mysql -h127.0.0.1 -u"$US" "$DB" -e "SELECT ..."
> ```
> কোট বসানো ছাড়া `mysql` পাসওয়ার্ড হিসেবে গ্রহণ করে → `Access denied`।

### Python থেকে
```python
# python3 -c ব্যবহার করলে pymysql/mysql-connector লাগবে
# হোস্টে নেই, তাই mysql CLI সবচেয়ে নির্ভরযোগ্য
```

---

## 📝 নতুন পণ্য যোগ করার নিয়ম

```sql
-- id NOT NULL, no default → MAX(id)+1 আগে বের করুন
-- images: valid JSON array of {"src": "..."}
-- local_images: JSON array starting with "/image/"
-- category_id: NULL বা integer (খালি স্ট্রিং নয়)
-- categories: valid JSON array ([] দিলেই হবে)
```

**সবসময় ব্যাকআপ নিয়ে, পরে Redis flush + `pm2 restart` করুন — নইলে পুরানো cached images দেখাবে।**

---

*পরবর্তী: `07-cron-jobs.md` →*
