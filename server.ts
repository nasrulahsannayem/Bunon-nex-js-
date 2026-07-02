import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs"; 
import cors from "cors"; 
import helmet from "helmet";
import rateLimit from "express-rate-limit";

// Initialize dotnev configurations
dotenv.config();

// Bypass SSL Altname / TLS certificate verification globally for the legacy server endpoints
// process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0"; // Security Upgrade: Removed global bypass

import { syncLocalDatabase } from "./server/store";
import { syncEcomosProducts } from "./server/services/ecomos";

import productRoutes from "./server/routes/products";
import webhookRoutes from "./server/routes/webhook";
import paymentRoutes from "./server/routes/payment";
import imageProxyRoutes from "./server/routes/imageProxy";
import marketingRoutes from "./server/routes/marketing";
import harvesterRoutes from "./server/routes/harvester";
import authRoutes from "./server/routes/auth";
import capiRoutes from "./server/routes/capi";
import adminRoutes from "./server/routes/admin/index";

import sitemapRoute from "./server/routes/sitemap";
import { setupMarketingTables } from "./server/services/setupMarketingDb";
import { processCartRecoveryCampaign } from "./server/services/recoveryCron";
import { sendDailyNewsletter } from "./server/services/email";
import { sendDailyPushCampaign } from "./server/services/notification";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 5000; 

  app.use(cors({ origin: '*' }));
  app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
  }));
  
  // Rate limiting for API requests
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200, // Limit each IP to 200 requests per windowMs
    message: "Too many requests from this IP, please try again after 15 minutes"
  });
  
  app.use("/api", apiLimiter);

  app.use(express.json());
  // 🚀 FIX #2: Parse text/plain body from sendBeacon (browsers send text/plain for sendBeacon)
  app.use(express.text({ type: 'text/plain' }));

  // ⚡ Sync Databases and setup tables on boot
  syncLocalDatabase();
  setupMarketingTables();
  
  // 🟢 EcomOS Sync initial run and scheduling
  syncEcomosProducts();
  setInterval(syncEcomosProducts, 60 * 60 * 1000); 

  // 📩 Run marketing cart recovery cron every 1 hour
  setInterval(processCartRecoveryCampaign, 60 * 60 * 1000);

  // 📩 Send Daily Newsletter Promotions Campaign (Runs every day at 19:30 - 7:30 PM)
  import('node-cron').then((cron) => {
    cron.default.schedule('30 19 * * *', () => {
      sendDailyNewsletter();
    }, {
      timezone: "Asia/Dhaka" // Local time in BD
    });

    // 📩 Run Daily dynamic push retargeting campaign 4 times a day (every 6 hours)
    cron.default.schedule('0 */6 * * *', () => {
      sendDailyPushCampaign();
    }, {
      timezone: "Asia/Dhaka"
    });
  });

  // 🚀 Mount Modular API Routes
  app.use("/api", productRoutes);
  app.use("/api", webhookRoutes);
  app.use("/api", paymentRoutes);
  app.use("/api", imageProxyRoutes);
  app.use("/api", marketingRoutes);
  app.use("/api", harvesterRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/v1/sync", capiRoutes);
  
  app.use("/api/admin", adminRoutes);

  app.use("/", sitemapRoute);

  // Fallback endpoint for generic API tracking
  app.post("/api/track/*", (req, res) => res.json({ status: "ok" }));

  // Serve static assets and handle client-side routing
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath, { index: false }));
  
  app.get("*", (req, res) => {
    const indexPath = path.join(distPath, "index.html");
    
    fs.readFile(indexPath, "utf8", (err, html) => {
      if (err) {
        console.error("Error reading index.html:", err);
        return res.status(500).send("Error loading index.html");
      }

      const gtagCode = `
    <script async src="https://www.googletagmanager.com/gtag/js?id=G-FB87L7SJ3F"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());

      gtag('config', 'G-FB87L7SJ3F');
    </script>
      `;

      const modifiedHtml = html.replace('</head>', `${gtagCode}\n</head>`);
      res.send(modifiedHtml);
    });
  }); 

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running successfully on port ${PORT} via High-Performance Unix Socket Grid!`);
  });
}

startServer();