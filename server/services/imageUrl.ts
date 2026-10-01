// Shared product-image URL normalizer for ALL admin API responses.
//
// Why this exists: MySQL stores image columns as raw JSON strings with
// domain-relative paths (["/uploads/products/667/1_x.jpg"]) and legacy
// WordPress hotlinks (https://bunonfabrics.com/wp-content/uploads/...).
// Different admin routes parsed those differently (or not at all), so the admin
// panel rendered broken thumbnails while the storefront was fine — the
// storefront gets hydration from server/store.ts, the admin routes did not.
//
// Rules (mirrors server/store.ts):
//   1. parse JSON if it is a string
//   2. accept string | {src|url|image|thumbnail|picture}
//   3. domain-relative "/x" -> absolute via DOMAIN_URL
//   4. local (/uploads/, /image/) wins over remote WP hotlinks
//   5. never return "" — fall back to the placeholder

const DOMAIN_URL = (process.env.DOMAIN_URL || "https://bunon.shop").replace(/\/$/, "");
export const PRODUCT_PLACEHOLDER = "/assets/images/woocommerce-placeholder-300x300.webp";

export function toAbsoluteImageUrl(v: any): string {
  if (typeof v !== "string") return "";
  const s = v.trim();
  if (!s) return "";
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith("//")) return "https:" + s;
  return DOMAIN_URL + (s.startsWith("/") ? s : "/" + s);
}

const toUrl = (img: any): string => {
  if (typeof img === "string") return toAbsoluteImageUrl(img);
  if (img && typeof img === "object") {
    return toAbsoluteImageUrl(img.src || img.url || img.image || img.thumbnail || img.picture);
  }
  return "";
};

export function parseMaybeJSON(v: any): any {
  if (v == null) return v;
  if (typeof v !== "string") return v;
  const t = v.trim();
  if (!t || (t[0] !== "[" && t[0] !== "{")) return v;
  try { return JSON.parse(t); } catch { return v; }
}

// A URL served by THIS site. NB: a WP hotlink path also contains "/uploads/",
// so match on our own origin/prefixes, never a bare ".includes('/uploads/')".
export function isLocalImageUrl(u: any): boolean {
  if (typeof u !== "string" || !u) return false;
  if (u.startsWith("/")) return true;
  try {
    const host = new URL(u, DOMAIN_URL).host;
    return host === new URL(DOMAIN_URL).host;
  } catch {
    return u.startsWith(DOMAIN_URL);
  }
}

// Normalize any image column into an ordered, de-duped array of absolute URLs.
// Local first, remote WP hotlinks last, capped at 12.
export function hydrateImageList(...rawColumns: any[]): string[] {
  const local: string[] = [];
  const remote: string[] = [];
  for (const raw of rawColumns) {
    const val = parseMaybeJSON(raw);
    const arr = Array.isArray(val) ? val : (val == null ? [] : [val]);
    for (const it of arr) {
      const u = toUrl(it);
      if (!u) continue;
      (isLocalImageUrl(u) ? local : remote).push(u);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [...local, ...remote]) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= 12) break;
  }
  // If we have local files, drop the legacy WordPress hotlinks entirely — they
  // 404 or hotlink-block, and a shorter honest list beats a long broken one.
  return local.length ? out.filter(isLocalImageUrl) : out;
}

// Pick the single best thumbnail for a product-like object.
export function bestImageFor(...rawColumns: any[]): string {
  const list = hydrateImageList(...rawColumns);
  return list[0] || PRODUCT_PLACEHOLDER;
}

// In-place hydration of a product row: absolute images[]/local_images[] and a
// thumbnail that prefers a local file over a legacy WP hotlink.
export function hydrateProductImages(p: any, opts: { localCol?: string; imagesCol?: string; thumbCol?: string } = {}) {
  if (!p || typeof p !== "object") return p;
  const localCol = opts.localCol || "local_images";
  const imagesCol = opts.imagesCol || "images";
  const thumbCol = opts.thumbCol || "thumbnail";

  const local = hydrateImageList(p[localCol]);
  const all = hydrateImageList(p[localCol], p[imagesCol]);
  if (localCol in p || imagesCol in p) {
    p[localCol] = local;
    p[imagesCol] = all;
  }
  const thumb = toAbsoluteImageUrl(p[thumbCol]);
  if (all[0] && !isLocalImageUrl(thumb)) p[thumbCol] = all[0];
  else if (!thumb) p[thumbCol] = all[0] || PRODUCT_PLACEHOLDER;
  else p[thumbCol] = thumb;
  return p;
}
