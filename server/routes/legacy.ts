import { Router } from 'express';
import { productDbPool } from '../db';

/**
 * Legacy WordPress URL redirects.
 *
 * The site was migrated off WooCommerce, but Google has years of links to the
 * WP URL shapes and the majority of organic clicks still arrive on them. Those
 * paths render today (the SPA catches everything), but they are never
 * canonical, so the ranking signal never consolidates onto /blog/<slug> and
 * /product/<id>. A 301 is the correct, permanent statement of where the content
 * now lives.
 *
 * Two shapes matter:
 *   /<blog-slug>/                  ->  /blog/<blog-slug>
 *   /product-similar-image/?<wcId> ->  /product/<id>
 *   /product/category/<wcId>       ->  /product/<id>   (WP product archive)
 *
 * The lookups are cached because this runs on every request to an unmatched
 * path, and the underlying tables change rarely.
 */

const router = Router();

const BLOG_TTL_MS = 10 * 60 * 1000;
let blogSlugCache: Map<string, string> | null = null;
let blogSlugCacheAt = 0;

/** decoded lower-case slug -> canonical /blog/<slug as stored> */
async function blogSlugMap(): Promise<Map<string, string>> {
  if (blogSlugCache && Date.now() - blogSlugCacheAt < BLOG_TTL_MS) return blogSlugCache;
  const m = new Map<string, string>();
  try {
    // status is intentionally NOT filtered. A post that later goes to draft
    // still has years of Google links pointing at its legacy URL; 301ing those
    // to the canonical /blog/<slug> is what stops the ranking leaking away. If
    // the slug ever disappears entirely the map stops returning it and the
    // request falls through exactly as before.
    const [rows]: any = await productDbPool.execute(
      `SELECT slug FROM bunon_blogs WHERE slug <> ''`
    );
    for (const r of rows as any[]) {
      const slug = String(r.slug || '').trim();
      if (!slug) continue;
      let decoded = slug;
      try { decoded = decodeURIComponent(slug); } catch { decoded = slug; }
      m.set(decoded.toLowerCase(), `/blog/${slug}`);
      // Google also indexed the percent-encoded spelling; map it too.
      m.set(slug.toLowerCase(), `/blog/${slug}`);
    }
  } catch {
    // A DB hiccup must never turn a legacy URL into a 500. An empty map simply
    // means "no redirect we can prove", and the page renders as it always has.
    return new Map();
  }
  blogSlugCache = m;
  blogSlugCacheAt = Date.now();
  return m;
}

const WC_TTL_MS = 10 * 60 * 1000;
let wcCache: Map<string, string> | null = null;
let wcCacheAt = 0;

/** wordpress post id -> /product/<our id> */
async function wcIdMap(): Promise<Map<string, string>> {
  if (wcCache && Date.now() - wcCacheAt < WC_TTL_MS) return wcCache;
  const m = new Map<string, string>();
  try {
    const [rows]: any = await productDbPool.execute(
      `SELECT id, wc_product_id FROM bunon_products
        WHERE status = 'publish' AND wc_product_id REGEXP '^[0-9]+$'`
    );
    for (const r of rows as any[]) {
      m.set(String(r.wc_product_id), `/product/${r.id}`);
    }
  } catch {
    return new Map();
  }
  wcCache = m;
  wcCacheAt = Date.now();
  return m;
}

/**
 * Resolve one legacy segment to a canonical path, or null when we cannot prove
 * it is legacy. Being conservative matters: a wrong 301 sends a real visitor
 * away from the right page, which is worse than leaving them where they are.
 */
async function resolveLegacy(segment: string): Promise<string | null> {
  const raw = String(segment || '').trim().replace(/^\/+|\/+$/g, '');
  if (!raw || raw.length > 300) return null;
  let decoded = raw;
  try { decoded = decodeURIComponent(raw); } catch { decoded = raw; }

  const blogs = await blogSlugMap();
  for (const candidate of [decoded, raw]) {
    const hit = blogs.get(candidate.toLowerCase());
    if (hit) return hit;
  }
  return null;
}

/** /product/category/<wcId> - the WP product archive. */
router.get('/product/category/:wcId', async (req, res) => {
  const wcId = String(req.params.wcId || '').replace(/^\D+/g, '');
  if (!wcId) return res.redirect(301, '/shop');
  const map = await wcIdMap();
  const target = map.get(wcId);
  // An unknown WP id still led somewhere useful; send it to the shop rather
  // than 404ing a URL Google has linked to for years.
  res.redirect(301, target || '/shop');
});

/**
 * /product-similar-image/?25383145071910 - the WP media-attachment page for a
 * product's image. The id is in the query string and has no query key, so the
 * first numeric-looking value in the query is the post id.
 */
router.get('/product-similar-image', async (req, res) => {
  const q = (req.query || {}) as Record<string, unknown>;
  let wcId = '';
  for (const v of Object.values(q)) {
    const s = String(Array.isArray(v) ? v[0] : v ?? '').replace(/\D+/g, '');
    if (s.length >= 6) { wcId = s; break; }
  }
  if (!wcId) return res.redirect(301, '/shop');
  const map = await wcIdMap();
  res.redirect(301, map.get(wcId) || '/shop');
});

/**
 * A bare legacy blog slug: /saree-niye-caption-bangla/
 *
 * The trailing slash matters: Google indexed these as "/slug/" and Express's
 * "/:legacySlug" does NOT match "/slug/" unless strict routing is off AND the
 * path is normalised first. A route pair is registered so both spellings are
 * covered - the second handles the trailing-slash form.
 *
 * Mounted LAST and only for a single path segment, so it can never shadow a
 * real route (/shop, /cart, /product, ...). If it cannot prove the segment is a
 * known blog slug it calls next(), preserving the existing SPA behaviour.
 */
/* Real site routes that share the single-segment shape this catch-all matches.
 * Without this list a genuine page such as /faq would be swallowed here and
 * answered with a redirect (or, worse, a 404) instead of rendering. Keep it in
 * sync with src/App.tsx. */
const RESERVED_ROUTES = new Set([
  'faq', 'about', 'contact', 'shop', 'cart', 'blog', 'login', 'account',
  'wishlist', 'checkout', 'track', 'admin', 'refund-policy', 'terms',
  'privacy-policy', 'dmca', 'telesales', 'product', 'product-category',
  'sitemap', 'robots', 'llms', 'image', 'images', 'uploads', 'api',
]);

const handleLegacy = async (req: any, res: any, next: any) => {
  const seg = String(req.params.legacySlug || '');
  // Only single-segment, slug-shaped paths. Never a file, never an API route.
  if (!/^[A-Za-z0-9._~%\u0080-\uFFFF-]+$/.test(seg)) return next();
  if (seg.includes('.')) return next();

  const lower = seg.toLowerCase();
  if (RESERVED_ROUTES.has(lower)) return next();
  // A reserved route may also arrive percent-encoded; compare both forms.
  let decoded = seg;
  try { decoded = decodeURIComponent(seg); } catch { decoded = seg; }
  if (RESERVED_ROUTES.has(decoded.toLowerCase())) return next();

  const target = await resolveLegacy(seg);
  if (!target) return next();
  res.redirect(301, target);
};

router.get('/:legacySlug', handleLegacy);
router.get('/:legacySlug/', handleLegacy);

export default router;