# Bunon Fabrics - Comprehensive Project Documentation

This documentation serves as the master guide for the Bunon Fabrics custom headless e-commerce stack. It details every page, button, API, and database connection so that developers can easily debug, add features, or scale the application.

---

## 🏗️ 1. Architecture & Database Connectivity

The project uses a **Node.js (Express) + React (Vite)** architecture. It separates data across two primary databases and utilizes Redis for extreme high-speed performance and server-side logic (like deduplication).

### 🟢 `bunon_shop_db` (Product & Marketing Database)
Connected via: `productDbPool` in `server/db.ts`
- **`wc_products_full`**: Local replica of WooCommerce products. 
- **`wc_marketing_emails`**: Subscribed users for the daily newsletter.
- **`wc_cart_recovery_queue`**: Stores abandoned carts (incomplete checkout forms).
- **`bunon_users`**: Registered user accounts.

### 🔵 `bunonfabrics_dash_db` (Dashboard / Order Management Database)
Connected via: `dbPool` in `server/db.ts`
- **`bf_orders`**: Stores all confirmed orders.
- **`bf_order_items`**: Stores the individual products purchased in an order.

### 🔴 Redis Server (`127.0.0.1:6379`)
Connected via: `redisClient.ts`
- **Product Caching**: Holds the entire product catalog in RAM, allowing `/api/products` to respond in 0ms.
- **Server-Side Deduplication**: Used by the harvester to temporarily block duplicate autofill requests (`autofill:phone:email` key with 30-min TTL).

---

## 🖥️ 2. Frontend Layout: Pages & Buttons

The frontend is located in `src/pages/`. Here is the breakdown of what exists on each page and how the buttons function:

### 🏠 `Home.tsx`
- **Hero Banner**: Displays promotional graphics.
- **Category Slider**: Filters products by category.
- **Trending Products**: Displays products fetched from `/api/products`.
- **Buttons**: `Add to Cart` (Adds item to local React state), `Buy Now` (Adds to cart and redirects to `/checkout`).

### 🛍️ `Shop.tsx`
- Contains the full product catalog with sidebar filters (Price, Category, Color).
- Fetches all data instantly from the local Redis cache via `/api/products`.

### 📦 `ProductDetail.tsx`
- Detailed view of a single product. 
- **Image Slider**: Loads images via the `/api/image-proxy` to prevent mixed-content warnings.
- **Buttons**: Size selectors, Quantity modifiers (+/-), and `Buy Now` / `Add to Cart`.

### 💳 `Checkout.tsx` (Critical Component)
- **Form Inputs**: Name, Phone, Email, Address, City.
- **Autofill Tracker (Harvester)**: When a user types their phone/email and focuses away (`onBlur`), `src/lib/autofillTracker.ts` silently sends the data to `/orders/save_to_wp.php` to save the cart for future recovery.
- **Payment Buttons**:
  - `Cash on Delivery (COD)`: Directly submits to `/payment/checkout/place-order`.
  - `Pay with bKash`: Hits `/payment/bkash/create`, opens the bKash payment gateway.
  - `PayStation`: Hits `/payment/paystation/create` for alternative cards/mobile banking.
- **Discount Modal**: Popups dynamically if a user tries to leave or after a certain time.

### 👤 `Profile.tsx` & `Login.tsx`
- **Login/Register**: Connects to `/api/auth/login` and `/api/auth/register`. Issues JWT tokens for session management.
- **Profile**: Displays user info and past orders fetched from `bf_orders`.

---

## 🔌 3. Backend APIs & Routing

All backend logic resides in `server/routes/` and `server/services/`.

### 🔐 Authentication (`server/routes/auth.ts`)
- **`POST /api/auth/register`**: Creates a user in `bunon_users`.
- **`POST /api/auth/login`**: Verifies password and returns a JWT token.
- **`GET /api/auth/me`**: Returns the logged-in user's profile using the JWT token header.

### 🛒 Checkout & Payments (`server/routes/payment.ts`)
- **`POST /checkout/place-order`**: 
  - Validates cart.
  - Inserts the order into `bf_orders` and `bf_order_items` via `dbPool`.
  - Fires an order confirmation email via `mailTransporter`.
  - Removes the user from the abandoned cart recovery queue.
- **`POST /payment/bkash/create`**: Generates a bKash URL and token.
- **`POST /payment/paystation/create`**: Generates a PayStation checkout URL.

### 🕵️ Harvester & Recovery (`server/routes/harvester.ts`)
- **`POST /orders/save_to_wp.php`**: 
  - Receives live keystroke/blur data from the checkout page.
  - Checks Redis for duplicates (`autofill:phone:email`). If duplicate found within 30 mins, drops it to prevent spam.
  - If new, saves to `wc_cart_recovery_queue` in `productDbPool`.

### 📡 Webhooks (`server/routes/webhook.ts`)
- **`POST /woocommerce/product`**: Triggered automatically by WordPress when an admin adds/edits a product. Updates MySQL and triggers a Redis cache refresh immediately.

### 🖼️ Image Proxy (`server/routes/imageProxy.ts`)
- **`GET /api/image-proxy?url=...`**: Downloads images from external servers, caches them in `image/cache/`, and serves them locally to ensure fast loading and strict SSL compliance.

### 📧 Marketing & Emails (`server/services/email.ts`)
- Connects to the local Postfix/Sendmail server (`127.0.0.1:587`).
- **Configuration**: `ignoreTLS` is set for localhost to bypass `454 TLS not available` errors. `auth` is omitted for localhost to prevent `535 Authentication failed` errors, utilizing the local open relay.

---

## 🛠️ 4. Cron Jobs (Background Tasks)

Located in `server.ts`:
1. **EcomOS Sync (`syncEcomosProducts`)**: Runs every 12 hours. Fetches IDs from EcomOS API to map local SKUs to EcomOS system IDs.
2. **Cart Recovery (`processCartRecoveryCampaign`)**: Runs every 30 minutes. Finds abandoned carts in `wc_cart_recovery_queue` and sends discount emails with a magic link.
3. **Daily Newsletter (`sendDailyNewsletter`)**: Runs daily at 10:00 AM. Sends automated promotional emails to users in `wc_marketing_emails`.

---

## 🐛 5. Current Known Bugs & System Status

**Current Status: STABLE (Production Ready)**

### Recently Fixed Bugs:
- ✅ **Duplicate Autofill Logs**: Fixed via Redis server-side deduplication. Frontend now safely interacts with the backend without spamming MySQL or PM2 logs.
- ✅ **Email Delivery Failed (ECONNREFUSED / TLS / Auth Error)**: Fixed by routing nodemailer directly to local sendmail (`127.0.0.1:587`), disabling TLS requirement for localhost, and dropping the virtual auth object.
- ✅ **EcomOS Warning Spam**: Rate-limited the warning logs to trigger only once per hour when EcomOS API returns invalid HTML (due to expired tokens or downtime).
- ✅ **GitHub Large File Rejections**: Added `image/`, `*.zip`, and `*.map` to `.gitignore`.

### Outstanding / Future Polish:
- **EcomOS Integration**: The `sendToEcomOS()` function in `payment.ts` is currently commented out because the API is returning HTML (likely an expired token). When you receive a valid EcomOS API Token, update `.env` and uncomment the code in `payment.ts` (lines 38-63).

---

## 🚀 6. Developer Guide: Adding Features & Products

### How to Add a New Page (Frontend)
1. Create a new file in `src/pages/` (e.g., `NewFeature.tsx`).
2. Export your React component.
3. Open `src/App.tsx`, import your component, and add a `<Route path="/new-feature" element={<NewFeature />} />` inside the `<Routes>` block.

### How to Add a New API Endpoint (Backend)
1. Open the relevant file in `server/routes/` (or create a new one, e.g., `server/routes/custom.ts`).
2. Add your Express route: `router.get('/my-data', async (req, res) => { ... })`.
3. If creating a new file, import and mount it in `server.ts`: `app.use('/api/custom', customRouter);`.

### How to Manage Products
- You do **not** need to add products manually in the code.
- Add products normally in your **WordPress/WooCommerce admin panel**.
- WooCommerce will automatically fire a webhook to the Express server, which will instantly update MySQL and Redis. The React frontend will display the new product within milliseconds.

### Environment Variable Guide (`.env`)
- To change database passwords, update `DB_PASSWORD`, `DASH_DB_PASSWORD`, and `WP_DB_PASSWORD`.
- To update email configurations, modify `MAIL_HOST` (keep as `127.0.0.1` for local relay) and `MAIL_PORT`.
- Make sure to run `pm2 restart bunon-site --update-env` after editing the `.env` file so PM2 picks up the new variables.
