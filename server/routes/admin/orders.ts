import express from 'express';
import { dbPool, productDbPool } from '../../db';
import { logAudit, auditCtx } from '../../utils/audit';
import { requirePermission } from '../../middleware/auth';
import { waAutoNotifyStatus } from './whatsapp';
import { bestImageFor, hydrateImageList, toAbsoluteImageUrl, parseMaybeJSON, PRODUCT_PLACEHOLDER } from '../../services/imageUrl';

// Normalize order-line-item image fields so the admin orders table and the
// detail drawer always receive absolute, local-first URLs. bf_order_items stores
// product_thumb/thumb as free text (sometimes a raw JSON column, sometimes a
// relative path, sometimes a dead WordPress hotlink).
function normalizeItemImages(items: any[]): any[] {
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const best = bestImageFor(it.images, it.image, it.img, it.product_thumb, it.thumb, it.thumbnail);
    const abs = best !== PRODUCT_PLACEHOLDER ? best : '';
    if (abs) {
      if (it.product_thumb) it.product_thumb = abs;
      if (it.thumb) it.thumb = abs;
      if (it.image) it.image = abs;
    }
    // Keep images as a clean absolute array when the column was JSON.
    const list = hydrateImageList(it.images);
    if (list.length) it.images = list;
  }
  return items;
}

// Catalog thumb lookup: fill sku/product_thumb/thumb for manually added items
async function catalogThumbs(keys: { id?: any; name?: any }[]): Promise<Record<string, any>> {
  const map: Record<string, any> = {};
  try {
    const ids = keys.map(k => k.id).filter(v => v !== null && v !== undefined && v !== '');
    const names = keys.map(k => k.name).filter(Boolean);
    let rows: any[] = [];
    if (ids.length) {
      const [r]: any = await productDbPool.execute(
        'SELECT wc_product_id, name, thumbnail, local_images FROM bunon_products WHERE wc_product_id IN (' + ids.map(() => '?').join(',') + ')', ids);
      rows = rows.concat(r as any[]);
    }
    if (names.length) {
      const [r]: any = await productDbPool.execute(
        'SELECT wc_product_id, name, thumbnail, local_images FROM bunon_products WHERE name IN (' + names.map(() => '?').join(',') + ')', names);
      rows = rows.concat(r as any[]);
    }
    for (const c of rows) {
      // Shared normalizer: parses the raw JSON column, absolutises relative
      // paths, and prefers a local /uploads file over a dead WP hotlink.
      const thumb = bestImageFor(c.local_images, c.thumbnail);
      if (c.wc_product_id !== null && c.wc_product_id !== undefined) map['id:' + String(c.wc_product_id)] = { thumb, name: c.name };
      map['name:' + String(c.name)] = { thumb, name: c.name };
    }
  } catch {}
  return map;
}
const pickThumb = (map: Record<string, any>, id: any, name: any): string =>
  (id !== null && id !== undefined && map['id:' + String(id)]?.thumb) || (name && map['name:' + String(name)]?.thumb) || '';

import { getSecret } from '../../utils/secrets';
import { requireAnyPermission } from '../../middleware/auth';

// DB-fresh OR-guard (no JWT-claim trust - fixes stale-perm hole).
const requireAny = (keys: string[]) => requireAnyPermission(keys);

const staffPerms = (req: express.Request): string[] => {
  const u: any = (req as any).user || {};
  return Array.isArray(u.permissions) ? u.permissions : [];
};
const isPrivileged = (req: express.Request): boolean => {
  const u: any = (req as any).user || {};
  return u.role === 'super_admin' || u.role === 'admin';
};

const router = express.Router();

// Canonical statuses (11 + All tab = 12 tabs; trash separate, never merged into cancelled)
const CANONICAL_STATUSES = [
  'pending', 'incomplete', 'confirmed', 'on_hold', 'ready',
  'in_transit', 'delivered', 'cancelled', 'partial_return', 'return', 'trash',
] as const;

// Merge legacy/alias status spellings into canonical keys
function canonicalStatus(s: string): string {
  const v = (s || '').toLowerCase().trim();
  if (v === 'on-hold' || v === 'onhold') return 'on_hold';
  if (v === 'partial_returned' || v === 'partial-return') return 'partial_return';
  if (v === 'returned' || v === 'returns') return 'return';
  if (v === 'cancel' || v === 'cancell') return 'cancelled';
  if (v === 'complete' || v === 'completed' || v === 'courier_complete') return 'delivered';
  if (v === 'ready_to_ship' || v === 'ready-to-ship' || v === 'ready to ship') return 'ready';
  if (v === 'trash' || v === 'trashed' || v === 'deleted') return 'trash';
  return v;
}

// All DB spellings that map to a canonical status (for IN-clause matching)
function statusVariants(canon: string): string[] {
  switch (canon) {
    case 'on_hold': return ['on_hold', 'on-hold', 'onhold'];
    case 'partial_return': return ['partial_return', 'partial_returned', 'partial-return'];
    case 'return': return ['return', 'returned', 'returns'];
    case 'cancelled': return ['cancelled', 'cancel', 'cancell'];
    case 'delivered': return ['delivered', 'complete', 'completed', 'courier_complete'];
    case 'ready': return ['ready', 'ready_to_ship', 'ready-to-ship'];
    case 'trash': return ['trash'];
    default: return [canon];
  }
}

// Real actor name for logs: bunon_users name/username, fallback JWT phone, then 'admin'.
async function actorName(req: any): Promise<string> {
  const u = (req as any).user || {};
  try {
    const [rows]: any = await productDbPool.execute(
      'SELECT name, username, phone FROM bunon_users WHERE id = ? LIMIT 1',
      [u.id]
    );
    if (rows?.length) return String(rows[0].name || rows[0].username || rows[0].phone || u.phone || 'admin');
  } catch {}
  return String(u.phone || u.id || 'admin');
}

async function writeLog(orderId: any, logType: string, message: string, createdBy: string = 'admin') {
  try {
    await dbPool.execute(
      `INSERT INTO bf_order_logs (order_id, log_type, message, created_by, created_at) VALUES (?, ?, ?, ?, NOW())`,
      [orderId, logType, message, createdBy]
    );
  } catch (e: any) {
    console.error('[Admin API] writeLog failed:', e.message);
  }
}

// Shared Steadfast booking helper (used by single + bulk endpoints)
async function bookSteadfast(order: any): Promise<{ ok: boolean; consignment?: any; msg?: string }> {
  const apiKey = (await getSecret('steadfast_api_key')) || process.env.STEADFAST_API_KEY;
  const secretKey = (await getSecret('steadfast_secret_key')) || process.env.STEADFAST_SECRET_KEY;
  if (!apiKey || !secretKey) return { ok: false, msg: 'Steadfast API keys are missing (bunon_settings/.env)' };
  const payload = {
    invoice: order.invoice,
    recipient_name: order.customer_name,
    recipient_phone: order.phone,
    recipient_address: `${order.address}, ${order.city}`,
    cod_amount: Number(order.total_payable),
    note: 'Bunon Auto Booking',
  };
  const response = await fetch('https://portal.packzy.com/api/v1/create_order', {
    method: 'POST',
    headers: { 'Api-Key': apiKey, 'Secret-Key': secretKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const result: any = await response.json();
  if (result.status === 200 && result.consignment) {
    return { ok: true, consignment: result.consignment };
  }
  console.error('[Steadfast API Error]', result);
  return { ok: false, msg: result.message || 'Steadfast booking failed' };
}

// GET /api/admin/orders (List with filters and status counts)
router.get('/', async (req, res) => {
  try {
    // Recycle bin: ?status=trash needs view_trash (legacy view_orders fallback)
    if (String(req.query.status || '').toLowerCase() === 'trash' && !isPrivileged(req)) {
      const p = staffPerms(req);
      if (!p.includes('view_trash') && !p.includes('view_orders'))
        return res.status(403).json({ ok: false, msg: 'Access denied. Requires view_trash.' });
    }
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const rawLimit = parseInt(req.query.limit as string) || 50;
    const limit = Math.min(100, Math.max(1, rawLimit)); // default 50, cap 100
    const offset = (page - 1) * limit;

    const status = req.query.status as string;
    const courier = req.query.courier as string;
    const search = req.query.search as string;
    const from = req.query.from as string; // YYYY-MM-DD
    const to = req.query.to as string;     // YYYY-MM-DD

    const whereClauses: string[] = [];
    const params: string[] = [];

    if (status && status !== 'all' && status !== '') {
      const canon = canonicalStatus(status);
      const variants = statusVariants(canon);
      whereClauses.push(`status IN (${variants.map(() => '?').join(', ')})`);
      params.push(...variants);
    } else {
      // Default (All tab): hide trash; trash visible only via ?status=trash
      whereClauses.push(`status NOT IN ('trash')`);
    }
    if (courier && courier !== 'all' && courier !== '') {
      // courier values: steadfast / pathao / redx / manual
      if (courier === 'steadfast') {
        whereClauses.push('(LOWER(courier_code) = LOWER(?) OR consignment_id IS NOT NULL)');
        params.push('steadfast');
      } else if (courier === 'pathao' || courier === 'redx') {
        whereClauses.push('LOWER(courier_code) = LOWER(?)');
        params.push(courier);
      } else if (courier === 'manual') {
        whereClauses.push('(courier_code IS NULL AND consignment_id IS NULL)');
      } else {
        whereClauses.push('consignment_id IS NULL');
      }
    }
    if (search && search !== '') {
      const q = search.trim();
      if (/^\d+$/.test(q)) {
        whereClauses.push('(invoice LIKE ? OR phone LIKE ? OR customer_name LIKE ? OR id = ? OR woo_order_id = ?)');
        params.push('%' + q + '%', '%' + q + '%', '%' + q + '%', q, q);
      } else {
        whereClauses.push('(invoice LIKE ? OR phone LIKE ? OR customer_name LIKE ?)');
        params.push('%' + q + '%', '%' + q + '%', '%' + q + '%');
      }
    }
    if (from && from !== '') {
      whereClauses.push('created_at >= ?');
      params.push(`${from} 00:00:00`);
    }
    if (to && to !== '') {
      whereClauses.push('created_at <= ?');
      params.push(`${to} 23:59:59`);
    }

    const whereString = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';

    const [orders]: any = await dbPool.execute(
      `SELECT id, woo_order_id, invoice, created_at, updated_at, status, total_payable, subtotal,
              delivery_fee, discount, discount_amount, payment_status, is_paid,
              customer_name, phone, city, address, consignment_id, tracking_code,
              courier_code, courier_name, notes, internal_note, source
       FROM bf_orders
       ${whereString}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit.toString(), offset.toString()]
    );

    const [countResult]: any = await dbPool.execute(`SELECT COUNT(id) as total FROM bf_orders ${whereString}`, params);
    const total = countResult[0].total;

    // Fetch Status Counts for the tabs (All + 11 canonical, trash separate)
    const [rawCounts]: any = await dbPool.execute(`
      SELECT status, COUNT(id) as count
      FROM bf_orders
      GROUP BY status
    `);
    const statusCounts: Record<string, number> = {};
    for (const s of CANONICAL_STATUSES) statusCounts[s] = 0;
    for (const row of rawCounts) {
      const key = canonicalStatus(row.status);
      statusCounts[key] = (statusCounts[key] || 0) + Number(row.count);
    }

    res.json({
      ok: true,
      orders,
      statusCounts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        totalPages: Math.ceil(total / limit)
      }
    });

  } catch (error: any) {
    console.error('[Admin API] Orders Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching orders' });
  }
});

// POST /api/admin/orders/manual (Manual cart order)
router.post('/manual', requireAny(['create_orders', 'edit_orders']), async (req, res) => {
  try {
    const { customer_name, phone, address, city, items, delivery_fee, discount, note, source } = req.body;
    if (!customer_name || !phone || !address) {
      return res.status(400).json({ ok: false, msg: 'customer_name, phone, address are required' });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, msg: 'items array is required' });
    }
    const fee = Number(delivery_fee) || 0;
    const disc = Number(discount) || 0;
    let subtotal = 0;
    const lines = items.map((it: any) => {
      const qty = Number(it.qty) || 1;
      const price = Number(it.price) || 0;
      const lineTotal = qty * price;
      subtotal += lineTotal;
      return { product_id: it.product_id || null, product_name: it.product_name || null, qty, price, line_total: lineTotal };
    });
    const totalPayable = subtotal + fee - disc;

    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const invoice = `INV-${pad(d.getDate())}${pad(d.getMonth() + 1)}${String(d.getFullYear()).slice(2)}-${Math.floor(1000 + Math.random() * 9000)}`;

    const [orderResult]: any = await dbPool.execute(
      `INSERT INTO bf_orders (invoice, customer_name, phone, address, city, subtotal, delivery_fee, discount, total_payable,
        status, source, notes, payment_status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, 'unpaid', NOW(), NOW())`,
      [invoice, customer_name, phone, address, city || null, subtotal, fee, disc, totalPayable,
        source || 'manual', note || null]
    );
    const orderId = (orderResult as any).insertId;

    const catMap = await catalogThumbs(lines.map((ln: any) => ({ id: ln.product_id, name: ln.product_name })));
    for (const ln of lines) {
      const th = pickThumb(catMap, ln.product_id, ln.product_name);
      await dbPool.execute(
        `INSERT INTO bf_order_items (order_id, product_id, product_name, qty, price, line_total, subtotal, product_thumb, thumb)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderId, ln.product_id, ln.product_name, ln.qty, ln.price, ln.line_total, ln.line_total, th || null, th || null]
      );
    }
    await writeLog(orderId, 'created', `Manual order created (${invoice})`, await actorName(req));

    res.json({ ok: true, msg: 'Manual order created', invoice, order_id: orderId, total_payable: totalPayable });
  } catch (error: any) {
    console.error('[Admin API] Manual Order Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error creating manual order' });
  }
});

// POST /api/admin/orders/bulk-courier (Bulk Steadfast booking)
router.post('/bulk-courier', requireAny(['sync_courier_status', 'bulk_orders', 'book_courier']), async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, msg: 'ids array is required' });
    }
    const results: any[] = [];
    for (const id of ids) {
      try {
        const [orders]: any = await dbPool.execute(
          `SELECT invoice, customer_name, phone, address, city, total_payable, consignment_id FROM bf_orders WHERE id = ? LIMIT 1`,
          [id]
        );
        if (orders.length === 0) { results.push({ id, ok: false, msg: 'Order not found' }); continue; }
        const order = orders[0];
        if (order.consignment_id) { results.push({ id, ok: false, msg: 'Already booked' }); continue; }
        const booked = await bookSteadfast(order);
        if (booked.ok && booked.consignment) {
          await dbPool.execute(
            `UPDATE bf_orders SET consignment_id = ?, tracking_code = ?, courier_code = 'steadfast', status = 'in_transit' WHERE id = ?`,
            [booked.consignment.consignment_id, booked.consignment.tracking_code, id]
          );
          await writeLog(id, 'courier_booked', `Bulk booked with Steadfast: ${booked.consignment.consignment_id}`, await actorName(req));
          results.push({ id, ok: true, consignment: booked.consignment });
        } else {
          results.push({ id, ok: false, msg: booked.msg });
        }
      } catch (e: any) {
        results.push({ id, ok: false, msg: e.message });
      }
    }
    res.json({ ok: true, results });
  } catch (error: any) {
    console.error('[Admin API] Bulk Courier Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error in bulk booking' });
  }
});

// POST /api/admin/orders/bulk-status {ids:number[], status}
router.post('/bulk-status', requireAny(['bulk_orders', 'edit_orders']), async (req, res) => {
  try {
    const { ids, status } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ ok: false, msg: 'ids array is required' });
    }
    if (!status || typeof status !== 'string') {
      return res.status(400).json({ ok: false, msg: 'status is required' });
    }
    const canon = canonicalStatus(status);
    if (!(CANONICAL_STATUSES as readonly string[]).includes(canon)) {
      return res.status(400).json({ ok: false, msg: `Invalid status: ${status}` });
    }
    const cleanIds = [...new Set(ids.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
    if (cleanIds.length === 0) {
      return res.status(400).json({ ok: false, msg: 'No valid order ids' });
    }
    let updated = 0;
    for (const id of cleanIds) {
      const [r]: any = await dbPool.execute(
        'UPDATE bf_orders SET status = ?, updated_at = NOW() WHERE id = ?',
        [canon, id]
      );
      const affected = (r as any).affectedRows ?? 0;
      if (affected > 0) {
        updated++;
        await writeLog(id, 'bulk_status', `Bulk status set to ${canon}`, await actorName(req));
        try { waAutoNotifyStatus(Number(id), String(canon)).catch(() => {}); } catch { /* fail-open */ }
      }
    }
    res.json({ ok: true, updated, skipped: cleanIds.length - updated });
  } catch (error: any) {
    console.error('[Admin API] Bulk Status Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error in bulk status update' });
  }
});

// GET /api/admin/orders/print?id=&ids= — native 75x90mm thermal invoice HTML (auto-print), behind edit_orders
router.get('/print', requireAny(['view_orders', 'edit_orders']), async (req, res) => {
  try {
    const ids: number[] = [];
    const qid = Number((req.query as any).id);
    if (Number.isInteger(qid) && qid > 0) ids.push(qid);
    const qids = String((req.query as any).ids || '');
    for (const part of qids.split(',')) {
      const n = Number(part.trim());
      if (Number.isInteger(n) && n > 0) ids.push(n);
    }
    const clean = [...new Set(ids)];
    if (clean.length === 0) return res.status(400).send('No valid order ID(s).');
    const esc = (v: any): string => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const num = (v: any): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
    const tk = (v: any): string => '\u09F3' + num(v).toLocaleString('en-US', { maximumFractionDigits: 0 });
    const ph = clean.map(() => '?').join(',');
    const [orderRows]: any = await dbPool.execute(`SELECT * FROM bf_orders WHERE id IN (${ph}) ORDER BY id ASC`, clean);
    if (!orderRows || orderRows.length === 0) return res.status(404).send('No matching orders.');
    const foundIds: number[] = orderRows.map((o: any) => Number(o.id));
    const ph2 = foundIds.map(() => '?').join(',');
    let itemRows: any[] = [];
    try {
      const [ir]: any = await dbPool.execute(`SELECT id, order_id, product_name, sku, qty, price, line_total FROM bf_order_items WHERE order_id IN (${ph2}) ORDER BY order_id ASC, id ASC`, foundIds);
      itemRows = ir || [];
    } catch (e: any) { console.error('[Admin API] Print items query failed:', e.message); }
    const itemsByOrder: Record<number, any[]> = {};
    for (const r of itemRows) { const oid = Number(r.order_id); (itemsByOrder[oid] = itemsByOrder[oid] || []).push(r); }
    let helpline = process.env.SHOP_PHONE || '09611900606';
    try {
      const [sr]: any = await productDbPool.execute(`SELECT setting_value FROM bunon_settings WHERE setting_key = 'contact_phone' LIMIT 1`);
      const v = sr && sr[0] && String(sr[0].setting_value || '').trim();
      if (v) helpline = v;
    } catch { /* bunon_settings may not exist in shop db — keep default */ }
    const pages = orderRows.map((o: any) => {
      const oid = Number(o.id);
      const items = itemsByOrder[oid] || [];
      const createdDate = String(o.created_at || '').split(' ')[0] || new Date().toISOString().slice(0, 10);
      const courierName = o.courier_name || o.courier_code || '';
      const tracking = o.courier_tracking_code || o.courier_tracking || o.tracking_code || o.consignment_id || o.courier_consignment_id || '';
      const phoneRaw = String(o.phone || '').trim();
      const qrUrl = 'https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + encodeURIComponent(phoneRaw || 'N/A');
      let subtotal = num(o.subtotal);
      if (!(subtotal > 0) && items.length) subtotal = items.reduce((a: number, it: any) => a + num(it.line_total), 0);
      const deliveryFee = num(o.delivery_fee);
      const discount = num((o as any).discount_amount ?? o.discount);
      let grand = num((o as any).total_payable);
      if (!(grand > 0)) grand = subtotal + deliveryFee - discount;
      const custName = o.customer_name || 'Guest';
      const custPhone = o.phone || '-';
      const custAddr = o.address || 'Address not provided';
      const itemLines = items.length ? items.map((it: any, i: number) =>
        `<tr><td>${i + 1}</td><td>${esc(it.product_name || '-')}<br><span style="color:#9ca3af;font-size:6.3px;">SKU: ${esc(it.sku || '-')}</span></td>` +
        `<td class="qty">${Math.round(num(it.qty))}</td><td class="price">${tk(it.price)}</td><td class="total">${tk(it.line_total)}</td></tr>`
      ).join('') : `<tr><td colspan="5" style="text-align:center;color:#9ca3af;font-size:6.5px;">No items</td></tr>`;
      return `<div class="invoice-page"><div class="invoice-frame"><div>` +
        `<div class="inv-head"><div><div class="brand-title">\u09AC\u09C1\u09A8\u09A8 \u09AB\u09CD\u09AF\u09BE\u09AC\u09CD\u09B0\u09BF\u0995\u09CD\u09B8</div>` +
        `<div class="brand-sub">Half Silk Saree \u2022 Jamdani \u2022 Blouse Sets<br>Help Line: ${esc(helpline)}</div></div>` +
        `<div class="qr-wrap"><div class="qr-box"><img src="${esc(qrUrl)}" alt="QR"></div>` +
        `<div class="qr-caption">${phoneRaw ? '\uD83D\uDCDE ' + esc(phoneRaw) : 'No phone'}</div>` +
        `<div class="inv-meta">Inv: <strong>${esc(o.invoice || '-')}</strong><br>Date: ${esc(createdDate)}<br>` +
        `${courierName ? 'Cur: ' + esc(courierName) + '<br>' : ''}${tracking ? 'Trk: ' + esc(tracking) : ''}</div></div></div>` +
        `<div class="section-title">Customer</div><div class="customer"><strong>${esc(custName)}</strong><br>\uD83D\uDCDE ${esc(custPhone)}<br>${esc(custAddr).replace(/\n/g, '<br>')}</div>` +
        `<table class="items"><thead><tr><th style="width:7%;">#</th><th>Product</th><th class="qty" style="width:12%;">Qty</th><th class="price" style="width:20%;">Price</th><th class="total" style="width:23%;">Total</th></tr></thead><tbody>${itemLines}</tbody></table>` +
        `</div><div><div class="totals">` +
        `<div class="totals-row"><div class="label">Sub Total</div><div class="value">${tk(subtotal)}</div></div>` +
        `<div class="totals-row"><div class="label">Delivery Fee</div><div class="value">${tk(deliveryFee)}</div></div>` +
        `<div class="totals-row"><div class="label">Discount</div><div class="value">-${tk(discount)}</div></div>` +
        `<div class="totals-row total"><div class="label">Due Amount</div><div class="value">${tk(grand)}</div></div>` +
        `</div><div class="foot">\u09A7\u09A8\u09CD\u09AF\u09AC\u09BE\u09A6 <strong>Bunon Fabrics</strong> \u09A5\u09C7\u0995\u09C7 \u0985\u09B0\u09CD\u09A1\u09BE\u09B0 \u0995\u09B0\u09BE\u09B0 \u099C\u09A8\u09CD\u09AF \uD83D\uDC95 \u09AB\u09C7\u09B0\u09A4 / \u09B8\u09AE\u09B8\u09CD\u09AF\u09BE\u09B0 \u0995\u09CD\u09B7\u09C7\u09A4\u09CD\u09B0\u09C7 \u09AA\u09CD\u09AF\u09BE\u0995\u09C7\u099F\u09C7\u09B0 \u0989\u09AA\u09B0 \u098F\u0987 \u09B8\u09CD\u099F\u09BF\u0995\u09BE\u09B0\u099F\u09BF \u09B0\u09BE\u0996\u09AC\u09C7\u09A8\u0964</div>` +
        `</div></div></div>`;
    }).join('\n');
    const css = `*{box-sizing:border-box}@page{size:75mm 90mm;margin:0}body{margin:0;padding:0;background:#e5e7eb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Hind Siliguri",system-ui,sans-serif;color:#111827;font-weight:500}` +
      `.print-wrapper{width:75mm;margin:0 auto}.invoice-page{width:75mm;height:90mm;padding:3mm;page-break-after:always;break-after:page}.invoice-page:last-child{page-break-after:auto;break-after:auto}` +
      `.invoice-frame{width:100%;height:100%;border-radius:2px;border:1px solid #111827;padding:3mm 3.5mm;display:flex;flex-direction:column;justify-content:space-between;background:#fff}` +
      `@media screen{body{background:#e5e7eb}.print-wrapper{margin-top:6mm}.invoice-page{margin-bottom:8mm;box-shadow:0 0 10px rgba(15,23,42,.25)}}` +
      `@media print{html,body{width:75mm;height:90mm;margin:0!important;padding:0!important;background:#fff!important}.print-wrapper{width:75mm;margin:0!important;padding:0!important}.invoice-page{margin:0!important;box-shadow:none!important}*{ -webkit-print-color-adjust:exact;print-color-adjust:exact}}` +
      `.inv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:4px;border-bottom:1px solid #d1d5db;padding-bottom:2px;margin-bottom:2px}` +
      `.brand-title{font-size:11px;font-weight:800;color:#000}.brand-sub{font-size:7.5px;color:#4b5563;line-height:1.25;font-weight:600}` +
      `.qr-wrap{text-align:right}.qr-box{display:inline-block;padding:1px;border:1px solid #d1d5db;border-radius:2px;background:#f9fafb}.qr-box img{width:32px;height:32px;display:block}.qr-caption{font-size:6.5px;color:#374151;margin-top:1px;font-weight:600}` +
      `.inv-meta{text-align:right;font-size:7px;color:#4b5563;margin-top:1px;line-height:1.2;font-weight:600}` +
      `.section-title{font-size:7px;font-weight:700;text-transform:uppercase;color:#6b7280;margin:2px 0 1px 0;border-bottom:1px solid #e5e7eb;padding-bottom:1px}` +
      `.customer{font-size:7px;color:#111827;line-height:1.25}.customer strong{font-size:8px;font-weight:700}` +
      `table.items{width:100%;border-collapse:collapse;margin-top:2px;font-size:7px}table.items th,table.items td{padding:2px 1px;border-bottom:1px dashed #d1d5db}table.items th{font-size:7px;text-transform:uppercase;letter-spacing:.04em;color:#374151;font-weight:700}table.items th.qty,table.items th.price,table.items th.total{text-align:right}table.items td.qty,table.items td.price,table.items td.total{text-align:right;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:600}table.items tr:last-child td{border-bottom:none}` +
      `.totals{margin-top:3px;font-size:7px;border-top:1px solid #d1d5db;padding-top:2px}.totals-row{display:flex;justify-content:space-between;margin-top:1px}.totals-row .label{color:#4b5563;font-weight:600}.totals-row .value{min-width:60px;text-align:right;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:700}.totals-row.total{border-top:1px solid #111827;padding-top:2px;margin-top:3px}` +
      `.foot{margin-top:3px;font-size:6.5px;text-align:center;color:#6b7280;line-height:1.3;border-top:1px dashed #e5e7eb;padding-top:2px;font-weight:600}.foot strong{color:#111827;font-weight:800}`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!DOCTYPE html><html lang="bn"><head><meta charset="utf-8"><title>Bunon Fabrics - Invoice</title><style>${css}</style><script>window.onload=function(){window.print();};</script></head><body><div class="print-wrapper">${pages}</div></body></html>`);
  } catch (error: any) {
    console.error('[Admin API] Print Error:', error.message);
    res.status(500).send('Server error rendering invoice');
  }
});

// GET /api/admin/orders/export?status=&from=&to= (CSV: invoice,customer,phone,amount,status,courier)
router.get('/export', requireAny(['view_orders', 'edit_orders']), async (req, res) => {
  try {
    const status = String((req.query as any).status || 'all');
    const from = String((req.query as any).from || '');
    const to = String((req.query as any).to || '');
    const whereClauses: string[] = [];
    const params: any[] = [];
    if (status && status !== 'all' && status !== '') {
      const canon = canonicalStatus(status);
      const variants = statusVariants(canon);
      whereClauses.push('status IN (' + variants.map(() => '?').join(', ') + ')');
      params.push(...variants);
    } else {
      whereClauses.push("status NOT IN ('trash')");
    }
    if (from) { whereClauses.push('created_at >= ?'); params.push(from + ' 00:00:00'); }
    if (to) { whereClauses.push('created_at <= ?'); params.push(to + ' 23:59:59'); }
    const whereString = whereClauses.length ? 'WHERE ' + whereClauses.join(' AND ') : '';
    const [rows]: any = await dbPool.execute(
      'SELECT invoice, customer_name, phone, total_payable, status, courier_code, consignment_id FROM bf_orders ' + whereString + ' ORDER BY created_at DESC LIMIT 5000',
      params
    );
    const esc = (v: any): string => {
      const t = String(v ?? '');
      return /[\",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    };
    const lines = ['invoice,customer,phone,amount,status,courier'];
    for (const r of rows || []) {
      const courier = r.courier_code || r.consignment_id || '';
      lines.push([esc(r.invoice), esc(r.customer_name), esc(r.phone), esc(r.total_payable), esc(r.status), esc(courier)].join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="orders-export.csv"');
    res.send('\ufeff' + lines.join('\n'));
  } catch (error: any) {
    console.error('[Admin API] Export Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error exporting orders' });
  }
});
// GET /api/admin/orders/:id (Details for Order Journey)

// GET /api/admin/orders/check?phone=&invoice= — duplicate-order check (dash parity).
// Finds same-phone orders from last 7 days. Additive; never mutates.
router.get('/check', requireAny(['view_orders', 'edit_orders']), async (req, res) => {
  try {
    const raw = String((req.query as any).phone || '');
    const digits = raw.replace(/\D/g, '');
    if (!digits || digits.length < 6) {
      res.status(400).json({ ok: false, msg: 'phone parameter is required' });
      return;
    }
    const suffix = digits.slice(-10);
    const invoice = String((req.query as any).invoice || '').trim();
    const params: any[] = [suffix];
    let invClause = '';
    if (invoice) { invClause = 'AND invoice != ?'; params.push(invoice); }
    const [rows]: any = await dbPool.execute(
      'SELECT id, invoice, customer_name, phone, status, total_payable, created_at FROM bf_orders ' +
      "WHERE created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND RIGHT(REPLACE(REPLACE(REPLACE(REPLACE(phone, ' ', ''), '-', ''), '+', ''), '.', ''), 10) = ? " + invClause +
      ' ORDER BY created_at DESC LIMIT 20',
      params
    );
    res.json({ ok: true, phone: digits, count: (rows as any[]).length, orders: rows });
  } catch (e: any) {
    console.error('[Admin Orders] Check error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Order info
    const [orders]: any = await dbPool.execute(
      `SELECT * FROM bf_orders WHERE id = ? LIMIT 1`,
      [id]
    );

    if (orders.length === 0) {
      return res.status(404).json({ ok: false, msg: 'Order not found' });
    }

    const order = orders[0];

    // Order Items
    const [items]: any = await dbPool.execute(
      `SELECT * FROM bf_order_items WHERE order_id = ?`,
      [order.id || id] // Try fallback if id mismatch
    );

    // Order Logs (If exists, else empty array)
    let logs = [];
    try {
      const [orderLogs]: any = await dbPool.execute(`SELECT * FROM bf_order_logs WHERE order_id = ? ORDER BY created_at DESC`, [id]);
      logs = orderLogs;
    } catch (e) {
      // Table might not exist yet
    }

    res.json({
      ok: true,
      order,
      items: normalizeItemImages(items),
      logs
    });

  } catch (error: any) {
    console.error('[Admin API] Order Details Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching order details' });
  }
});

// GET /api/admin/orders/:id/invoice (Full order + items + shop header for print)
router.get('/:id/invoice', async (req, res) => {
  try {
    const { id } = req.params;
    const [orders]: any = await dbPool.execute(`SELECT * FROM bf_orders WHERE id = ? LIMIT 1`, [id]);
    if (orders.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
    const [items]: any = await dbPool.execute(`SELECT * FROM bf_order_items WHERE order_id = ?`, [orders[0].id || id]);
    const shop = {
      name: 'Bunon Fabrics',
      website: 'bunon.shop',
      phone: process.env.SHOP_PHONE || '',
      address: process.env.SHOP_ADDRESS || '',
    };
    res.json({ ok: true, shop, order: orders[0], items: normalizeItemImages(items) });
  } catch (error: any) {
    console.error('[Admin API] Invoice Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching invoice' });
  }
});

// GET /api/admin/orders/:id/journey (DB logs + live Steadfast tracking timeline)
router.get('/:id/journey', requireAny(['view_courier_tracking', 'view_orders']), async (req, res) => {
  try {
    const { id } = req.params;
    const [orders]: any = await dbPool.execute(
      `SELECT id, invoice, consignment_id, tracking_code, status FROM bf_orders WHERE id = ? LIMIT 1`,
      [id]
    );
    if (orders.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
    const order = orders[0];

    let logs: any[] = [];
    try {
      const [rows]: any = await dbPool.execute(
        `SELECT id, log_type, message, created_by, created_at FROM bf_order_logs WHERE order_id = ? ORDER BY created_at ASC`,
        [id]
      );
      logs = rows;
    } catch (e) {
      // logs table missing -> journey stays empty
    }
    const journey: any[] = logs.map((l: any) => ({
      at: l.created_at,
      source: 'system',
      type: l.log_type,
      message: l.message,
      by: l.created_by,
    }));

    // Live Steadfast pull when a consignment exists; fail -> logs only
    if (order.consignment_id) {
      try {
        const apiKey = process.env.STEADFAST_API_KEY;
        const secretKey = process.env.STEADFAST_SECRET_KEY;
        if (apiKey && secretKey) {
          const resp = await fetch(`https://portal.packzy.com/api/v1/status_by_cid/${order.consignment_id}`, {
            headers: { 'Api-Key': apiKey, 'Secret-Key': secretKey, 'Content-Type': 'application/json' },
          });
          const data: any = await resp.json();
          const statusInfo = data?.delivery_status || data?.consignment || data;
          journey.push({
            at: new Date().toISOString(),
            source: 'steadfast',
            type: 'courier_status',
            message: typeof statusInfo === 'string' ? statusInfo : JSON.stringify(statusInfo),
          });
        }
      } catch (e: any) {
        console.error('[Admin API] Journey Steadfast pull failed:', e.message);
      }
    }

    res.json({ ok: true, journey });
  } catch (error: any) {
    console.error('[Admin API] Journey Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching journey' });
  }
});

// PUT /api/admin/orders/:id/items (Replace items + recalc total)
router.put('/:id/items', requireAny(['edit_orders']), async (req, res) => {
  try {
    const { id } = req.params;
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, msg: 'items array is required' });
    }
    const [orders]: any = await dbPool.execute(`SELECT id, delivery_fee, discount FROM bf_orders WHERE id = ? LIMIT 1`, [id]);
    if (orders.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
    const order = orders[0];
    const fee = Number(order.delivery_fee) || 0;
    const disc = Number(order.discount ?? order.discount_amount) || 0;

    await dbPool.execute(`DELETE FROM bf_order_items WHERE order_id = ?`, [order.id || id]);
    const putCatMap = await catalogThumbs((items as any[]).map((x: any) => ({ id: x.product_id, name: x.product_name })));
    let subtotal = 0;
    for (const it of items) {
      const qty = Number(it.qty) || 1;
      const price = Number(it.price) || 0;
      const lineTotal = qty * price;
      subtotal += lineTotal;
      const th2 = pickThumb(putCatMap, it.product_id, it.product_name);
      await dbPool.execute(
        `INSERT INTO bf_order_items (order_id, product_id, product_name, qty, price, line_total, subtotal, product_thumb, thumb)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [order.id || id, it.product_id || null, it.product_name || null, qty, price, lineTotal, lineTotal, th2 || null, th2 || null]
      );
    }
    const totalPayable = subtotal + fee - disc;
    await dbPool.execute(
      `UPDATE bf_orders SET subtotal = ?, total_payable = ?, updated_at = NOW() WHERE id = ?`,
      [subtotal, totalPayable, id]
    );
    await writeLog(id, 'items_updated', `Order items replaced (${items.length} lines, total ${totalPayable})`, await actorName(req));
    res.json({ ok: true, msg: 'Order items updated', subtotal, total_payable: totalPayable });
  } catch (error: any) {
    console.error('[Admin API] Update Items Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error updating items' });
  }
});

// GET /api/admin/orders/returns/analytics (counts + amounts by reason/day)
router.get('/returns/analytics', requireAny(['view_orders', 'edit_orders']), async (req, res) => {
  try {
    const from = String((req.query as any).from || '1970-01-01');
    const to = String((req.query as any).to || '2999-12-31');
    let hasRefundCol = false;
    try {
      const [cols]: any = await dbPool.execute(
        `SELECT COUNT(*) AS n FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bunon_returns' AND COLUMN_NAME = 'refund_amount'`
      );
      hasRefundCol = Number(cols?.[0]?.n) > 0;
    } catch (e: any) { hasRefundCol = false; }
    const amtExpr = hasRefundCol ? 'COALESCE(SUM(refund_amount),0)' : '0';
    const [byReason]: any = await dbPool.execute(
      `SELECT COALESCE(NULLIF(reason,''),'(কারণ নেই)') AS reason, status, COUNT(*) AS n, ${amtExpr} AS amount
       FROM bunon_returns WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY reason, status ORDER BY n DESC`,
      [from, to]
    );
    const [byDay]: any = await dbPool.execute(
      `SELECT DATE(created_at) AS d, status, COUNT(*) AS n, ${amtExpr} AS amount
       FROM bunon_returns WHERE DATE(created_at) BETWEEN ? AND ? GROUP BY DATE(created_at), status ORDER BY d ASC`,
      [from, to]
    );
    const [totals]: any = await dbPool.execute(
      `SELECT COUNT(*) AS total_returns,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS partial,
        SUM(CASE WHEN status = 'full' THEN 1 ELSE 0 END) AS full,
        ${amtExpr} AS refund_amount
       FROM bunon_returns WHERE DATE(created_at) BETWEEN ? AND ?`,
      [from, to]
    );
    res.json({ ok: true, totals: totals[0] || {}, byReason, byDay });
  } catch (error: any) {
    console.error('[Admin API] Returns Analytics Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error loading return analytics' });
  }
});

// GET /api/admin/orders/returns/list (return records + order info)
router.get('/returns/list', requireAny(['view_orders', 'edit_orders']), async (req, res) => {
  try {
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const off = (page - 1) * limit;
    await dbPool.execute(
      `CREATE TABLE IF NOT EXISTS bunon_returns (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id INT UNSIGNED NOT NULL,
        items JSON NOT NULL,
        reason TEXT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order (order_id)
      )`
    );
    const [rows]: any = await dbPool.execute(
      `SELECT r.*, o.invoice, o.customer_name, o.phone, o.total_payable, o.status AS order_status
       FROM bunon_returns r LEFT JOIN bf_orders o ON o.id = r.order_id
       ORDER BY r.id DESC LIMIT ? OFFSET ?`,
      [String(limit), String(off)]
    );
    const [cnt]: any = await dbPool.execute(`SELECT COUNT(*) AS total FROM bunon_returns`);
    res.json({ ok: true, returns: rows, pagination: { page, limit, total: Number(cnt[0]?.total) || 0 } });
  } catch (error: any) {
    console.error('[Admin API] Returns List Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error loading returns' });
  }
});

// POST /api/admin/orders/:id/partial-return {items:[{order_item_id?,product_id?,qty,price?}], qty?, reason?, restock?}
router.post('/:id/partial-return', requireAny(['edit_orders', 'update_order_status']), async (req, res) => {
  try {
    const { id } = req.params;
    const { items, reason, restock } = req.body;
    const qtyTop = Number((req.body as any)?.qty) || 0;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ ok: false, msg: 'items [{order_item_id?, product_id?, qty}] required' });
    }
    const [orders]: any = await dbPool.execute(`SELECT id FROM bf_orders WHERE id = ? LIMIT 1`, [id]);
    if (orders.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });

    await dbPool.execute(
      `CREATE TABLE IF NOT EXISTS bunon_returns (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        order_id INT UNSIGNED NOT NULL,
        items JSON NOT NULL,
        reason TEXT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_order (order_id)
      )`
    );
    for (const ddl of [
      `ALTER TABLE bunon_returns ADD COLUMN refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE bunon_returns ADD COLUMN restocked TINYINT(1) NOT NULL DEFAULT 0`,
    ]) {
      try { await dbPool.execute(ddl); } catch (e: any) { /* column already exists */ }
    }
    let refund = 0;
    const lines: any[] = [];
    for (const it of items) {
      const q = Number(it?.qty ?? qtyTop) || 0;
      if (q <= 0) continue;
      let pid: any = it?.product_id ?? null;
      let price = Number(it?.price) || 0;
      if (it?.order_item_id) {
        const [orows]: any = await dbPool.execute(
          `SELECT product_id, price FROM bf_order_items WHERE id = ? AND order_id = ? LIMIT 1`,
          [it.order_item_id, id]
        );
        if (orows.length > 0) {
          if (pid === null || pid === undefined) pid = orows[0].product_id;
          if (!price) price = Number(orows[0].price) || 0;
        }
      }
      refund += price * q;
      lines.push({ order_item_id: it?.order_item_id ?? null, product_id: pid, qty: q, price });
    }
    if (lines.length === 0) return res.status(400).json({ ok: false, msg: 'No valid return lines (qty > 0 required)' });
    const doRestock = restock === true || restock === 1 || restock === '1';
    if (doRestock) {
      for (const ln of lines) {
        if (ln.product_id) {
          try { await dbPool.execute(`UPDATE bunon_products SET stock_quantity = stock_quantity + ? WHERE id = ?`, [ln.qty, ln.product_id]); } catch (e: any) { /* best effort */ }
        }
      }
    }
    await dbPool.execute(
      `INSERT INTO bunon_returns (order_id, items, reason, status, refund_amount, restocked) VALUES (?, ?, ?, 'pending', ?, ?)`,
      [id, JSON.stringify(lines), reason || null, refund, doRestock ? 1 : 0]
    );
    await dbPool.execute(`UPDATE bf_orders SET status = 'partial_return', updated_at = NOW() WHERE id = ?`, [id]);
    await writeLog(id, 'partial_return', `Partial return: ${lines.length} lines, refund ৳${refund}${reason ? ` — ${reason}` : ''}${doRestock ? ' (restocked)' : ''}`, await actorName(req));
    res.json({ ok: true, msg: 'Partial return recorded', refund_amount: refund, restocked: doRestock });
  } catch (error: any) {
    console.error('[Admin API] Partial Return Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error recording partial return' });
  }
});

// POST /api/admin/orders/:id/full-return {reason?, restock?}
router.post('/:id/full-return', requireAny(['edit_orders', 'update_order_status']), async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, restock } = req.body as any;
    const [orders]: any = await dbPool.execute(`SELECT id, total_payable FROM bf_orders WHERE id = ? LIMIT 1`, [id]);
    if (orders.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
    const [allItems]: any = await dbPool.execute(
      `SELECT id, product_id, product_name, qty, price, line_total FROM bf_order_items WHERE order_id = ?`, [id]
    );
    const doRestock = restock === true || restock === 1 || restock === '1';
    if (doRestock) {
      for (const it of allItems) {
        if (it.product_id) {
          try { await dbPool.execute(`UPDATE bunon_products SET stock_quantity = stock_quantity + ? WHERE id = ?`, [it.qty, it.product_id]); } catch (e: any) { /* best effort */ }
        }
      }
    }
    const refund = allItems.reduce(
      (s: number, it: any) => s + (Number(it.line_total) || Number(it.price) * Number(it.qty) || 0), 0
    ) || Number(orders[0].total_payable) || 0;
    for (const ddl of [
      `ALTER TABLE bunon_returns ADD COLUMN refund_amount DECIMAL(12,2) NOT NULL DEFAULT 0`,
      `ALTER TABLE bunon_returns ADD COLUMN restocked TINYINT(1) NOT NULL DEFAULT 0`,
    ]) {
      try { await dbPool.execute(ddl); } catch (e: any) { /* column already exists */ }
    }
    await dbPool.execute(
      `INSERT INTO bunon_returns (order_id, items, reason, status, refund_amount, restocked) VALUES (?, ?, ?, 'full', ?, ?)`,
      [id, JSON.stringify(allItems.map((it: any) => ({ order_item_id: it.id, product_id: it.product_id, qty: it.qty, price: it.price }))), reason || null, refund, doRestock ? 1 : 0]
    );
    await dbPool.execute(`UPDATE bf_orders SET status = 'return', updated_at = NOW() WHERE id = ?`, [id]);
    await writeLog(id, 'full_return', `Full return: refund ৳${refund}${reason ? ` — ${reason}` : ''}${doRestock ? ' (restocked)' : ''}`, await actorName(req));
    res.json({ ok: true, msg: 'Full return recorded', refund_amount: refund, restocked: doRestock });
  } catch (error: any) {
    console.error('[Admin API] Full Return Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error recording full return' });
  }
});

// POST /api/admin/orders/:id/rider-reply
router.post('/:id/rider-reply', requireAny(['edit_orders']), async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.body;
    if (!message) return res.status(400).json({ ok: false, msg: 'message is required' });
    const [orders]: any = await dbPool.execute(`SELECT id FROM bf_orders WHERE id = ? LIMIT 1`, [id]);
    if (orders.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
    await dbPool.execute(
      `INSERT INTO bf_order_logs (order_id, log_type, message, created_by, created_at) VALUES (?, 'rider_reply', ?, 'rider', NOW())`,
      [id, message]
    );
    res.json({ ok: true, msg: 'Rider reply logged' });
  } catch (error: any) {
    console.error('[Admin API] Rider Reply Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error logging rider reply' });
  }
});

// PUT /api/admin/orders/:id/customer {customer_name?,phone?,address?,city?,delivery_fee?,discount?}
router.put('/:id/customer', requireAny(['edit_orders']), async (req, res) => {
  try {
    const { id } = req.params;
    const { customer_name, phone, address, city, delivery_fee, discount } = req.body;
    const sets: string[] = [];
    const vals: any[] = [];
    if (customer_name !== undefined) { sets.push('customer_name = ?'); vals.push(customer_name); }
    if (phone !== undefined) { sets.push('phone = ?'); vals.push(phone); }
    if (address !== undefined) { sets.push('address = ?'); vals.push(address); }
    if (city !== undefined) { sets.push('city = ?'); vals.push(city); }
    const feeChanged = delivery_fee !== undefined;
    const discChanged = discount !== undefined;
    if (feeChanged) { sets.push('delivery_fee = ?'); vals.push(Number(delivery_fee) || 0); }
    if (discChanged) {
      const d = Number(discount) || 0;
      sets.push('discount = ?'); vals.push(d);
      sets.push('discount_amount = ?'); vals.push(d);
    }
    if (sets.length === 0) return res.status(400).json({ ok: false, msg: 'No fields to update' });
    if (feeChanged || discChanged) {
      const [rows]: any = await dbPool.execute(
        'SELECT subtotal, delivery_fee, discount, discount_amount FROM bf_orders WHERE id = ? LIMIT 1',
        [id]
      );
      if (rows.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
      const o = rows[0];
      const fee = feeChanged ? (Number(delivery_fee) || 0) : (Number(o.delivery_fee) || 0);
      const disc = discChanged ? (Number(discount) || 0) : (Number(o.discount ?? o.discount_amount) || 0);
      const subtotal = Number(o.subtotal) || 0;
      const totalPayable = subtotal + fee - disc;
      sets.push('total_payable = ?'); vals.push(totalPayable);
    }
    sets.push('updated_at = NOW()');
    const [chk]: any = await dbPool.execute('SELECT id FROM bf_orders WHERE id = ? LIMIT 1', [id]);
    if (chk.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
    await dbPool.execute('UPDATE bf_orders SET ' + sets.join(', ') + ' WHERE id = ?', [...vals, id]);
    await writeLog(id, 'customer_update', 'Customer info updated (' + sets.join(', ') + ')', await actorName(req));
    res.json({ ok: true, msg: 'Customer info updated' });
  } catch (error: any) {
    console.error('[Admin API] Update Customer Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error updating customer info' });
  }
});

// PUT /api/admin/orders/:id/amount {delivery_fee?, discount?} (recalc total + log)
router.put('/:id/amount', requireAny(['edit_orders']), async (req, res) => {
  try {
    const { id } = req.params;
    const { delivery_fee, discount } = req.body;
    if (delivery_fee === undefined && discount === undefined)
      return res.status(400).json({ ok: false, msg: 'delivery_fee or discount is required' });
    const [rows]: any = await dbPool.execute(
      'SELECT id, subtotal, delivery_fee, discount, discount_amount FROM bf_orders WHERE id = ? LIMIT 1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
    const o = rows[0];
    const fee = delivery_fee !== undefined ? (Number(delivery_fee) || 0) : (Number(o.delivery_fee) || 0);
    const disc = discount !== undefined ? (Number(discount) || 0) : (Number(o.discount ?? o.discount_amount) || 0);
    const subtotal = Number(o.subtotal) || 0;
    const totalPayable = subtotal + fee - disc;
    await dbPool.execute(
      'UPDATE bf_orders SET delivery_fee = ?, discount = ?, discount_amount = ?, total_payable = ?, updated_at = NOW() WHERE id = ?',
      [fee, disc, disc, totalPayable, id]
    );
    await writeLog(id, 'amount_updated', 'Amount updated: fee=' + fee + ', disc=' + disc + ', total=' + totalPayable, await actorName(req));
    res.json({ ok: true, msg: 'Order amount updated', delivery_fee: fee, discount: disc, total_payable: totalPayable });
  } catch (error: any) {
    console.error('[Admin API] Update Amount Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error updating amount' });
  }
});

// DELETE /api/admin/orders/:id (guarded by delete_orders + audit; block courier-sent unless force=1)
router.delete('/:id', requireAny(['delete_orders']), async (req, res) => {
  try {
    const { id } = req.params;
    const force = String((req.query as any).force || (req.body as any)?.force || '') === '1';
    const [rows]: any = await dbPool.execute(
      'SELECT id, invoice, consignment_id, tracking_code, courier_code FROM bf_orders WHERE id = ? LIMIT 1',
      [id]
    );
    if (rows.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
    const o = rows[0];
    const courierSent = !!(o.consignment_id || o.tracking_code || o.courier_code);
    if (courierSent && !force)
      return res.status(409).json({ ok: false, msg: 'Order already sent to courier. Pass force=1 to delete anyway.', courier: true });
    await dbPool.execute('DELETE FROM bf_order_items WHERE order_id = ?', [id]);
    await dbPool.execute('DELETE FROM bf_orders WHERE id = ?', [id]);
    try {
      await dbPool.execute(
        'INSERT INTO bf_order_logs (order_id, log_type, message, created_by, created_at) VALUES (?, ?, ?, ?, NOW())',
        [id, 'deleted', 'Order ' + (o.invoice || id) + ' deleted' + (force ? ' (forced, courier-sent)' : ''), await actorName(req)]
      );
    } catch { /* log row may fail post-delete on FK */ }
    await logAudit({ ...(auditCtx(req as any) as object), action: 'delete_order', module: 'orders', target: id, detail: 'invoice=' + (o.invoice || '') + (force ? ' force=1' : '') });
    res.json({ ok: true, msg: 'Order deleted', forced: force });
  } catch (error: any) {
    console.error('[Admin API] Delete Order Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error deleting order' });
  }
});
// PUT /api/admin/orders/:id/status
router.put('/:id/status', requireAny(['update_order_status', 'edit_orders']), async (req, res) => {
  try {
    const { status } = req.body;
    const { id } = req.params;

    if (!status) return res.status(400).json({ ok: false, msg: 'Status is required' });

    // Recycle-bin restore: moving OUT of trash needs restore_trash (legacy edit_orders fallback)
    {
      const [cur]: any = await dbPool.execute('SELECT status FROM bf_orders WHERE id = ? LIMIT 1', [id]);
      const curSt = cur?.length ? String(cur[0].status).toLowerCase() : '';
      if (curSt === 'trash' && String(status).toLowerCase() !== 'trash' && !isPrivileged(req)) {
        const p = staffPerms(req);
        if (!p.includes('restore_trash') && !p.includes('edit_orders'))
          return res.status(403).json({ ok: false, msg: 'Access denied. Requires restore_trash.' });
      }
    }

    let prevSt = '';
    try { const [pr]: any = await dbPool.execute('SELECT status FROM bf_orders WHERE id = ? LIMIT 1', [id]); if (pr?.length) prevSt = String(pr[0].status); } catch {}
    await dbPool.execute(
      `UPDATE bf_orders SET status = ? WHERE id = ?`,
      [status, id]
    );
    await writeLog(id, 'status', `Status changed from ${prevSt || '?'} to ${status}`, await actorName(req));

    try { waAutoNotifyStatus(Number(id), String(status)).catch(() => {}); } catch { /* fail-open */ }
    res.json({ ok: true, msg: 'Order status updated' });
  } catch (error: any) {
    console.error('[Admin API] Update Order Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error updating order' });
  }
});

// POST /api/admin/orders/:id/courier/steadfast
router.post('/:id/courier/steadfast', requireAny(['sync_courier_status', 'book_courier']), async (req, res) => {
  try {
    const { id } = req.params;

    // Fetch order details
    const [orders]: any = await dbPool.execute(
      `SELECT invoice, customer_name, phone, address, city, total_payable, consignment_id, status
       FROM bf_orders WHERE id = ? LIMIT 1`,
      [id]
    );

    if (orders.length === 0) return res.status(404).json({ ok: false, msg: 'Order not found' });
    const order = orders[0];

    if (order.consignment_id) {
      return res.status(400).json({ ok: false, msg: 'Already booked with Steadfast' });
    }

    const booked = await bookSteadfast(order);
    if (booked.ok && booked.consignment) {
      // Save consignment to database
      await dbPool.execute(
        `UPDATE bf_orders SET consignment_id = ?, tracking_code = ?, status = 'in_transit' WHERE id = ?`,
        [booked.consignment.consignment_id, booked.consignment.tracking_code, id]
      );
      return res.json({ ok: true, msg: 'Successfully booked with Steadfast!', consignment: booked.consignment });
    }
    console.error('[Steadfast API Error]', booked.msg);
    return res.status(400).json({ ok: false, msg: booked.msg || 'Steadfast booking failed' });

  } catch (error: any) {
    console.error('[Admin API] Steadfast Booking Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error processing booking' });
  }
});

export default router;
