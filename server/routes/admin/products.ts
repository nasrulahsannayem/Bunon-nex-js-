import express from "express";
import multer from "multer";
import { productDbPool } from "../../db";
import { invalidateProductsCache } from "../../services/redisClient";

const router = express.Router();

// CSV import arrives as multipart FormData field "file" (ProductsManager doImport)
const uploadCsv = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

const slugify = (s: string) =>
  s.toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

import {
  parseMaybeJSON,
  hydrateImageList,
  hydrateProductImages,
  toAbsoluteImageUrl,
  isLocalImageUrl,
  PRODUCT_PLACEHOLDER,
} from "../../services/imageUrl";

const toJSONString = (v: any) =>
  v == null ? null : (typeof v === "string" ? v : JSON.stringify(v));

// Normalize a raw DB image value into absolute, same-origin URLs.
// Mirrors server/store.ts hydration so the admin panel sees exactly what the
// storefront sees: local /uploads paths win and get DOMAIN_URL-prefixed, WP
// hotlinks are only a fallback. Without this the list route leaks raw JSON
// strings and the admin table renders broken thumbnails.
const COLUMNS = [
  "id", "wc_product_id", "name", "slug", "sku", "price", "regular_price",
  "sale_price", "on_sale", "stock_status", "stock_quantity", "description",
  "short_description", "images", "thumbnail", "categories", "category_id",
  "blog_ids", "tags", "menu_order", "date_created", "total_sales",
  "local_images", "product_url", "cost_price", "weight", "status",
  "featured", "track_stock", "delivery_fee", "isPromoted", "promoStart", "promoEnd", "promoBadge", "promoPrice", "created_at", "updated_at",
].join(", ");

const ORDER_WHITELIST: Record<string, string> = {
  id_desc: "id DESC", id_asc: "id ASC",
  price_desc: "price DESC", price_asc: "price ASC",
  name_asc: "name ASC", sales_desc: "total_sales DESC",
};

// GET /api/admin/products?q&category&stock_status&page&limit&order
router.get("/", async (req, res) => {
  try {
    const q = (req.query.q as string) || "";
    const category = (req.query.category as string) || "";
    const stockStatus = (req.query.stock_status as string) || "";
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const offset = (page - 1) * limit;
    const orderKey = (req.query.order as string) || "id_desc";
    const order = ORDER_WHITELIST[orderKey] || ORDER_WHITELIST.id_desc;

    const where: string[] = [];
    const params: any[] = [];
    if (q) {
      where.push("(name LIKE ? OR sku LIKE ? OR slug LIKE ?)");
      params.push("%" + q + "%", "%" + q + "%", "%" + q + "%");
    }
    if (stockStatus === "notrack") { where.push("track_stock = 0"); }
    else if (stockStatus === "lowstock") { where.push("track_stock <> 0 AND stock_quantity < 10"); }
    else if (stockStatus) { where.push("stock_status = ?"); params.push(stockStatus); }
    if (category) {
      where.push("(categories LIKE ? OR category_id = ?)");
      params.push("%" + category + "%", Number(category) || -1);
    }
    const whereStr = where.length ? "WHERE " + where.join(" AND ") : "";

    const [rows]: any = await productDbPool.execute(
      "SELECT " + COLUMNS + " FROM bunon_products " + whereStr +
      " ORDER BY " + order + " LIMIT " + limit + " OFFSET " + offset,
      params
    );
    const [cnt]: any = await productDbPool.execute(
      "SELECT COUNT(*) as total FROM bunon_products " + whereStr, params
    );
    const total = cnt[0].total;
    // Hydrate image columns: DB stores raw JSON strings + relative /uploads paths.
    // The storefront gets this via store.ts; the admin list must get it too or the
    // product table renders broken thumbnails.
    for (const p of rows) {
      hydrateProductImages(p);
      p.categories = parseMaybeJSON(p.categories);
      p.blog_ids = parseMaybeJSON(p.blog_ids);
      p.tags = parseMaybeJSON(p.tags);
    }
    // Frontend ProductsManager reads d.pagination — keep flat fields for compat
    res.json({ ok: true, products: rows, total, page, limit,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (e: any) {
    console.error("[Admin Products] List error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error fetching products" });
  }
});

// GET /api/admin/products/low-stock (qty < 10) — before /:id
router.get("/low-stock", async (_req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      "SELECT id, name, sku, stock_quantity, stock_status, track_stock FROM bunon_products " +
      "WHERE stock_quantity < 10 AND track_stock <> 0 ORDER BY stock_quantity ASC"
    );
    res.json({ ok: true, products: rows, count: (rows as any[]).length });
  } catch (e: any) {
    console.error("[Admin Products] Low-stock error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// GET /api/admin/products/export — CSV download — before /:id
router.get("/export", async (_req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      "SELECT id, name, slug, sku, price, regular_price, sale_price, stock_status, " +
      "stock_quantity, track_stock, delivery_fee, thumbnail, status, featured FROM bunon_products ORDER BY id ASC"
    );
    const head = "id,name,slug,sku,price,regular_price,sale_price,stock_status,stock_quantity,track_stock,delivery_fee,thumbnail,status,featured";
    const esc = (v: any) => '"' + String(v ?? "").replace(/"/g, '""') + '"';
    const csv = [head].concat((rows as any[]).map((r: any) =>
      [r.id, esc(r.name), r.slug, r.sku, r.price, r.regular_price, r.sale_price,
       r.stock_status, r.stock_quantity, r.track_stock ?? 1, r.delivery_fee ?? "", esc(r.thumbnail), r.status, r.featured].join(",")
    )).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=products_20260925.csv");
    res.send(csv);
  } catch (e: any) {
    console.error("[Admin Products] Export error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// GET /api/admin/products/:id — full incl parsed JSON fields
router.get("/:id", async (req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      "SELECT " + COLUMNS + " FROM bunon_products WHERE id = ? LIMIT 1", [req.params.id]
    );
    if (!(rows as any[]).length) return res.status(404).json({ ok: false, msg: "Product not found" });
    const p = (rows as any[])[0];
    for (const f of ["images", "categories", "blog_ids", "tags", "local_images"]) p[f] = parseMaybeJSON(p[f]);
    // Same absolute-URL hydration as the list route, so the edit modal photo
    // grid and thumbnail resolve identically to the storefront.
    hydrateProductImages(p);
    p.available = Number(p.track_stock) === 0 ? true : Number(p.stock_quantity || 0) > 0;
    res.json({ ok: true, product: p });
  } catch (e: any) {
    console.error("[Admin Products] Detail error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// POST /api/admin/products — create + slug auto + validation
router.post("/", async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.name) return res.status(400).json({ ok: false, msg: "name required" });
    if (b.price != null && isNaN(Number(b.price)))
      return res.status(400).json({ ok: false, msg: "price must be numeric" });
    const slug = slugify(b.slug || b.name);
    const [r]: any = await productDbPool.execute(
      "INSERT INTO bunon_products (name, slug, sku, price, regular_price, sale_price, on_sale, " +
      "stock_status, stock_quantity, track_stock, delivery_fee, description, short_description, images, thumbnail, " +
      "categories, category_id, tags, menu_order, cost_price, weight, status, featured) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [b.name, slug, b.sku ?? null, b.price ?? null, b.regular_price ?? null, b.sale_price ?? null,
       b.on_sale ? 1 : 0, b.stock_status || "instock", b.stock_quantity ?? 0,
       b.track_stock ?? 1, b.delivery_fee != null && b.delivery_fee !== "" ? Number(b.delivery_fee) : null,
       b.description ?? null, b.short_description ?? null, toJSONString(b.images),
       b.thumbnail ?? null, toJSONString(b.categories), b.category_id ?? null,
       toJSONString(b.tags), b.menu_order ?? 0, b.cost_price ?? null, b.weight ?? null,
       b.status || "publish", b.featured ? 1 : 0]
    );
    await invalidateProductsCache();
    res.json({ ok: true, id: (r as any).insertId, slug });
  } catch (e: any) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, msg: "slug or sku already exists" });
    console.error("[Admin Products] Create error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// PUT /api/admin/products/:id
router.put("/:id", async (req, res) => {
  try {
    const b = req.body || {};
    const slug = b.slug ? slugify(b.slug) : undefined;
    if (b.price !== undefined && b.price !== null && isNaN(Number(b.price)))
      return res.status(400).json({ ok: false, msg: "price must be numeric" });
    // Thumbnail auto-sync: frontend rarely sends thumbnail — derive from first image so cards never go blank.
    let thumb = b.thumbnail ?? null;
    if ((thumb == null || thumb === '') && b.images != null) {
      try {
        const arr = typeof b.images === 'string' ? JSON.parse(b.images) : b.images;
        const first = Array.isArray(arr) ? arr[0] : null;
        const src = typeof first === 'string' ? first : (first?.src || first?.url || null);
        if (src) thumb = src;
      } catch { /* keep null -> COALESCE keeps old */ }
    }
    const [r]: any = await productDbPool.execute(
      "UPDATE bunon_products SET " +
      "name = COALESCE(?, name), slug = COALESCE(?, slug), sku = COALESCE(?, sku), " +
      "price = COALESCE(?, price), regular_price = COALESCE(?, regular_price), " +
      "sale_price = COALESCE(?, sale_price), on_sale = COALESCE(?, on_sale), " +
      "stock_status = COALESCE(?, stock_status), stock_quantity = COALESCE(?, stock_quantity), " +
      "description = COALESCE(?, description), short_description = COALESCE(?, short_description), " +
      "images = COALESCE(?, images), thumbnail = COALESCE(?, thumbnail), " +
      "categories = COALESCE(?, categories), category_id = COALESCE(?, category_id), " +
      "blog_ids = COALESCE(?, blog_ids), tags = COALESCE(?, tags), " +
      "menu_order = COALESCE(?, menu_order), cost_price = COALESCE(?, cost_price), " +
      "weight = COALESCE(?, weight), status = COALESCE(?, status), " +
      "featured = COALESCE(?, featured), track_stock = COALESCE(?, track_stock), total_sales = COALESCE(?, total_sales), " +
      "isPromoted = COALESCE(?, isPromoted), promoStart = COALESCE(?, promoStart), promoEnd = COALESCE(?, promoEnd), " +
      "promoBadge = COALESCE(?, promoBadge), promoPrice = COALESCE(?, promoPrice), " +
      "updated_at = NOW() " +
      "WHERE id = ?",
      [b.name ?? null, slug ?? null, b.sku ?? null, b.price ?? null, b.regular_price ?? null,
       b.sale_price ?? null, b.on_sale ?? null, b.stock_status ?? null, b.stock_quantity ?? null,
       b.description ?? null, b.short_description ?? null, toJSONString(b.images) ?? null,
       thumb, toJSONString(b.categories) ?? null, b.category_id ?? null,
       toJSONString(b.blog_ids) ?? null, toJSONString(b.tags) ?? null, b.menu_order ?? null,
       b.cost_price ?? null, b.weight ?? null, b.status ?? null, b.featured ?? null,
       b.track_stock ?? null, b.total_sales ?? null,
       b.isPromoted ?? null, b.promoStart ?? null, b.promoEnd ?? null,
       b.promoBadge ?? null, b.promoPrice ?? null,
       req.params.id]
    );
    if ((r as any).affectedRows === 0) return res.status(404).json({ ok: false, msg: "Product not found" });
    // Dual-price explicit clear: empty sale_price removes the offer (COALESCE above can't NULL it)
    if (b.sale_price === null || b.sale_price === '') {
      await productDbPool.execute("UPDATE bunon_products SET sale_price = NULL, on_sale = 0 WHERE id = ?", [req.params.id]);
    } else if (b.sale_price !== undefined) {
      await productDbPool.execute("UPDATE bunon_products SET sale_price = ?, on_sale = CASE WHEN ? < regular_price THEN 1 ELSE 0 END WHERE id = ?", [Number(b.sale_price), Number(b.sale_price), req.params.id]);
    }
    if (b.regular_price !== undefined && b.regular_price !== null && b.regular_price !== '') {
      await productDbPool.execute("UPDATE bunon_products SET price = CASE WHEN sale_price IS NOT NULL AND sale_price > 0 AND sale_price < ? THEN sale_price ELSE ? END, on_sale = CASE WHEN sale_price IS NOT NULL AND sale_price > 0 AND sale_price < ? THEN 1 ELSE 0 END WHERE id = ?", [Number(b.regular_price), Number(b.regular_price), Number(b.regular_price), req.params.id]);
    }
    if (b.delivery_fee !== undefined) {
      const v = (b.delivery_fee === null || b.delivery_fee === "") ? null : Number(b.delivery_fee);
      if (v !== null && isNaN(v)) return res.status(400).json({ ok: false, msg: "delivery_fee must be numeric" });
      await productDbPool.execute("UPDATE bunon_products SET delivery_fee = ? WHERE id = ?", [v, req.params.id]);
    }
    // Promotion fields
    if (b.isPromoted !== undefined) {
      await productDbPool.execute("UPDATE bunon_products SET isPromoted = ? WHERE id = ?", [b.isPromoted ? 1 : 0, req.params.id]);
    }
    if (b.promoPrice !== undefined) {
      const v = (b.promoPrice === null || b.promoPrice === "") ? null : Number(b.promoPrice);
      if (v !== null && isNaN(v)) return res.status(400).json({ ok: false, msg: "promoPrice must be numeric" });
      await productDbPool.execute("UPDATE bunon_products SET promoPrice = ? WHERE id = ?", [v, req.params.id]);
    }
    if (b.promoBadge !== undefined) {
      await productDbPool.execute("UPDATE bunon_products SET promoBadge = ? WHERE id = ?", [b.promoBadge || null, req.params.id]);
    }
    if (b.promoStart !== undefined) {
      await productDbPool.execute("UPDATE bunon_products SET promoStart = ? WHERE id = ?", [b.promoStart || null, req.params.id]);
    }
    if (b.promoEnd !== undefined) {
      await productDbPool.execute("UPDATE bunon_products SET promoEnd = ? WHERE id = ?", [b.promoEnd || null, req.params.id]);
    }
    await invalidateProductsCache();
    res.json({ ok: true });
  } catch (e: any) {
    if (e.code === "ER_DUP_ENTRY") return res.status(409).json({ ok: false, msg: "slug or sku already exists" });
    console.error("[Admin Products] Update error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// DELETE /api/admin/products/:id — block if referenced in order items
router.delete("/:id", async (req, res) => {
  try {
    const id = req.params.id;
    let referenced = false;
    try {
      const [refs]: any = await productDbPool.execute(
        "SELECT COUNT(*) as n FROM bf_order_items WHERE product_id = ?", [id]
      );
      referenced = (refs as any[])[0].n > 0;
    } catch { referenced = false; }
    if (referenced)
      return res.status(409).json({ ok: false, msg: "Product is referenced by orders — cannot delete" });
    const [r]: any = await productDbPool.execute("DELETE FROM bunon_products WHERE id = ?", [id]);
    if ((r as any).affectedRows === 0) return res.status(404).json({ ok: false, msg: "Product not found" });
    await invalidateProductsCache();
    res.json({ ok: true });
  } catch (e: any) {
    console.error("[Admin Products] Delete error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// POST /api/admin/products/:id/duplicate
router.post("/:id/duplicate", async (req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      "SELECT * FROM bunon_products WHERE id = ? LIMIT 1", [req.params.id]
    );
    if (!(rows as any[]).length) return res.status(404).json({ ok: false, msg: "Product not found" });
    const p = (rows as any[])[0];
    const newSlug = p.slug + "-copy-" + Date.now().toString(36);
    const [r]: any = await productDbPool.execute(
      "INSERT INTO bunon_products (name, slug, sku, price, regular_price, sale_price, on_sale, " +
      "stock_status, stock_quantity, track_stock, delivery_fee, description, short_description, images, thumbnail, " +
      "categories, category_id, blog_ids, tags, menu_order, cost_price, weight, status, featured) " +
      "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [p.name + " (Copy)", newSlug, p.sku ? p.sku + "-COPY" : null, p.price, p.regular_price,
       p.sale_price, p.on_sale, "outofstock", 0, p.track_stock ?? 1, p.delivery_fee ?? null, p.isPromoted ?? 0, p.promoStart, p.promoEnd, p.promoBadge || null, p.promoPrice, p.description, p.short_description, p.images,
       p.thumbnail, p.categories, p.category_id, p.blog_ids, p.tags, p.menu_order,
       p.cost_price, p.weight, "draft", 0]
    );
    await invalidateProductsCache();
    res.json({ ok: true, id: (r as any).insertId, slug: newSlug });
  } catch (e: any) {
    console.error("[Admin Products] Duplicate error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// PUT /api/admin/products/stock/batch — {items:[{id,qty}], reason} + inventory log
router.put("/stock/batch", async (req, res) => {
  try {
    const items = req.body?.items;
    if (!Array.isArray(items) || !items.length)
      return res.status(400).json({ ok: false, msg: "items array required" });
    const reason = req.body?.reason || "admin batch adjust";
    try {
      await productDbPool.execute(
        "CREATE TABLE IF NOT EXISTS bunon_inventory_logs (" +
        "id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, " +
        "old_qty INT NULL, new_qty INT NOT NULL, delta INT NULL, " +
        "reason VARCHAR(255) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, " +
        "INDEX (product_id))"
      );
    } catch { /* log table best-effort */ }
    let updated = 0;
    const errors: any[] = [];
    for (const it of items) {
      if (it.id == null || it.qty == null || isNaN(Number(it.qty))) {
        errors.push({ id: it.id, msg: "invalid id/qty" }); continue;
      }
      try {
        const [cur]: any = await productDbPool.execute(
          "SELECT stock_quantity, track_stock FROM bunon_products WHERE id = ? LIMIT 1", [it.id]
        );
        if (!(cur as any[]).length) { errors.push({ id: it.id, msg: "not found" }); continue; }
        if (Number((cur as any[])[0].track_stock) === 0) {
          const skipMsg = "skipped: tracking disabled (no-track/infinite stock)";
          try {
            await productDbPool.execute(
              "INSERT INTO bunon_inventory_logs (product_id, old_qty, new_qty, delta, reason) " +
              "VALUES (?, ?, ?, ?, ?)",
              [it.id, Number((cur as any[])[0].stock_quantity || 0), Number((cur as any[])[0].stock_quantity || 0), 0, reason + " (skipped: no-track)"]
            );
          } catch { /* log best-effort */ }
          errors.push({ id: it.id, skipped: true, msg: skipMsg });
          continue;
        }
        const oldQty = Number((cur as any[])[0].stock_quantity || 0);
        const newQty = Number(it.qty);
        await productDbPool.execute(
          "UPDATE bunon_products SET stock_quantity = ?, " +
          "stock_status = IF(? > 0, 'instock', 'outofstock') WHERE id = ?",
          [newQty, newQty, it.id]
        );
        try {
          await productDbPool.execute(
            "INSERT INTO bunon_inventory_logs (product_id, old_qty, new_qty, delta, reason) " +
            "VALUES (?, ?, ?, ?, ?)",
            [it.id, oldQty, newQty, newQty - oldQty, reason]
          );
        } catch { /* log best-effort */ }
        updated++;
      } catch (e: any) { errors.push({ id: it.id, msg: e.message }); }
    }
    await invalidateProductsCache();
    res.json({ ok: true, updated, skipped: (errors as any[]).filter((e: any) => e.skipped).length, errors });
  } catch (e: any) {
    console.error("[Admin Products] Stock batch error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

// POST /api/admin/products/import — CSV parse, upsert by sku
// Accepts multipart file field "file" (frontend) OR JSON {csv: string} (legacy)
router.post("/import", uploadCsv.single("file"), async (req, res) => {
  try {
    const csv = (req as any).file?.buffer?.toString("utf-8") ?? req.body?.csv;
    if (typeof csv !== "string" || !csv.trim())
      return res.status(400).json({ ok: false, msg: "csv string required in body.csv" });
    const parseLine = (line: string): string[] => {
      const out: string[] = [];
      let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (inQ) {
          if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
          else if (c === '"') inQ = false;
          else cur += c;
        } else if (c === '"') inQ = true;
        else if (c === ",") { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur);
      return out;
    };
    const lines = csv.trim().split(/\r?\n/);
    const headers = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
    const skuIdx = headers.indexOf("sku");
    if (skuIdx === -1) return res.status(400).json({ ok: false, msg: "csv must have a sku column" });
    let created = 0, updated = 0;
    const errors: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      if (!lines[i].trim()) continue;
      try {
        const cells = parseLine(lines[i]);
        const row: Record<string, string> = {};
        headers.forEach((h, j) => { row[h] = cells[j] ?? ""; });
        const sku = (row.sku || "").trim();
        if (!sku) { errors.push({ line: i + 1, msg: "missing sku" }); continue; }
        const name = (row.name || "").trim() || sku;
        const [ex]: any = await productDbPool.execute(
          "SELECT id FROM bunon_products WHERE sku = ? LIMIT 1", [sku]
        );
        if ((ex as any[]).length) {
          await productDbPool.execute(
            "UPDATE bunon_products SET name = COALESCE(NULLIF(?, ''), name), " +
            "price = COALESCE(NULLIF(?, ''), price), " +
            "stock_quantity = COALESCE(NULLIF(?, ''), stock_quantity), " +
            "stock_status = COALESCE(NULLIF(?, ''), stock_status), " +
            "status = COALESCE(NULLIF(?, ''), status) WHERE sku = ?",
            [row.name || "", row.price || "", row.stock_quantity || "",
             row.stock_status || "", row.status || "", sku]
          );
          updated++;
        } else {
          const autoSlug = slugify(row.slug || name) + "-" +
            sku.toLowerCase().replace(/[^a-z0-9]+/g, "");
          await productDbPool.execute(
            "INSERT INTO bunon_products (name, slug, sku, price, regular_price, sale_price, " +
            "stock_status, stock_quantity, thumbnail, status) " +
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [name, autoSlug, sku, row.price || null, row.regular_price || null,
             row.sale_price || null, row.stock_status || "instock",
             row.stock_quantity ? Number(row.stock_quantity) : 0,
             row.thumbnail || null, row.status || "publish"]
          );
          created++;
        }
      } catch (e: any) { errors.push({ line: i + 1, msg: e.message }); }
    }
    // Frontend reads d.imported / d.skipped — keep created/updated for compat
    await invalidateProductsCache();
    res.json({ ok: true, created, updated, errors,
      imported: created + updated, skipped: errors.length });
  } catch (e: any) {
    console.error("[Admin Products] Import error:", e.message);
    res.status(500).json({ ok: false, msg: "Server error" });
  }
});

export default router;
