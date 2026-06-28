# Bunon Fabrics Frontend & Headless API

This project contains the modernized React/Vite frontend and Node.js Express backend for Bunon Fabrics. It serves as a custom headless e-commerce system that accelerates the user experience while maintaining synchronization with the old WordPress/WooCommerce dashboard.

## 🏗️ Architecture Overview

The system is designed with a hybrid approach to provide maximum speed for customers while keeping the business operations running smoothly on the old WooCommerce dashboard.

### 1. Products (Locally Cached)
- **Data Flow:** `WooCommerce -> Node.js Webhook -> MySQL DB -> Redis Cache -> Frontend`
- **Why?** Fetching products directly from WooCommerce was too slow. We now sync products to our local database (`bunon.shop` database) and serve them instantly via Redis caching to the frontend (`/api/products`). 
- **Result:** The user sees products instantly without waiting for WordPress to respond.

### 2. Orders & Leads (Synced to WordPress)
- **Data Flow:** `Frontend -> /api/orders/save_to_wp.php -> WooCommerce Dashboard`
- **Why?** The client already has an established order management system, delivery tracking, and abandoned cart marketing set up inside the WordPress dashboard. 
- **Implementation:** 
  - When a user adds an item to cart or begins checkout, `ProductDetail.tsx` and `Checkout.tsx` send the incomplete order data directly to `save_to_wp.php`.
  - When a user completes an order, it is placed through our local Node.js backend (`/api/checkout/place-order`), but we also call `remove_incomplete.php` to clean up the WP dashboard.

### 3. Image Proxying
- Product image URLs from the WooCommerce server (`bunonfabrics.com`) are securely proxied through our Node.js backend (`/api/image-proxy`) to prevent direct hotlinking and allow us to enforce better caching policies on the frontend.

## 🚀 Key Technologies
- **Frontend:** React, Vite, TailwindCSS, Framer Motion, Zustand (State Management)
- **Backend:** Node.js, Express.js
- **Database:** MySQL (via `mysql2/promise`)
- **Caching:** Redis (upstash/redis)

## 📂 Project Structure
- `/src`: Contains the React Vite application (Pages, Components, API Lib).
- `/server`: Contains the Node.js Express backend.
  - `/server/routes`: API endpoints (checkout, products, admin, webhooks).
  - `/server/services`: Database config, Mail service, Redis client.
- `/public`: Static assets, images, and fonts.
- `server.ts`: The main entry point for the backend.
- `vite.config.ts`: Configuration for building the React app.

## 🛠️ Running the Project

```bash
# Install dependencies
npm install

# Run the frontend and backend in development mode
npm run dev

# Build for production
npm run build
```
