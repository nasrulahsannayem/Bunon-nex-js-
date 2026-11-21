import { productDbPool } from "../db";

/**
 * Canonical category shape for the whole Bunon stack.
 *
 * The admin panel sends categories as numeric IDs (`[50]`), WooCommerce gives
 * objects (`[{name,slug}]`), and the storefront filters by slug. Three shapes
 * meant `/product-category/<slug>` rendered empty for anything saved from the
 * admin. Everything funnels through here so DB rows, API payloads and the
 * storefront always see `{ id, name, slug }`.
 */

export type NormalCategory = { id: number; name: string; slug: string };

const TTL_MS = 5 * 60 * 1000;
let cache: { at: number; index: Map<string, NormalCategory> } | null = null;
let inflight: Promise<Map<string, NormalCategory>> | null = null;

const slugify = (s: any) =>
  String(s == null ? "" : s)
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function loadIndex(): Promise<Map<string, NormalCategory>> {
  try {
    const [rows]: any = await productDbPool.execute(
      "SELECT id, name, slug FROM bunon_categories WHERE status = 1"
    );
    const index = new Map<string, NormalCategory>();
    for (const r of rows || []) {
      const cat: NormalCategory = {
        id: Number(r.id),
        name: r.name,
        slug: r.slug || slugify(r.name),
      };
      index.set(String(cat.id), cat);
      index.set(cat.slug.toLowerCase(), cat);
      index.set(String(cat.name).toLowerCase(), cat);
    }
    cache = { at: Date.now(), index };
    return index;
  } catch (e: any) {
    console.error("[categoryResolver] index load failed:", e?.message);
    return cache?.index || new Map();
  }
}

/** id / slug / name -> NormalCategory. Never throws. */
export async function getCategoryIndex(): Promise<Map<string, NormalCategory>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.index;
  if (!inflight) {
    inflight = loadIndex().finally(() => { inflight = null; });
  }
  return inflight;
}

export function invalidateCategoryIndex() {
  cache = null;
}

/**
 * Turn any stored/admin category value into `[{ id, name, slug }]`.
 * Accepts: 50 | "50" | "salah-chair" | "Salah Chair" | {id,name,slug} | JSON string.
 * Unresolvable entries are kept as `{id:0, name:<raw>, slug:slugify(raw>)}` so a
 * category can never silently vanish from a product.
 */
export async function normalizeCategories(raw: any): Promise<NormalCategory[]> {
  let list: any = raw;
  if (typeof list === "string") {
    const t = list.trim();
    if (!t) return [];
    try { list = JSON.parse(t); } catch { list = [t]; }
  }
  if (list == null) return [];
  if (!Array.isArray(list)) list = [list];

  const index = await getCategoryIndex();
  const out: NormalCategory[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    if (entry == null || entry === "") continue;

    let cat: NormalCategory | null = null;

    if (typeof entry === "object") {
      const id = Number(entry.id);
      if (Number.isFinite(id) && id > 0) cat = index.get(String(id)) || null;
      if (!cat && entry.slug) cat = index.get(String(entry.slug).toLowerCase()) || null;
      if (!cat && entry.name) cat = index.get(String(entry.name).toLowerCase()) || null;
      if (!cat) {
        const slug = slugify(entry.slug || entry.name || "");
        if (slug) cat = { id: Number.isFinite(id) && id > 0 ? id : 0, name: entry.name || slug, slug };
      }
    } else {
      const key = String(entry).trim();
      cat = index.get(key) || index.get(key.toLowerCase()) || null;
      if (!cat) {
        const s = slugify(key);
        cat = s ? { id: 0, name: key, slug: s } : null;
      }
    }

    if (!cat) continue;
    const dedupe = `${cat.id}:${cat.slug}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    out.push(cat);
  }
  return out;
}

/**
 * Read-normalize a raw DB `categories` column and guarantee a usable
 * `category_id` for the product row.
 */
export async function hydrateCategoriesForProduct(row: any) {
  const cats = await normalizeCategories(row?.categories);
  const catsOut = cats.length > 0 ? cats : [{ id: 0, name: "All Products", slug: "All" }];
  const rawId = Number(row?.category_id);
  const categoryId = Number.isFinite(rawId) && rawId > 0
    ? rawId
    : (catsOut.find((c) => c.id > 0)?.id ?? null);
  return { categories: catsOut, category_id: categoryId };
}