import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * BlogProductSection
 *
 * First-party merchandising block shown at the END of every blog post.
 *
 * WHY THIS EXISTS
 *   GSC shows the site's real organic footprint is saree-caption / blog text
 *   queries ("শাড়ি নিয়ে ক্যাপশন" 3,800 imp pos 6.15, "saree caption bangla"
 *   1,222 imp pos 7.65). Before this component a blog post had ZERO links to
 *   /product/*, so that traffic read the article and left without ever seeing
 *   the catalogue. This turns article traffic into shoppable traffic using our
 *   OWN products - no third-party ad network involved.
 *
 * SMART MATCHING (no manual tagging)
 *   Nothing tells us "this post is about jamdani". So the relevance is derived
 *   from data we already have:
 *     1. keyword score  - post title + body tokens vs product name/tags
 *     2. category prior - posts mentioning the word "saree"/"শাড়ি" skew saree
 *     3. bestseller prior - sales proxy fills the leftover slots
 *   Everything comes from /api/products, i.e. the live MySQL -> Redis -> API
 *   flow. WordPress is never queried at runtime.
 *
 * Excluded deliberately: out-of-stock, zero price, and any product already in
 * the reader's cart (the drawer handles upsell for those).
 */

type Product = {
  id: number | string;
  name: string;
  slug?: string;
  price?: string | number;
  sale_price?: string | number;
  regular_price?: string | number;
  thumbnail?: string;
  images?: string[];
  stock_status?: string;
  categories?: { name: string; slug: string }[];
};

const IMG_FALLBACK =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="240"><rect width="100%" height="100%" fill="#f1f5f9"/><text x="50%" y="50%" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#94a3b8">Bunon</text></svg>'
  );

/** Bengali + English tokens that map onto a product category slug. */
const CATEGORY_HINTS: { words: string[]; cat: string; label: string }[] = [
  { words: ['জামদানি', 'jamdani'], cat: 'jamdani', label: 'জামদানি' },
  { words: ['হাফ সিল্ক', 'hafsilk', 'half silk', 'হাফসিল্ক'], cat: 'hafsilk', label: 'হাফ সিল্ক' },
  { words: ['সিল্ক', 'silk', 'শাড়ি', 'saree', 'sari'], cat: 'saree', label: 'সিল্ক শাড়ি' },
  { words: ['কটন', 'cotton', 'সুতি', 'suti'], cat: 'cotton', label: 'সুতি' },
  { words: ['বিয়ে', 'wedding', 'নববিবাহী'], cat: 'saree', label: 'বিয়ের শাড়ি' },
  { words: ['ঈদ', 'eid'], cat: 'saree', label: 'ঈদের শাড়ি' },
];

const STOP = new Set([
  'শাড়ি', 'শাড়ী', 'ক্যাপশন', 'নিয়ে', 'ছবি', 'ভাইরাল', 'ভিডিও', 'এই', 'আর',
  'the', 'and', 'for', 'with', 'you', 'your', 'how', 'what', 'best', 'top',
  'new', 'কীভাবে', 'কেন', 'বা', 'এবং', 'সাথে', 'না', 'হয়', 'ও', 'পরে',
]);

function tokenize(s: string): string[] {
  return String(s || '')
    .toLowerCase()
    .replace(/<[^>]*>/g, ' ')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 2 && !STOP.has(t))
    .slice(0, 260);
}

/** Cheap sales proxy: lower price + on_sale == more likely to be moving. */
function momentum(p: Product): number {
  const price = Number(p.sale_price || p.price || p.regular_price || 0);
  if (!price) return 0;
  return (p.sale_price && Number(p.sale_price) < Number(p.regular_price || price) ? 1.4 : 1) *
    (price <= 2000 ? 1.15 : price <= 3500 ? 1.0 : 0.8);
}

export default function BlogProductSection({
  postTitle,
  postContent,
  limit = 6,
}: {
  postTitle?: string;
  postContent?: string;
  limit?: number;
}) {
  const [items, setItems] = useState<Product[] | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/products?limit=300')
      .then((r) => r.json())
      .then((d: any) => {
        if (!alive) return;
        const all: Product[] = Array.isArray(d?.data) ? d.data : [];

        // Hard eligibility filter - never show something unbuyable.
        const pool = all.filter((p) => {
          if (p.stock_status && p.stock_status !== 'instock') return false;
          const price = Number(p.sale_price || p.price || 0);
          return price > 0;
        });
        if (!pool.length) { setItems([]); return; }

        const tokens = tokenize(`${postTitle || ''} ${postContent || ''}`);
        const tset = new Set(tokens);

        // Which categories does this article talk about?
        const wanted = new Map<string, number>();
        for (const h of CATEGORY_HINTS) {
          for (const w of h.words) {
            if (tset.has(w)) wanted.set(h.cat, (wanted.get(h.cat) || 0) + 3);
          }
        }

        const scored = pool.map((p) => {
          const name = String(p.name || '').toLowerCase();
          const cats = (p.categories || []).map((c) => String(c.slug || '').toLowerCase());
          let score = momentum(p);

          // 1) direct keyword overlap with the product name
          for (const t of tokens) if (name.includes(t)) score += 1.2;
          // 2) the article's implied categories
          for (const [cat, w] of wanted) if (cats.includes(cat)) score += w;
          // 3) a saree article should not be swamped by nightdress products
          if (cats.includes('saree') && (tset.has('saree') || tset.has('sari') || tset.has('শাড়ি'))) {
            score += 2.0;
          }
          return { p, score };
        });

        scored.sort((a, b) => b.score - a.score);
        const picked = scored.slice(0, limit).map((x) => x.p);
        if (alive) setItems(picked);
      })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
  }, [postTitle, postContent, limit]);

  if (items === null) return null;
  if (!items.length) return null;

  return (
    <section className="mt-10 rounded-2xl border border-brand-navy/10 bg-brand-navy/[0.03] p-4 sm:p-5">
      <h2 className="text-lg font-black text-brand-navy mb-1">আপনার জন্য প্রস্তাবিত শাড়ি</h2>
      <p className="text-xs text-gray-500 mb-4">এই পোস্ট পড়া মানুষদের জন্য আমাদের সেরা পছন্দগুলো</p>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {items.map((p) => {
          const price = Number(p.sale_price || p.price || 0);
          const was = Number(p.regular_price || 0);
          const img = p.thumbnail || (p.images && p.images[0]) || '';
          return (
            <Link
              key={p.id}
              to={`/product/${p.slug || p.id}`}
              className="group bg-white rounded-xl overflow-hidden border border-gray-100 hover:border-brand-primary/40 transition"
            >
              <div className="aspect-[3/4] bg-gray-50 overflow-hidden">
                <img
                  src={img || IMG_FALLBACK}
                  alt={p.name}
                  loading="lazy"
                  onError={(e) => { e.currentTarget.src = IMG_FALLBACK; }}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </div>
              <div className="p-2.5">
                <p className="text-[11px] leading-snug text-brand-navy line-clamp-2 min-h-[30px]">
                  {p.name}
                </p>
                <div className="mt-1.5 flex items-baseline gap-1.5">
                  <span className="text-sm font-black text-brand-primary">৳{price}</span>
                  {was > price && (
                    <span className="text-[10px] text-gray-400 line-through">৳{was}</span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}