# Bunon Fabrics E-Commerce - Project Documentation

## 📌 Project Overview
Bunon Fabrics is a modern, full-stack headless e-commerce web application. The frontend is built with React (Vite) offering a premium and snappy user interface, while the backend is an Express.js server that handles API requests, webhook processing, marketing automation, and local database syncing. 

This custom React stack serves as a blazing-fast frontend that directly replaces the default WooCommerce frontend while maintaining connection with the WooCommerce backend via a custom PHP API (`dash.bunonfabrics.com`) and Webhooks.

---

## 🏗️ Architecture & Database Connectivity
The project relies on multiple databases for different purposes. This segregation ensures high performance and modularity.

### 1. `dbPool` (bf_orders, bf_order_items)
- **Host:** `DASH_DB_HOST` (usually 127.0.0.1)
- **Database:** `bunonfabrics_dash_db`
- **Purpose:** 
  - Handles the custom order management system.
  - When a customer places an order via the React frontend, the data is saved into `bf_orders` and `bf_order_items`.
  - It uses local Unix Sockets/Localhost for extreme high-speed insertions.

### 2. `productDbPool` (bunon_shop_db)
- **Host:** `DB_HOST` (usually 127.0.0.1)
- **Database:** `bunon_shop_db`
- **Purpose (Products):** 
  - Stores cached products from WooCommerce in `wc_products_full`.
  - Serves as the primary database for the frontend product catalog, making site loading instantaneous compared to hitting the WooCommerce API directly.
- **Purpose (Marketing & Automation):**
  - **`wc_marketing_emails`:** Stores customer emails and subscription status for daily newsletters.
  - **`wc_cart_recovery_queue`:** Stores abandoned cart data (incomplete orders) where the user entered their phone/email but didn't complete checkout.
  - **`bunon_users`:** Stores authenticated customer profiles (auto-generated when an order is placed).

---

## ✨ Core Features & Modules

### 1. 🛒 Express Checkout & Incomplete Order Capture (Abandoned Cart)
- **Module:** `harvester.ts` & `payment.ts`
- **How it works:** 
  - As soon as a user types their Phone Number or Email on the checkout page, it is silently sent to the `/orders/save_to_wp.php` endpoint.
  - This endpoint forwards the data to the central dashboard and simultaneously saves the cart data in `wc_cart_recovery_queue` (in `productDbPool`).
  - If the user successfully places the order, `payment.ts` triggers an update to mark the recovery queue as `converted` and removes the incomplete order from the dashboard.

### 2. 🔁 Cart Recovery Automation (Cron Job)
- **Module:** `recoveryCron.ts` & `email.ts`
- **How it works:**
  - A background process (Cron) runs to find customers in `wc_cart_recovery_queue` who haven't completed their order in the last 1 hour.
  - It generates a dynamic discount coupon (e.g., 5%, 10%, 15%) and sends them a recovery email via Nodemailer.
  - The email contains a "Magic Link" that restores their cart and automatically applies the discount coupon when they click it.

### 3. 💌 Marketing & Daily Newsletter
- **Module:** `dailyPromotionsCron.ts` & `marketing.ts`
- **How it works:**
  - Customers are automatically subscribed to marketing emails when they place an order or enter their email in the checkout form.
  - A cron job (`sendDailyNewsletter`) fetches all subscribed emails from `wc_marketing_emails`.
  - It picks random trending products from the local cache and sends a beautifully crafted promotional email.
  - Customers can easily unsubscribe via the `/api/unsubscribe` endpoint.

### 4. 💳 Payment Gateways Integration
- **Module:** `payment.ts`
- **Supported Gateways:** bKash (Tokenized API), PayStation, and Cash on Delivery (COD).
- **How it works:**
  - Upon selecting a digital payment method, the server initiates a session with the respective API.
  - The customer is redirected to the gateway.
  - Upon successful payment, the gateway triggers a callback (`/payment/bkash-callback` or `/payment/paystation-callback`), which updates the order status in `bf_orders` to `is_paid = 1`.

### 5. ⚡ Webhook & Local Catalog Syncing
- **Module:** `webhook.ts` & `store.ts`
- **How it works:**
  - Instead of constantly requesting WooCommerce for products, WooCommerce sends a Webhook to `/woocommerce/product` whenever a product is created, updated, or deleted.
  - The Express server receives the payload and updates the `wc_products_full` table in `bunon_shop_db`.
  - It immediately calls `syncLocalDatabase()` which updates the Redis RAM cache, ensuring the frontend always serves fresh data at 0ms latency.

### 6. 🖼️ Image Proxy Server
- **Module:** `imageProxy.ts`
- **How it works:**
  - Directly loading WooCommerce images can be slow and might cause Mixed Content errors.
  - The frontend wraps all product image URLs through `/api/image-proxy?url=...`.
  - The Express server downloads the image, saves it in a local `image/cache/` directory, and serves it directly to the user with a 1-year Cache-Control header.

---

## 🐛 Resolved Bugs & Recent Fixes
During the recent audit and debugging session, several critical optimizations and bug fixes were applied:

1. **Popup Responsiveness on Mobile:** 
   - **Issue:** The discount offer popup was overflowing and not scrollable on small mobile screens.
   - **Fix:** Redesigned the popup modal in `Checkout.tsx` to be full-screen on mobile (`fixed inset-0`, `max-h-screen`) and properly scrollable without hiding buttons.
2. **Express Rate Limit Trust Proxy:** 
   - **Issue:** Express `express-rate-limit` was blocking legitimate users because it couldn't read the real client IP behind Nginx/Cloudflare.
   - **Fix:** Added `app.set('trust proxy', 1);` in `server.ts` before applying rate limits.
3. **Database Migration for Marketing Tools:** 
   - **Issue:** The marketing and cart recovery queues were being saved in the WordPress database (`Bunonfabrics_db`), causing logical fragmentation.
   - **Fix:** Migrated all marketing queries (`harvester.ts`, `marketing.ts`, `recoveryCron.ts`, `email.ts`) to use `productDbPool` (`bunon_shop_db`). `wpDbPool` was entirely removed as it was no longer needed, making the app much lighter and safer.
4. **Duplicate Autofill API Calls:**
   - **Fix:** Implemented Debounce strategies in `Checkout.tsx` to prevent the autofill script from spamming the `/orders/save_to_wp.php` endpoint on every keystroke.

## 🚀 Deployment Instructions
To deploy the latest changes to your live VPS, run the following commands in your project root directory:

```bash
git pull origin master
npm install
npm run build
pm2 restart bunon-site
```
