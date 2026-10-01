// migrate_wc_products.cjs — one-time wc_products_full -> bunon_products upsert by sku.
// Usage: node scripts/migrate_wc_products.cjs [--dry-run]   (dry-run default if DRY set? no: explicit flag)
// No args = REAL run. Always prints counts.
const mysql = require("mysql2/promise");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), override: true });

const DRY = process.argv.includes("--dry-run");

const CREATE_SQL = `CREATE TABLE IF NOT EXISTS bunon_products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  wc_product_id INT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NULL UNIQUE,
  sku VARCHAR(100) NULL UNIQUE,
  price DECIMAL(10,2) NULL,
  regular_price DECIMAL(10,2) NULL,
  sale_price DECIMAL(10,2) NULL,
  on_sale TINYINT(1) NULL DEFAULT 0,
  stock_status VARCHAR(50) NULL DEFAULT 'instock',
  stock_quantity INT NULL DEFAULT 0,
  description LONGTEXT NULL,
  short_description TEXT NULL,
  images LONGTEXT NULL,
  thumbnail VARCHAR(500) NULL,
  categories LONGTEXT NULL,
  category_id INT NULL,
  blog_ids LONGTEXT NULL,
  tags LONGTEXT NULL,
  menu_order INT NULL DEFAULT 0,
  date_created DATETIME NULL,
  total_sales INT NULL DEFAULT 0,
  local_images LONGTEXT NULL,
  product_url VARCHAR(600) NULL,
  cost_price DECIMAL(10,2) NULL,
  weight DECIMAL(10,2) NULL,
  status VARCHAR(20) NULL DEFAULT 'publish',
  featured TINYINT(1) NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX (sku), INDEX (slug), INDEX (stock_status)
)`;

const COLS = ["wc_product_id", "name", "slug", "sku", "price", "regular_price",
  "sale_price", "on_sale", "stock_status", "stock_quantity", "description",
  "short_description", "images", "thumbnail", "categories", "category_id",
  "blog_ids", "tags", "menu_order", "date_created", "total_sales",
  "local_images", "product_url"];

(async () => {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: (process.env.DB_PASSWORD || "").trim().replace(/"/g, ""),
    database: process.env.DB_NAME,
  });
  try {
    console.log("MODE:", DRY ? "DRY-RUN" : "REAL");
    const [tbls] = await conn.query("SHOW TABLES");
    const names = tbls.map((r) => Object.values(r)[0]);
    const hasBp = names.includes("bunon_products");
    if (!hasBp) {
      console.log("bunon_products MISSING -> will CREATE (fresh table, no backup needed)");
      if (!DRY) await conn.query(CREATE_SQL);
    } else if (!DRY) {
      await conn.query("CREATE TABLE IF NOT EXISTS bunon_products_bak_20260925 LIKE bunon_products");
      const [c0] = await conn.query("SELECT COUNT(*) n FROM bunon_products_bak_20260925");
      if (c0[0].n === 0) {
        await conn.query("INSERT INTO bunon_products_bak_20260925 SELECT * FROM bunon_products");
        console.log("backup bunon_products -> bunon_products_bak_20260925 done");
      } else console.log("backup table already populated, skip re-backup");
      await conn.query(CREATE_SQL); // ensure new columns exist (no-op if same)
    }
    const [wc] = await conn.query("SELECT * FROM wc_products_full");
    console.log("wc_products_full rows:", wc.length);
    let insert = 0, update = 0, skip = 0;
    const errs = [];
    for (const w of wc) {
      try {
        const sku = w.sku != null && String(w.sku).trim() !== "" ? String(w.sku).trim() : null;
        if (!sku) { skip++; continue; }
        const vals = COLS.map((c) => (c === "sku" ? sku : w[c] ?? null));
        if (DRY) {
          if (!hasBp) { insert++; continue; }
          const [ex] = await conn.query("SELECT id FROM bunon_products WHERE sku = ? LIMIT 1", [sku]);
          if (ex.length) update++; else insert++;
          continue;
        }
        const [ex] = await conn.query("SELECT id FROM bunon_products WHERE sku = ? LIMIT 1", [sku]);
        if (ex.length) {
          const set = COLS.map((c) => c + " = VALUES(" + c + ")").join(", ");
          await conn.query(
            "INSERT INTO bunon_products (" + COLS.join(", ") + ") VALUES (" + COLS.map(() => "?").join(", ") + ") " +
            "ON DUPLICATE KEY UPDATE " + set, vals
          );
          update++;
        } else {
          await conn.query(
            "INSERT INTO bunon_products (" + COLS.join(", ") + ") VALUES (" + COLS.map(() => "?").join(", ") + ")", vals
          );
          insert++;
        }
      } catch (e) { errs.push({ sku: w.sku, msg: e.message }); }
    }
    console.log(JSON.stringify({ mode: DRY ? "dry-run" : "real", insert, update, skip, errors: errs.length }));
    if (errs.length) console.log("ERRORS:", JSON.stringify(errs.slice(0, 10)));
    if (!DRY) {
      const [f] = await conn.query("SELECT COUNT(*) n FROM bunon_products");
      console.log("FINAL bunon_products count:", f[0].n);
    } else if (insert + update + skip === wc.length && errs.length === 0) {
      console.log("DRY-RUN CLEAN");
    } else console.log("DRY-RUN HAS ISSUES — real run blocked");
  } finally { await conn.end(); }
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
