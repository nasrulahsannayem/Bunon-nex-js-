# Bunon.shop - Full Stack Web Application

## Overview
Bunon.shop is a high-performance, full-stack e-commerce web application tailored for Bunon Fabrics. It features a React-based frontend and a Node.js (Express) backend. The application integrates seamlessly with a local MySQL database and is designed to operate independently from the main WooCommerce site, ensuring zero downtime and super-fast performance.

## Technology Stack
### Frontend
- **Framework**: React 19 with Vite
- **Styling**: Tailwind CSS v4
- **State Management**: Zustand
- **Routing**: React Router DOM
- **Mobile**: Capacitor (Android)

### Backend
- **Environment**: Node.js
- **Framework**: Express.js
- **Database**: MySQL (using `mysql2/promise` with connection pooling)
- **Data Synchronization**: REST APIs & GraphQL proxies

### Integrations
- **Payment Gateways**: bKash (Tokenized), PayStation
- **Tracking & Analytics**: Meta Pixel, TikTok Pixel, Google Analytics (GA4), Google Ads
- **ERP/OMS**: EcomOS synchronization

## Key Features
- **High-Speed Product Catalog**: Products are served locally for instant load times.
- **Independent Checkout Engine**: Handles orders and payments even if the main WooCommerce site is down.
- **Payment Integration**: Supports multiple local payment gateways out-of-the-box.
- **Omni-Channel Tracking**: Centralized pixel tracking across Meta, Google, and TikTok.
- **Google Merchant Center Feed**: Automatically generates XML feeds for Google Shopping.

## Project Structure
- `/src`: Frontend React application source code.
- `/server.ts`: Main entry point for the Express backend server.
- `/dist`: Production build directory.
- `/package.json`: Project dependencies and scripts.
- `/.env`: Environment variables configuration.

## Setup & Running Locally
1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure `.env` variables based on your local database and API keys.
3. Start the development server (Frontend + Backend):
   ```bash
   npm run dev
   ```
4. Build for production:
   ```bash
   npm run build
   ```
5. Start production server:
   ```bash
   npm start
   ```
