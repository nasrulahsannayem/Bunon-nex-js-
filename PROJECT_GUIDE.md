# Bunon.shop - System Architecture & Development Guide

## 1. Overview
Bunon.shop is a high-performance e-commerce platform built with modern web technologies.
- **Frontend**: React, Vite, Tailwind CSS, Framer Motion, Zustand (State Management).
- **Backend**: Node.js, Express.js.
- **Database**: MySQL (via `mysql2/promise`) & Redis (for high-speed caching).

## 2. Directory Structure
- `/src`: Contains the React Vite application.
  - `/src/pages`: All route pages (Home, Shop, Checkout, ProductDetail).
  - `/src/components`: UI components.
  - `/src/lib`: Utilities (`woocommerce.ts` for tracking, `store.ts` for Cart).
- `/server`: Contains the Node.js Express backend.
  - `/server/routes`: API endpoints.
  - `/server/services`: Background tasks and integrations (Redis, MySQL, Emails).

## 3. Dynamic Domain Configuration
The project is built to be easily cloned and deployed on new domains.
- All backend routes, emails, and payment gateways dynamically use the `DOMAIN_URL` from the `.env` file.
- If you clone this project, simply update `.env`:
  ```
  DOMAIN_URL=https://new-domain.com
  ```

## 4. Tracking & Facebook Conversions API (CAPI)
We use a hybrid deduplication tracking model to maximize Event Match Quality (EMQ):
- **Browser Pixel**: Fires via `window.fbq` with a unique `eventID` and advanced matching (cookies).
- **Server CAPI**: Sends the exact same event payload and `eventID` to Facebook via `POST /api/track/capi` using the `META_CAPI_TOKEN` configured in `.env`.
- Facebook automatically deduplicates these events, ensuring 100% accurate tracking.

## 5. Webhooks & Payments
- **bKash & Paystation**: Implemented via `server/routes/payment.ts`. After a payment is successful, the gateways hit our callback endpoints, which verify the payment and update the MySQL order status.
