import express from "express";
import crypto from "crypto";
import { productDbPool } from "../db";
import { syncLocalDatabase } from "../store";

const router = express.Router();

router.post("/woocommerce/product", async (req, res) => {
  try {
    const payload = req.body;
    const event = req.headers['x-wc-webhook-event'] || 'updated'; 
    
    console.log(`[WEBHOOK] Received product event: ${event}`);

    if (event === 'deleted' && payload.id) {
      await productDbPool.execute("DELETE FROM wc_products_full WHERE wc_product_id = ? OR id = ?", [payload.id, payload.id]);
      await syncLocalDatabase();
    } else if ((event === 'updated' || event === 'created') && payload.id) {
      const product_id = payload.id;
      const name = payload.name || "";
      const slug = payload.slug || "";
      const sku = payload.sku || "N/A";
      const price = payload.price || 0;
      const regular_price = payload.regular_price || price;
      const sale_price = payload.sale_price || price;
      const on_sale = payload.on_sale ? 1 : 0;
      const stock_status = payload.stock_status || "instock";
      const stock_quantity = payload.stock_quantity || null;
      const description = payload.description || "";
      const short_description = payload.short_description || "";
      const imagesJson = JSON.stringify(payload.images || []);
      const categoriesJson = JSON.stringify(payload.categories || []);
      const tagsJson = JSON.stringify(payload.tags || []);
      const thumbnail = payload.images && payload.images.length > 0 ? payload.images[0].src : "";
      const menu_order = payload.menu_order || 0;
      const date_created = payload.date_created || new Date().toISOString().slice(0, 19).replace('T', ' ');
      const total_sales = payload.total_sales || 0;

      const [existing]: any = await productDbPool.execute("SELECT id FROM wc_products_full WHERE wc_product_id = ? OR id = ?", [product_id, product_id]);
      if (existing.length > 0) {
         await productDbPool.execute(
           `UPDATE wc_products_full SET 
            name=?, slug=?, sku=?, price=?, regular_price=?, sale_price=?, on_sale=?, 
            stock_status=?, stock_quantity=?, description=?, short_description=?, 
            images=?, thumbnail=?, categories=?, tags=?, menu_order=?, total_sales=? 
            WHERE wc_product_id=? OR id=?`,
           [name, slug, sku, price, regular_price, sale_price, on_sale, 
            stock_status, stock_quantity, description, short_description, 
            imagesJson, thumbnail, categoriesJson, tagsJson, menu_order, total_sales,
            product_id, product_id]
         );
      } else {
         await productDbPool.execute(
           `INSERT INTO wc_products_full 
            (id, wc_product_id, name, slug, sku, price, regular_price, sale_price, on_sale, 
            stock_status, stock_quantity, description, short_description, images, thumbnail, 
            categories, tags, menu_order, date_created, total_sales) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
           [product_id, product_id, name, slug, sku, price, regular_price, sale_price, on_sale, 
            stock_status, stock_quantity, description, short_description, imagesJson, thumbnail, 
            categoriesJson, tagsJson, menu_order, date_created, total_sales]
         );
      }
      
      syncLocalDatabase();
    }

    res.status(200).send("Webhook processed");
  } catch (error: any) {
    console.error("[WEBHOOK Error]", error.message);
    res.status(500).send("Webhook Error");
  }
});



// POST /api/steadfast/status-update — PUBLIC Steadfast webhook receiver (FULL parity).
// Auth: HMAC-SHA256 'X-Signature' over the RAW body (key: steadfast_webhook_secret,
// falls back to steadfast_secret_key), compared with timingSafeEqual. Legacy
// ?token= / x-webhook-token (steadfast_webhook_token) kept as fallback when no
// signature header is sent. 403 on mismatch.
// Idempotency: 'Idempotency-Key' header (or derived event+ids key) deduped via
// steadfast_webhook_events (UNIQUE key). Replays answer { ok: true, deduped: true }.
// Events: delivery_status, tracking_update, consignment_update,
// return_list_accepted, payment_request, cancel_request, return_request,
// pickup_request, user_update — ALL logged; order rows updated where relevant.
const SF_WEBHOOK_EVENTS = new Set([
  'delivery_status', 'tracking_update', 'consignment_update',
  'return_list_accepted', 'payment_request', 'cancel_request',
  'return_request', 'pickup_request', 'user_update',
]);

async function ensureSfEventsTable() {
  await productDbPool.execute(
    'CREATE TABLE IF NOT EXISTS steadfast_webhook_events (' +
    'id BIGINT AUTO_INCREMENT PRIMARY KEY,' +
    'idempotency_key VARCHAR(128) NOT NULL UNIQUE,' +
    'event VARCHAR(64) NOT NULL DEFAULT ' + "''" + ',' +
    'consignment_id VARCHAR(32) NULL,' +
    'invoice VARCHAR(100) NULL,' +
    'payload TEXT NULL,' +
    'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)'
  );
}

function sfVerifyHmac(raw: Buffer, sig: string, keys: string[]): boolean {
  const s = String(sig || '').trim();
  if (!s || !raw || !raw.length) return false;
  for (const k of keys) {
    if (!k) continue;
    for (const enc of ['hex', 'base64'] as const) {
      const h = crypto.createHmac('sha256', k).update(raw).digest(enc);
      const a = Buffer.from(h, 'utf8');
      const b = Buffer.from(s, 'utf8');
      try {
        if (a.length === b.length && crypto.timingSafeEqual(a, b)) return true;
      } catch { /* length mismatch — try next */ }
    }
  }
  return false;
}

router.post('/steadfast/status-update', async (req, res) => {
  try {
    const { getSecret } = await import('../utils/secrets');
    const raw: Buffer = (req as any).rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');
    const sig = String((req.headers as any)['x-signature'] ?? (req.headers as any)['x-steadfast-signature'] ?? '');
    let via = 'none';
    if (sig) {
      const keys = [await getSecret('steadfast_webhook_secret'), await getSecret('steadfast_secret_key')];
      if (!sfVerifyHmac(raw, sig, keys)) {
        console.warn('[Steadfast public webhook] rejected: HMAC mismatch', { ip: req.ip });
        return res.status(403).json({ ok: false, msg: 'Forbidden' });
      }
      via = 'hmac';
    } else {
      const expected = await getSecret('steadfast_webhook_token');
      const provided = String((req.query as any)?.token ?? (req.headers as any)['x-webhook-token'] ?? '');
      if (expected) {
        if (!provided || provided !== expected) {
          console.warn('[Steadfast public webhook] rejected: token mismatch', { ip: req.ip });
          return res.status(403).json({ ok: false, msg: 'Forbidden' });
        }
        via = 'token';
      } else {
        console.warn('[Steadfast public webhook] no secret/token set — accepting unauthenticated (set in Settings)');
        via = 'open';
      }
    }
    const body = req.body || {};
    const event = String(body.event ?? body.event_type ?? 'delivery_status').toLowerCase();
    const cid = body.consignment_id ?? body.consignmentId ?? null;
    const inv = body.invoice ?? null;
    const dstat = body.delivery_status ?? body.status ?? '';
    await ensureSfEventsTable();
    const hdrKey = String((req.headers as any)['idempotency-key'] ?? body.idempotency_key ?? '');
    const derived = crypto.createHash('sha256')
      .update(`${event}|${cid ?? ''}|${inv ?? ''}|${body.tracking_code ?? ''}|${dstat}|${body.created_at ?? body.updated_at ?? ''}`)
      .digest('hex').slice(0, 64);
    const idemKey = (hdrKey || derived).slice(0, 128);
    try {
      await productDbPool.execute(
        'INSERT INTO steadfast_webhook_events (idempotency_key, event, consignment_id, invoice, payload) VALUES (?, ?, ?, ?, ?)',
        [idemKey, event.slice(0, 64), cid ? String(cid).slice(0, 32) : null, inv ? String(inv).slice(0, 100) : null, JSON.stringify(body).slice(0, 16000)]
      );
    } catch (e: any) {
      if (e && (e.code === 'ER_DUP_ENTRY' || String(e.message || '').includes('Duplicate'))) {
        return res.json({ ok: true, deduped: true, event });
      }
      throw e;
    }
    if (!SF_WEBHOOK_EVENTS.has(event)) {
      console.warn('[Steadfast public webhook] unknown event, logged only', { event });
    }
    const { applySteadfastUpdate } = await import('./admin/couriers');
    let r: any = { matched: false };
    if (event === 'delivery_status' || event === 'tracking_update' || event === 'consignment_update' ||
        event === 'return_list_accepted' || event === 'return_request' || event === 'cancel_request') {
      r = await applySteadfastUpdate(body);
    } else {
      // payment_request, pickup_request, user_update (+ unknown): log against order if identifiable.
      try {
        const rows: any = cid
          ? (await productDbPool.execute('SELECT id FROM bf_orders WHERE consignment_id = ? LIMIT 1', [cid]))[0]
          : inv
            ? (await productDbPool.execute('SELECT id FROM bf_orders WHERE invoice = ? LIMIT 1', [inv]))[0]
            : [];
        if ((rows as any[])?.length) {
          await productDbPool.execute(
            'INSERT INTO bf_order_logs (order_id, log_type, message, created_by, created_at) VALUES (?, ?, ?, ?, NOW())',
            [(rows as any[])[0].id, `steadfast_${event}`, `Steadfast ${event}: ${dstat || 'n/a'}`, 'steadfast_webhook']
          );
          r = { matched: true, orderId: (rows as any[])[0].id };
        }
      } catch (e: any) { console.error('[Steadfast public webhook] log-only event failed:', e.message); }
    }
    res.json({ ok: true, event, via, ...r });
  } catch (e: any) {
    console.error('[Steadfast public webhook]', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
