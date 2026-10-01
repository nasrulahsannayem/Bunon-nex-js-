
import { Router } from "express";
import { getCachedProducts } from "../services/redisClient";

// Primary SEO domain. Deliberately separate from DOMAIN_URL: DOMAIN_URL is
// embedded in bKash/PayStation callback_url and those gateways whitelist the
// callback host, so it must not be repointed casually.
const SITE_URL = (process.env.SEO_ORIGIN || process.env.DOMAIN_URL || "https://bunonfabrics.com").replace(/\/$/, "");

const STATIC_ROUTES: Array<[string, string, string]> = [
  ["/", "daily", "1.0"],
  ["/shop", "daily", "0.9"],
  ["/about", "monthly", "0.5"],
  ["/contact", "monthly", "0.5"],
  ["/blog", "daily", "0.7"],
];

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const urlEntry = (loc: string, changefreq: string, priority: string, lastmod?: string) =>
  `  <url>\n    <loc>${esc(loc)}</loc>${lastmod ? `\n    <lastmod>${esc(lastmod)}</lastmod>` : ""}\n    <changefreq>${changefreq}</changefreq>\n    <priority>${priority}</priority>\n  </url>`;

// Blogs + categories live in the same MySQL the app already uses. Read them
// lazily and never let a DB error take the sitemap down: fall back to
// products+static only.
const readDbUrls = async (): Promise<string[]> => {
  const out: string[] = [];
  try {
    const mysql = (await import("mysql2/promise")).default;
    const cfg = {
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
    };
    if (!cfg.host || !cfg.user || !cfg.database) return out;
    const conn = await mysql.createConnection(cfg);
    try {
      // bunon_blogs has no updated_at column - only created_at/published_at.
      const [blogs] = await conn.query(
        "SELECT slug, published_at, created_at FROM bunon_blogs WHERE status = 1 AND slug IS NOT NULL AND slug <> '' ORDER BY published_at DESC"
      );
      for (const b of blogs as any[]) {
        const d = b.published_at || b.created_at || null;
        const lastmod = d ? new Date(d).toISOString().slice(0, 10) : null;
        out.push(urlEntry(`${SITE_URL}/blog/${b.slug}`, "monthly", "0.6", lastmod));
      }
      // DISTINCT matters: bunon_categories contains two live rows with
      // slug='bra', which produced a duplicate <loc> and a GSC warning.
      const [cats] = await conn.query(
        "SELECT DISTINCT slug FROM bunon_categories WHERE status = 1 AND slug IS NOT NULL AND slug <> ''"
      );
      for (const c of cats as any[]) {
        out.push(urlEntry(`${SITE_URL}/product-category/${c.slug}/`, "weekly", "0.7"));
      }
    } finally {
      await conn.end();
    }
  } catch (err) {
    console.error("sitemap: blog/category lookup failed, serving products only:", (err as Error)?.message);
  }
  return out;
};

const router = Router();

router.get("/sitemap.xml", async (req, res) => {
  try {
    const parts: string[] = [];
    for (const [p, cf, pr] of STATIC_ROUTES) {
      parts.push(urlEntry(SITE_URL + p, cf, pr));
    }

    const products = await getCachedProducts();
    for (const product of products || []) {
      const modified = (product as any)?.date_modified || (product as any)?.date_created || null;
      parts.push(urlEntry(`${SITE_URL}/product/${(product as any).id}`, "weekly", "0.8", modified));
    }

    parts.push(...(await readDbUrls()));

    const seen = new Set<string>();
    const unique = parts.filter((chunk) => {
      const m = chunk.match(/<loc>([\s\S]*?)<\/loc>/);
      if (!m) return true;
      if (seen.has(m[1])) return false;
      seen.add(m[1]);
      return true;
    });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${unique.join("\n")}\n</urlset>\n`;

    res.header("Content-Type", "application/xml; charset=utf-8");
    res.header("Cache-Control", "public, max-age=900");
    res.send(xml);
  } catch (error) {
    console.error("Error generating sitemap:", error);
    res.status(500).end();
  }
});

export default router;
