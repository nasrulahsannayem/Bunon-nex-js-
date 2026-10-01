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
import teleSalesRoutes from './server/routes/tele-sales';
import capiRoutes from "./server/routes/capi";
import tiktokRoutes from "./server/routes/tiktokEvents";
import { requireSignedTracking, browserEventGuard } from "./server/utils/trackingAuth";
import waAnalyticsRoutes from "./server/routes/waAnalytics";
import adminRoutes from "./server/routes/admin/index";
import { productDbPool } from "./server/db";
import blogRoutes from "./server/routes/blog";
import categoriesRoutes from "./server/routes/categories";
import metaPublicRoutes from "./server/routes/metaPublic";

import sitemapRoute from "./server/routes/sitemap";
import { getCachedProducts } from "./server/services/redisClient";
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

  app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
  // 🚀 FIX #2: Parse text/plain body from sendBeacon (browsers send text/plain for sendBeacon)
  app.use(express.text({ type: 'text/plain' }));

  // ⚡ Sync Databases and setup tables on boot
  syncLocalDatabase();
  setupMarketingTables();
  
  // 🟢 EcomOS Sync disabled to stop 401 spam.
  // Products now come from local DB/RAM fallback.
  // Re-enable only if ECOMOS_SYNC_ENABLED=true.
  if (process.env.ECOMOS_SYNC_ENABLED === "true") {
    syncEcomosProducts();
    setInterval(syncEcomosProducts, 60 * 60 * 1000);
  }

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
  // Attribution payloads are attacker-controlled (event_name, value, phone), so
  // an open endpoint lets anyone inject synthetic purchases into the ad accounts.
  // Browser events (no secret possible) may pass, but only after their monetary
  // fields are stripped server-side. Purchase/PlaceAnOrder values must come from
  // the signed server-owned pipeline (orders, WhatsApp) so a browser one-liner
  // cannot inject fake revenue into the ad accounts.
  app.use("/api/v1/sync", browserEventGuard, capiRoutes);

  // TikTok has no equivalent safe split server-side today, so it stays signed-only.
  app.use("/api/v1/tiktok", requireSignedTracking, tiktokRoutes);
  app.use("/api/v1/wa-analytics", waAnalyticsRoutes);
  app.use("/api/recruitment", teleSalesRoutes);
  
  app.use("/api/admin", adminRoutes);
  app.use("/api/blog", blogRoutes);
  app.use("/api/categories", categoriesRoutes);
  app.use("/api/meta", metaPublicRoutes);

  app.use("/", sitemapRoute);

  // Live visitors (Shopify-style): in-memory, pruned on read. No PII stored.
  const liveMap = new Map<string, { path: string; ref: string; cc: string; at: number }>();
  (app as any).locals.liveVisitors = liveMap;
  try {
    productDbPool.execute("CREATE TABLE IF NOT EXISTS bf_pageviews (path VARCHAR(200) NOT NULL, country VARCHAR(2) NOT NULL DEFAULT '', hour DATETIME NOT NULL, n INT NOT NULL DEFAULT 1, PRIMARY KEY (path, country, hour), KEY ix_hour (hour))").catch(() => {});
    productDbPool.execute("DELETE FROM bf_pageviews WHERE hour < NOW() - INTERVAL 2 DAY").catch(() => {});
  } catch { /* ignore */ }
  app.post('/api/track/pv', express.json({ limit: '10kb' }), (req, res) => {
    try {
      const sid = String((req.body as any)?.sid || '').slice(0, 48);
      const path = String((req.body as any)?.path || '/').slice(0, 200);
      const ref = String((req.body as any)?.ref || '').slice(0, 200);
      if (!sid) return res.json({ status: 'ok' });
      const cc = String((req.headers as any)['cf-ipcountry'] || '').slice(0, 2).toUpperCase();
      if (liveMap.size > 5000) { const now = Date.now(); for (const [k, v] of liveMap) if (now - v.at > 180000) liveMap.delete(k); }
      liveMap.set(sid, { path, ref, cc, at: Date.now() });
      // persist for 24h chart (fail-open, fire-and-forget)
      try {
        const hour = new Date(); hour.setMinutes(0, 0, 0);
        productDbPool.execute('INSERT INTO bf_pageviews (path, country, hour, n) VALUES (?, ?, ?, 1) ON DUPLICATE KEY UPDATE n = n + 1',
          [path.slice(0, 200), cc || 'BD', hour]).catch(() => {});
      } catch { /* ignore */ }
    } catch { /* fail-open */ }
    res.json({ status: 'ok' });
  });
  // Fallback endpoint for generic API tracking
  app.post("/api/track/*", (req, res) => res.json({ status: "ok" }));

  // Serve localized product images (domain-agnostic, no WP dependency)
  const uploadsPath = path.join(process.cwd(), "public", "uploads");
  app.use("/uploads", express.static(uploadsPath, {
    maxAge: "30d",
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=2592000");
    }
  }));

  // Serve static product images directly
  const imageDir = "/www/wwwroot/bunon.shop/public/image";
  if (fs.existsSync(imageDir)) {
    app.use("/image", express.static(imageDir, { maxAge: "7d" }));
  }

  // Never expose build artifacts / source / secrets, whatever the Host
  // (bunon.shop, bunonfabrics.com, ... both proxy to this same app).
  // Without this, express.static(dist) happily serves dist/server.cjs — the full
  // bundled server source — and the SPA catch-all answers *.map with the HTML shell.
  const BLOCKED_EXT = /\.(map|cjs|mjs|ts|tsx|zip|apk|env|log|sql|bak|pem|key)$/i;
  app.use((req, res, next) => {
    const pathname = String(req.path || '');
    if (BLOCKED_EXT.test(pathname)) {
      return res.status(404).type('text/plain').send('Not Found');
    }
    return next();
  });

  // Serve static assets and handle client-side routing
  const distPath = path.join(process.cwd(), "dist");
  app.use(express.static(distPath, {
    index: false,
    setHeaders: (res, filePath) => {
      if (filePath.endsWith('.html')) {
        // HTML shell: never cached (meta is injected per-request for crawlers)
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
        // Vite content-hashed assets: safe to cache forever
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=604800');
      }
    }
  }));

  // ─────────────────────────────────────────────────────────────
  // SEO / GEO: server-side meta injection for crawlers & social bots
  // ─────────────────────────────────────────────────────────────
  // SEO_ORIGIN drives canonical / og:url / JSON-LD / sitemap. It is deliberately
  // SEPARATE from DOMAIN_URL: DOMAIN_URL is baked into bKash + PayStation
  // callback_url, and those gateways whitelist the callback host. Changing
  // DOMAIN_URL to bunonfabrics.com without re-registering the callbacks would
  // silently break COD payment confirmation.
  // bunonfabrics.com is the canonical/primary domain; bunon.shop keeps serving.
  const SITE_URL = (process.env.SEO_ORIGIN || process.env.DOMAIN_URL || 'https://bunonfabrics.com').replace(/\/$/, '');
  const CRAWLER_UA = /(facebookexternalhit|facebookcatalog|whatsapp|twitterbot|linkedinbot|slackbot|discordbot|telegrambot|googlebot|bingbot|duckduckbot|applebot|yandexbot|baiduspider|semrushbot|ahrefsbot|screaming frog)/i;

  const escHtml = (s: any) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  const stripTags = (s: any) => String(s == null ? '' : s)
    .replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  const firstImageUrl = (p: any): string => {
    const list: any[] = Array.isArray(p?.images) ? p.images : [];
    for (const im of list) {
      const raw = typeof im === 'string' ? im : (im && im.src);
      if (!raw) continue;
      if (/^https?:\/\//i.test(raw)) return raw;
      return SITE_URL + (raw.startsWith('/') ? raw : '/' + raw);
    }
    const t = p?.thumbnail;
    if (t) return /^https?:\/\//i.test(t) ? t : SITE_URL + (t.startsWith('/') ? t : '/' + t);
    return `${SITE_URL}/image/Bestselling-Saree-banner-1-mobie-768x912.jpg`;
  };

  // Build the per-route <head> block that replaces the static default tags.
  const buildMetaBlock = (m: {
    title: string; description: string; url: string; image: string;
    ogType?: string; jsonLd?: any;
  }): string => {
    const parts: string[] = [];
    parts.push(`<title>${escHtml(m.title)}</title>`);
    parts.push(`<meta name="description" content="${escHtml(m.description)}" />`);
    parts.push(`<link rel="canonical" href="${escHtml(m.url)}" />`);
    parts.push(`<meta property="og:type" content="${m.ogType || 'website'}" />`);
    parts.push(`<meta property="og:site_name" content="Bunon Fabrics" />`);
    parts.push(`<meta property="og:locale" content="bn_BD" />`);
    parts.push(`<meta property="og:title" content="${escHtml(m.title)}" />`);
    parts.push(`<meta property="og:description" content="${escHtml(m.description)}" />`);
    parts.push(`<meta property="og:url" content="${escHtml(m.url)}" />`);
    parts.push(`<meta property="og:image" content="${escHtml(m.image)}" />`);
    parts.push(`<meta property="og:image:secure_url" content="${escHtml(m.image)}" />`);
    parts.push(`<meta name="twitter:card" content="summary_large_image" />`);
    parts.push(`<meta name="twitter:title" content="${escHtml(m.title)}" />`);
    parts.push(`<meta name="twitter:description" content="${escHtml(m.description)}" />`);
    parts.push(`<meta name="twitter:image" content="${escHtml(m.image)}" />`);
    if (m.jsonLd) {
      parts.push(`<script type="application/ld+json">${JSON.stringify(m.jsonLd).replace(/</g, '\\u003c')}</script>`);
    }
    return parts.join('\n    ');
  };

  // Strip the static homepage defaults from index.html so the dynamic block
  // never duplicates them.
  const stripDefaultMeta = (html: string): string => html
    .replace(/<title>[\s\S]*?<\/title>\s*/i, '')
    .replace(/<meta name="description"[^>]*\/?>\s*/gi, '')
    .replace(/<link rel="canonical"[^>]*\/?>\s*/gi, '')
    .replace(/<meta property="og:[^>]*\/?>\s*/gi, '')
    .replace(/<meta name="twitter:[^>]*\/?>\s*/gi, '');

  const orgJsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: 'Bunon Fabrics',
        alternateName: 'বুনন ফেব্রিক্স',
        url: `${SITE_URL}/`,
        logo: `${SITE_URL}/image/shoplogo.png`,
        image: `${SITE_URL}/image/Bestselling-Saree-banner-1-mobie-768x912.jpg`,
        description: 'বাংলাদেশের অনলাইন সুতি শাড়ী ও ফ্যাব্রিক্স শপ। ৬৪ জেলায় হোম ডেলিভারি।',
        address: { '@type': 'PostalAddress', addressCountry: 'BD' },
        areaServed: { '@type': 'Country', name: 'Bangladesh' },
        contactPoint: [{
          '@type': 'ContactPoint',
          contactType: 'customer service',
          areaServed: 'BD',
          availableLanguage: ['bn', 'en']
        }]
      },
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: `${SITE_URL}/`,
        name: 'Bunon Fabrics',
        inLanguage: 'bn-BD',
        publisher: { '@id': `${SITE_URL}/#organization` },
        potentialAction: {
          '@type': 'SearchAction',
          target: { '@type': 'EntryPoint', urlTemplate: `${SITE_URL}/shop?q={search_term_string}` },
          'query-input': 'required name=search_term_string'
        }
      }
    ]
  };

  // Resolve /product/:id meta for crawlers.
  const getProductMeta = async (id: string) => {
    try {
      const products: any[] = await getCachedProducts();
      const p = (products || []).find((x: any) => String(x.id) === String(id));
      if (!p) return null;
      const url = `${SITE_URL}/product/${p.id}`;
      const image = firstImageUrl(p);
      const desc = (stripTags(p.short_description || p.description) || p.name || '')
        .slice(0, 300);
      const priceNum = Number(p.price || 0);
      const inStock = p.stock_status !== 'outofstock';
      const jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Product',
            '@id': `${url}#product`,
            name: p.name,
            description: desc,
            image: [image],
            sku: String(p.sku || p.id),
            brand: { '@type': 'Brand', name: 'Bunon Fabrics' },
            offers: {
              '@type': 'Offer',
              url,
              priceCurrency: 'BDT',
              price: priceNum > 0 ? priceNum : undefined,
              availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
              itemCondition: 'https://schema.org/NewCondition',
              seller: { '@id': `${SITE_URL}/#organization` }
            }
          },
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
              { '@type': 'ListItem', position: 2, name: 'Shop', item: `${SITE_URL}/shop` },
              { '@type': 'ListItem', position: 3, name: p.name, item: url }
            ]
          }
        ]
      };
      return {
        title: `${p.name} | Bunon Fabrics`,
        description: desc,
        url,
        image,
        ogType: 'product',
        jsonLd
      };
    } catch (e) {
      return null;
    }
  };

  // HTML shell served to crawlers with per-route meta injected.
  // During `npm run build` Vite empties dist/ before writing the new bundle, so a
  // crawler arriving in that ~1-2s window used to get ENOENT -> HTTP 500 (Google
  // sees a 500 on a product page). Keep the last good copy in memory and serve it
  // whenever the file is momentarily absent.
  let lastGoodIndexHtml: string | null = null;
  try {
    lastGoodIndexHtml = fs.readFileSync(path.join(distPath, 'index.html'), 'utf8');
  } catch { /* first boot before build */ }

  const readIndexHtml = async (): Promise<string | null> => {
    try {
      const html = await fs.promises.readFile(path.join(distPath, 'index.html'), 'utf8');
      if (html && html.length > 0) lastGoodIndexHtml = html;
      return html;
    } catch {
      return lastGoodIndexHtml;
    }
  };

  const renderCrawlerHtml = async (req: any, res: any, meta: any) => {
    const indexPath = path.join(distPath, "index.html");
    try {
      const html = await readIndexHtml();
      if (!html) {
        res.status(503).send('Service Unavailable');
        return;
      }
      const out = stripDefaultMeta(html).replace('</head>', `    ${buildMetaBlock(meta)}\n  </head>`);
      res.setHeader('X-Robots-Tag', 'index, follow');
      // Per-route meta is injected per request, so this HTML must never be
      // stored by Cloudflare or any intermediary. Without this the edge served
      // stale canonical/og tags to Googlebot for hours after a deploy, which
      // silently undoes any SEO fix made at the origin.
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('CDN-Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      res.send(out);
    } catch (err) {
      if (lastGoodIndexHtml) {
        const out = stripDefaultMeta(lastGoodIndexHtml)
          .replace('</head>', `    ${buildMetaBlock(meta)}\n  </head>`);
        res.setHeader('X-Served-From', 'memory-cache');
        return res.send(out);
      }
      console.error("Error reading index.html:", err);
      res.status(503).send("Error loading index.html");
    }
  };

  // Product pages: inject per-product OG + JSON-LD for social bots & crawlers.
  app.get('/product/:id', async (req, res, next) => {
    const ua = String(req.headers['user-agent'] || '');
    if (!CRAWLER_UA.test(ua)) return next();
    const meta = await getProductMeta(req.params.id);
    if (!meta) return next();
    return renderCrawlerHtml(req, res, meta);
  });

  app.get("*", async (req, res, next) => {
    const ua = String(req.headers['user-agent'] || '');
    // Human browsers: plain SPA shell with the static base meta block.
    if (!CRAWLER_UA.test(ua)) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0');
      res.setHeader('Cloudflare-CDN-Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      const fresh = await readIndexHtml();
      if (fresh) return res.send(fresh);
      return res.sendFile(path.join(distPath, 'index.html'), (err) => {
        if (err) { console.error('Error reading index.html:', err); res.status(500).send('Error loading index.html'); }
      });
    }
    const pathOnly = String(req.path || '/');
    const meta = {
      title: 'বুনন ফেব্রিক্স | Bunon Fabrics - পুরোটাই সুতি শাড়ী',
      description: 'বাংলাদেশের অনলাইন সুতি শাড়ী ও ফ্যাব্রিক্স শপ। ৬৪ জেলায় হোম ডেলিভারি, ১০০% কটন, ক্যাশ অন ডেলিভারি।',
      url: pathOnly === '/' ? `${SITE_URL}/` : SITE_URL + pathOnly,
      image: `${SITE_URL}/image/Bestselling-Saree-banner-1-mobie-768x912.jpg`,
      ogType: 'website',
      jsonLd: orgJsonLd
    };
    return renderCrawlerHtml(req, res, meta);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running successfully on port ${PORT} via High-Performance Unix Socket Grid!`);
    // Trigger dynamic product campaign notification instantly on boot/restart
    import("./server/services/notification").then(({ sendDailyPushCampaign }) => {
      setTimeout(() => {
        sendDailyPushCampaign().catch(() => {});
      }, 5000);
    });
  });
}

startServer();

// Auto-deploy trigger timestamp: 2026-07-02T09:40:00+06:00