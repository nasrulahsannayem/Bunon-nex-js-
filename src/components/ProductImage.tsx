// Shared product image component + resolution helpers.
//
// SINGLE SOURCE OF TRUTH for image resolution in the whole app (storefront AND
// admin panel). Every admin surface — product list, orders table, dashboard
// widget, edit modal — routes through bestProductImage()/resolveProductSrc().
//
// Handles every shape the API/DB can return:
//   - a plain URL string
//   - an array of strings or {src} objects
//   - a raw JSON *string* (e.g. '["/uploads/products/667/1_x.jpg"]')
//   - a single {src|url|image|thumbnail|picture} object
//   - domain-relative paths ('/uploads/...'), which get absolutised
// Local files always win over legacy WordPress hotlinks, and the function NEVER
// returns '' — an empty src rendered a broken <img> in the admin table.
// onError swaps to the placeholder exactly once (guarded, no loop).
import { useState } from 'react';

export const PRODUCT_PLACEHOLDER = '/assets/images/woocommerce-placeholder-300x300.webp';

const SITE_ORIGIN = (() => {
  if (typeof window !== 'undefined' && window.location?.origin) return window.location.origin;
  return 'https://bunon.shop';
})();

function imgVal(c: any): string {
  if (typeof c === 'string') return c;
  if (c && typeof c === 'object') {
    const s = c?.src || c?.url || c?.image || c?.thumbnail || c?.thumb || c?.picture || c?.product_thumb;
    return typeof s === 'string' ? s : '';
  }
  return '';
}

// Parse a raw JSON column if it is a stringified array/object. Safe on plain URLs.
export function maybeParseImageJson(v: any): any {
  if (typeof v !== 'string') return v;
  const t = v.trim();
  if (!t || (t[0] !== '[' && t[0] !== '{')) return v;
  try { return JSON.parse(t); } catch { return v; }
}

// Domain-relative -> absolute. Absolute URLs pass through untouched.
function absolutize(u: string): string {
  const s = (u || '').trim();
  if (!s) return '';
  if (/^(https?:)?\/\//i.test(s)) return s.startsWith('//') ? 'https:' + s : s;
  if (s.startsWith('data:') || s.startsWith('blob:')) return s;
  return SITE_ORIGIN + (s.startsWith('/') ? s : '/' + s);
}

// A URL served by this site. A legacy WP hotlink path ALSO contains "/uploads/",
// so match on origin — never on a bare substring like `.includes('/uploads/')`.
export function isLocalImage(u: string): boolean {
  if (!u) return false;
  if (u.startsWith('/')) return true;
  if (u.startsWith('data:') || u.startsWith('blob:')) return true;
  try {
    return new URL(u, SITE_ORIGIN).host === new URL(SITE_ORIGIN).host;
  } catch {
    return false;
  }
}

// Collect every usable URL from an arbitrary image field value.
function collect(v: any, out: string[]): void {
  const val = maybeParseImageJson(v);
  if (val == null) return;
  if (Array.isArray(val)) { for (const i of val) collect(i, out); return; }
  const s = imgVal(val);
  if (!s) return;
  const abs = absolutize(s);
  if (abs) out.push(abs);
}

// De-dupe, local URLs first, cap at 12.
function dedupePreferLocal(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const locals = list.filter(isLocalImage);
  const remotes = list.filter((u) => !isLocalImage(u));
  for (const u of [...locals, ...remotes]) {
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= 12) return out;
  }
  return out;
}

const PRODUCT_FIELDS = [
  'local_images', 'images', 'image', 'images_list', 'product_images',
  'thumbnail', 'thumb', 'product_thumb', 'picture',
];

/**
 * Best single image URL for a product-like object or cart/order line item.
 * Field order: local_images -> images -> image -> thumbnail -> thumb -> product_thumb.
 * Local files win over remote hotlinks. Never returns ''.
 */
export function bestProductImage(prod: any): string {
  if (!prod) return PRODUCT_PLACEHOLDER;
  if (typeof prod === 'string') return absolutize(prod) || PRODUCT_PLACEHOLDER;

  const cands: string[] = [];
  for (const f of PRODUCT_FIELDS) {
    if (f in prod) collect((prod as any)[f], cands);
  }
  if (cands.length) {
    const first = dedupePreferLocal(cands)[0];
    if (first) return first;
  }

  // Cart/order line item may nest the real product one level down.
  for (const nested of ['product', 'item', 'data', 'meta']) {
    const n = (prod as any)[nested];
    if (n && typeof n === 'object') {
      const s = bestProductImage(n);
      if (s && s !== PRODUCT_PLACEHOLDER) return s;
    }
  }
  return PRODUCT_PLACEHOLDER;
}

/** Resolve any single image input to a usable src. Never returns ''. */
export function resolveProductSrc(input: any): string {
  if (!input) return PRODUCT_PLACEHOLDER;
  if (typeof input === 'string') return absolutize(input) || PRODUCT_PLACEHOLDER;
  if (Array.isArray(input)) {
    const out: string[] = [];
    collect(input, out);
    return dedupePreferLocal(out)[0] || PRODUCT_PLACEHOLDER;
  }
  if (typeof input === 'object') {
    if (PRODUCT_FIELDS.some((k) => k in input)) return bestProductImage(input);
    const out: string[] = [];
    collect(input, out);
    return dedupePreferLocal(out)[0] || PRODUCT_PLACEHOLDER;
  }
  return PRODUCT_PLACEHOLDER;
}

interface Props {
  src: any;
  alt?: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  referrerPolicy?: string;
}

export default function ProductImage({ src, alt = '', className, loading = 'lazy', referrerPolicy = 'no-referrer' }: Props) {
  const [failed, setFailed] = useState(false);
  // Re-resolve when src changes, otherwise a recycled table row would keep the
  // "failed" state and render the placeholder forever.
  const [lastSrc, setLastSrc] = useState<any>(src);
  if (lastSrc !== src) { setLastSrc(src); setFailed(false); }
  const finalSrc = failed ? PRODUCT_PLACEHOLDER : resolveProductSrc(src);
  return (
    <img
      src={finalSrc}
      alt={alt}
      className={className}
      loading={loading}
      referrerPolicy={referrerPolicy as any}
      onError={() => setFailed(true)}
    />
  );
}
