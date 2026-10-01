import express from 'express';
import { productDbPool } from '../../db';

const router = express.Router();

const LOG_DDL =
  'CREATE TABLE IF NOT EXISTS bunon_inventory_logs (' +
  'id INT AUTO_INCREMENT PRIMARY KEY, product_id INT NOT NULL, ' +
  'old_qty INT NULL, new_qty INT NOT NULL, delta INT NULL, ' +
  'reason VARCHAR(255) NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ' +
  'INDEX (product_id))';

// Single source of truth: bunon_products (+ bunon_inventory_logs as the movements log).
// The legacy dash `stock` / `stock_movements` tables are NOT used here (split-brain fix).
const slugify = (s: string) =>
  s.toString().toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Best-effort: extra movement columns on the shared log table (older rows lack them).
const ensureLogCols = async () => {
  await productDbPool.execute(LOG_DDL);
  try {
    const [desc]: any = await productDbPool.execute('DESCRIBE bunon_inventory_logs');
    const cols = new Set((desc as any[]).map((d: any) => d.Field));
    if (!cols.has('move_type')) await productDbPool.execute('ALTER TABLE bunon_inventory_logs ADD COLUMN move_type VARCHAR(20) NULL');
    if (!cols.has('qty')) await productDbPool.execute('ALTER TABLE bunon_inventory_logs ADD COLUMN qty INT NULL');
    if (!cols.has('created_by')) await productDbPool.execute('ALTER TABLE bunon_inventory_logs ADD COLUMN created_by VARCHAR(100) NULL');
  } catch { /* best-effort */ }
};

const logMove = async (productId: number, oldQty: number, newQty: number, reason: string, moveType: string, qty: number, by: string) => {
  try {
    await productDbPool.execute(
      'INSERT INTO bunon_inventory_logs (product_id, old_qty, new_qty, delta, reason, move_type, qty, created_by) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [productId, oldQty, newQty, newQty - oldQty, reason, moveType, qty, by]
    );
  } catch {
    try {
      await productDbPool.execute(
        'INSERT INTO bunon_inventory_logs (product_id, old_qty, new_qty, delta, reason) ' +
        'VALUES (?, ?, ?, ?, ?)',
        [productId, oldQty, newQty, newQty - oldQty, reason]
      );
    } catch { /* log best-effort */ }
  }
};

// GET /api/admin/inventory/logs?product_id&page&limit — from bunon_inventory_logs
router.get('/logs', async (req, res) => {
  try {
    await productDbPool.execute(LOG_DDL);
    // DESCRIBE first: select only columns that actually exist
    const [desc]: any = await productDbPool.execute('DESCRIBE bunon_inventory_logs');
    const cols = new Set((desc as any[]).map((d: any) => d.Field));
    const want = ['id', 'product_id', 'old_qty', 'new_qty', 'delta', 'reason', 'created_at'];
    const sel = want.filter((c) => cols.has(c));
    if (!sel.length) return res.status(500).json({ ok: false, msg: 'Log table has no known columns' });
    const productId = req.query.product_id ? Number(req.query.product_id) : null;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const where = productId ? 'WHERE product_id = ?' : '';
    const params = productId ? [productId] : [];
    const [rows]: any = await productDbPool.execute(
      'SELECT ' + sel.join(', ') + ' FROM bunon_inventory_logs ' + where + ' ORDER BY id DESC LIMIT ' + limit + ' OFFSET ' + offset,
      params
    );
    const [cnt]: any = await productDbPool.execute(
      'SELECT COUNT(*) AS total FROM bunon_inventory_logs ' + where, params
    );
    res.json({ ok: true, logs: rows, total: (cnt as any[])[0]?.total || 0, page, limit });
  } catch (e: any) {
    console.error('[Admin Inventory] Logs error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/inventory/low — bunon_products qty<10 + last log entry
router.get('/low', async (_req, res) => {
  try {
    await productDbPool.execute(LOG_DDL);
    const [rows]: any = await productDbPool.execute(
      'SELECT p.id, p.name, p.sku, p.stock_quantity, p.stock_status,' +
      ' l.old_qty AS last_old_qty, l.new_qty AS last_new_qty, l.delta AS last_delta,' +
      ' l.reason AS last_reason, l.created_at AS last_log_at' +
      ' FROM bunon_products p' +
      ' LEFT JOIN bunon_inventory_logs l ON l.id = (' +
      '   SELECT MAX(id) FROM bunon_inventory_logs WHERE product_id = p.id' +
      ' )' +
      ' WHERE p.stock_quantity < 10 ORDER BY p.stock_quantity ASC LIMIT 100'
    );
    res.json({ ok: true, low_stock: rows, count: (rows as any[]).length });
  } catch (e: any) {
    console.error('[Admin Inventory] Low error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/inventory/grid — from bunon_products (aliased to the grid shape)
router.get('/grid', async (_req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      'SELECT id, name, sku, price AS sell_price, stock_quantity AS current_stock, ' +
      'stock_quantity AS opening_stock, updated_at FROM bunon_products ORDER BY name ASC'
    );
    res.json({ ok: true, items: rows });
  } catch (e: any) { console.error('[Admin Inventory] Grid error:', e.message); res.status(500).json({ ok: false, msg: 'Server error' }); }
});

// POST /api/admin/inventory/bulk_update {date, rows:[{id,today_qty,sale_qty,after_qty}]}
router.post('/bulk_update', async (req, res) => {
  try {
    await ensureLogCols();
    const rows = (req.body?.rows || []) as any[];
    const user = (req as any).user?.phone || 'system';
    if (!Array.isArray(rows) || !rows.length) return res.status(422).json({ ok: false, msg: 'No rows' });
    const conn = await productDbPool.getConnection();
    try {
      await conn.beginTransaction();
      for (const r of rows) {
        const id = parseInt(r.id, 10); if (!id) continue;
        const afterQty = parseInt(r.after_qty ?? r.today_qty, 10) || 0;
        const [ex]: any = await conn.execute('SELECT stock_quantity FROM bunon_products WHERE id=? LIMIT 1', [id]);
        if (!(ex as any[]).length) continue;
        const oldQty = Number((ex as any[])[0].stock_quantity || 0);
        await conn.execute("UPDATE bunon_products SET stock_quantity=?, stock_status = IF(? > 0, 'instock', 'outofstock'), updated_at=NOW() WHERE id=?", [afterQty, afterQty, id]);
      }
      await conn.commit();
    } catch (e) { await conn.rollback(); throw e; } finally { conn.release(); }
    for (const r of rows) {
      const id = parseInt(r.id, 10); if (!id) continue;
      const saleQty = parseInt(r.sale_qty, 10) || 0;
      const afterQty = parseInt(r.after_qty ?? r.today_qty, 10) || 0;
      const todayQty = parseInt(r.today_qty, 10);
      const oldQty = isNaN(todayQty) ? afterQty + saleQty : todayQty;
      if (afterQty !== oldQty || saleQty > 0) {
        await logMove(id, oldQty, afterQty, 'admin bulk update', 'out', saleQty, user);
      }
    }
    res.json({ ok: true, msg: 'Bulk stock updated successfully' });
  } catch (e: any) { console.error('[Admin Inventory] Bulk error:', e.message); res.status(500).json({ ok: false, msg: 'Server error' }); }
});

// POST /api/admin/inventory/move {sku, qty, type: in|out|return}
router.post('/move', async (req, res) => {
  try {
    await ensureLogCols();
    const sku = String(req.body?.sku || '').trim();
    const qty = parseInt(req.body?.qty, 10) || 0;
    const type = String(req.body?.type || 'in');
    const user = (req as any).user?.phone || 'system';
    if (!sku || qty <= 0) return res.status(422).json({ ok: false, msg: 'Invalid sku/qty' });
    const [rows]: any = await productDbPool.execute('SELECT id, stock_quantity FROM bunon_products WHERE sku=? LIMIT 1', [sku]);
    if (!(rows as any[]).length) return res.status(404).json({ ok: false, msg: 'SKU not found' });
    const p = (rows as any[])[0];
    const delta = type === 'out' ? -qty : qty;
    const next = Number(p.stock_quantity) + delta;
    if (next < 0) return res.status(422).json({ ok: false, msg: 'Insufficient stock' });
    await productDbPool.execute("UPDATE bunon_products SET stock_quantity=?, stock_status = IF(? > 0, 'instock', 'outofstock'), updated_at=NOW() WHERE id=?", [next, next, p.id]);
    await logMove(p.id, Number(p.stock_quantity), next, 'admin stock move (' + type + ')', type, qty, user);
    res.json({ ok: true, msg: 'Stock Updated', current_stock: next });
  } catch (e: any) { console.error('[Admin Inventory] Move error:', e.message); res.status(500).json({ ok: false, msg: 'Server error' }); }
});

// GET /api/admin/inventory/history — movements log joined to products (limit 300)
router.get('/history', async (_req, res) => {
  try {
    await ensureLogCols();
    const [desc]: any = await productDbPool.execute('DESCRIBE bunon_inventory_logs');
    const cols = new Set((desc as any[]).map((d: any) => d.Field));
    const mtSel = cols.has('move_type') ? 'm.move_type' : "CASE WHEN m.delta < 0 THEN 'out' ELSE 'in' END";
    const qtySel = cols.has('qty') ? 'm.qty' : 'ABS(m.delta)';
    const bySel = cols.has('created_by') ? 'm.created_by' : 'm.reason';
    const [rows]: any = await productDbPool.execute(
      'SELECT m.id, p.name, p.sku, ' + mtSel + ' AS move_type, ' + qtySel + ' AS qty, ' +
      bySel + ' AS created_by, m.created_at FROM bunon_inventory_logs m ' +
      'JOIN bunon_products p ON m.product_id=p.id ORDER BY m.created_at DESC, m.id DESC LIMIT 300'
    );
    res.json({ ok: true, history: rows });
  } catch (e: any) { console.error('[Admin Inventory] History error:', e.message); res.status(500).json({ ok: false, msg: 'Server error' }); }
});

// POST /api/admin/inventory/product {id?, name, sku, price, opening_stock} —
// creates/updates a bunon_products row (status publish => visible in storefront)
router.post('/product', async (req, res) => {
  try {
    await ensureLogCols();
    const { id, name, sku, price, opening_stock } = req.body || {};
    const user = (req as any).user?.phone || 'system';
    if (!String(name || '').trim() || !String(sku || '').trim()) return res.status(422).json({ ok: false, msg: 'Name + SKU required' });
    const opening = parseInt(opening_stock, 10) || 0;
    const pr = Number(price) || 0;
    if (id) {
      await productDbPool.execute(
        'UPDATE bunon_products SET name=?, sku=?, price=?, regular_price=?, stock_quantity=?, ' +
        "stock_status = IF(? > 0, 'instock', 'outofstock'), updated_at=NOW() WHERE id=?",
        [name, sku, pr, pr, opening, opening, Number(id)]
      );
      return res.json({ ok: true, msg: 'Updated' });
    }
    const autoSlug = slugify(name) + '-' + String(sku).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const [r]: any = await productDbPool.execute(
      'INSERT INTO bunon_products (name, slug, sku, price, regular_price, stock_status, stock_quantity, status) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, autoSlug, sku, pr, pr, opening > 0 ? 'instock' : 'outofstock', opening, 'publish']
    );
    const pid = (r as any).insertId;
    if (opening > 0) await logMove(pid, 0, opening, 'opening stock', 'in', opening, user);
    res.json({ ok: true, msg: 'Product Added', id: pid });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, msg: 'slug or sku already exists' });
    console.error('[Admin Inventory] Product error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/inventory/alerts?threshold=10 — low-stock alerts from bunon_products
router.get('/alerts', async (req, res) => {
  try {
    const th = Math.max(1, parseInt(req.query.threshold as string, 10) || 10);
    const [s2]: any = await productDbPool.execute('SELECT id, name, sku, stock_quantity AS qty, stock_status FROM bunon_products WHERE stock_quantity < ? ORDER BY stock_quantity ASC LIMIT 100', [th]);
    const alerts = (s2 as any[]).map((r: any) => ({ source: 'products', ...r }));
    res.json({ ok: true, threshold: th, count: alerts.length, alerts });
  } catch (e: any) { console.error('[Admin Inventory] Alerts error:', e.message); res.status(500).json({ ok: false, msg: 'Server error' }); }
});

export default router;
