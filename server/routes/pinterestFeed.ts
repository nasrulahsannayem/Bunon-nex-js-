import type { Express, Request, Response } from "express";
import { getCachedProducts } from "../services/redisClient";

/**
 * Pinterest Catalog feed (RSS 2.0 + Google g: namespace).
 *
 * Format dictated by Pinterest's own sample feed:
 * https://s.pinimg.com/sub/helpcenter/assets/pinterest_product_sample_xml_feed.xml
 * and matched tag-for-tag, because Pinterest rejects anything else with
 * "RSS feed unknown format":
 *
 *   - root MUST be <rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">
 *     with a <channel> wrapper. A <catalog>/<products> tree is rejected.
 *   - title, description, link, availability, sale_price are PLAIN tags.
 *   - id, price, image_link, condition, brand, product_type are g: namespaced.
 *   - availability must be capitalised ("In Stock"); price needs ISO 4217.
 *
 * Every product here is a made-to-order COD product, so identifier_exists is
 * FALSE (no EAN/MPN) and a shipping block is declared.
 */

const escapeXml = (str: unknown): string => {
  if (str === null || str === undefined || str === "") return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
};

/* Images/categories are stored inconsistently: some rows hold [{src,...}]
 * objects, others hold bare URL strings, some are empty. Read the first
 * usable value out of whichever shape arrived so one bad row cannot take
 * down the whole feed. */
const firstUrl = (list: any): string => {
  if (!list) return "";
  const arr = Array.isArray(list) ? list : [list];
  for (const entry of arr) {
    if (!entry) continue;
    if (typeof entry === "string" && entry.trim()) return entry.trim();
    if (typeof entry === "object") {
      const u =
        entry.src || entry.url || entry.href || entry.link || entry.full || entry.source_url;
      if (typeof u === "string" && u.trim()) return u.trim();
    }
  }
  return "";
};

/* Prices arrive as numbers, "৳1,850", "1850.00 ৳", or Bengali/Arabic digits.
 * Pinterest rejects the whole item on a malformed price, so anything that
 * does not reduce to a positive number is dropped rather than guessed at. */
const toPrice = (raw: any): string => {
  if (raw === null || raw === undefined || raw === "") return "";
  if (typeof raw === "number") {
    return Number.isFinite(raw) && raw > 0 ? raw.toFixed(2) : "";
  }
  let s = String(raw).trim();
  s = s.replace(/[০-৯]/g, (c) => String(c.charCodeAt(0) - 2534));
  s = s.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 1632));
  s = s.replace(/[^\d.]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : "";
};

/* Pinterest needs absolute https URLs; a protocol-relative or root-relative
 * image is worse than none at all, so those rows are skipped. */
const absUrl = (url: string, origin: string): string => {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return "https:" + url;
  if (url.startsWith("/")) return origin + url;
  return "";
};

const ORIGIN = process.env.SEO_ORIGIN || "https://bunonfabrics.com";

export default function pinterestFeedRoute(app: Express) {
  app.get("/api/pinterest/feed.xml", async (_req: Request, res: Response) => {
    const emptyDoc =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n' +
      "<channel></channel>\n</rss>";

    try {
      const products: any[] = (await getCachedProducts()) || [];

      if (!products.length) {
        return res.status(503).type("application/xml").send(emptyDoc);
      }

      const items: string[] = [];
      let skipped = 0;

      for (const p of products) {
        const id = p?.id != null ? String(p.id) : "";
        const title = String(p?.name || p?.title || "").trim();
        const image = absUrl(firstUrl(p?.images), ORIGIN);
        const sale = toPrice(p?.sale_price);
        const base = toPrice(p?.price);
        // Neither sale nor base price means the item cannot be priced, and an
        // unpriced item invalidates the whole entry.
        const price = sale || base;
        // Bunon is made-to-order COD: stock_status carries the real answer,
        // while stock/quantity are frequently 0 and would wrongly mark every
        // product out of stock.
        const status = String(p?.stock_status || "").toLowerCase();
        const inStock = status ? status === "instock" : true;
        const extraImages = (Array.isArray(p?.images) ? p.images : [])
          .map((e: any) => absUrl(typeof e === "string" ? e : e?.src, ORIGIN))
          .filter((u: string) => u && u !== image)
          .slice(0, 3);

        if (!id || !title || !image || !price) {
          skipped++;
          continue;
        }

        const link =
          absUrl(p?.permalink || p?.link || p?.url, ORIGIN) || `${ORIGIN}/product/${id}`;

        // Pinterest truncates description at 5000 characters.
        const desc = String(p?.description || p?.short_description || "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 5000);

        // categories sometimes holds a bare numeric id rather than a name,
        // and "4" is useless to Pinterest's taxonomy, so ids are dropped.
        const cat = p?.categories
          ? Array.isArray(p.categories)
            ? p.categories[0]
            : p.categories
          : null;
        const rawCat =
          typeof cat === "object" && cat !== null
            ? cat.name || cat.title || ""
            : cat || "";
        const catName = /^\d+$/.test(String(rawCat).trim()) ? "" : String(rawCat).trim();

        items.push(
          [
            "<item>",
            `  <g:id>${escapeXml(id)}</g:id>`,
            `  <title>${escapeXml(title)}</title>`,
            `  <description>${escapeXml(desc)}</description>`,
            catName ? `  <g:product_type>${escapeXml(catName)}</g:product_type>` : "",
            `  <link>${escapeXml(link)}</link>`,
            `  <g:image_link>${escapeXml(image)}</g:image_link>`,
            "  <g:condition>New</g:condition>",
            `  <availability>${inStock ? "In Stock" : "Out of Stock"}</availability>`,
            `  <g:price>${price} BDT</g:price>`,
            sale ? `  <sale_price>${sale} BDT</sale_price>` : "",
            `  <g:brand>${escapeXml(p?.brand || "Bunon Fabrics")}</g:brand>`,
            "  <g:gender>unisex</g:gender>",
            "  <g:age_group>adult</g:age_group>",
            "  <g:identifier_exists>FALSE</g:identifier_exists>",
            "  <g:tax>",
            "    <g:country>BD</g:country>",
            "    <g:rate>0</g:rate>",
            "    <g:tax_ship>n</g:tax_ship>",
            "  </g:tax>",
            "  <g:shipping>",
            "    <g:country>BD</g:country>",
            `    <g:price>${(Number(process.env.SHIPPING_FEE_BDT) || 130).toFixed(2)} BDT</g:price>`,
            "  </g:shipping>",
            ...extraImages.map(
              (u: string) => `  <g:additional_image_link>${escapeXml(u)}</g:additional_image_link>`
            ),
            "</item>",
          ]
            .filter(Boolean)
            .join("\n")
        );
      }

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
        "<channel>",
        "  <title>Bunon Fabrics</title>",
        `  <link>${ORIGIN}</link>`,
        "  <description>Premium heritage textiles, sarees and ethnic wear from Bunon Fabrics</description>",
        items.join("\n"),
        "</channel>",
        "</rss>",
      ].join("\n");

      console.log(
        `[Pinterest Feed] ${items.length} items served (${skipped} skipped: missing id/title/image/price)`
      );

      res.setHeader("Content-Type", "application/xml; charset=utf-8");
      res.setHeader("Cache-Control", "public, max-age=600");
      res.status(200).send(xml);
    } catch (err: any) {
      console.error("[Pinterest Feed] error:", err?.message || err);
      res.status(500).type("application/xml").send(emptyDoc);
    }
  });
}