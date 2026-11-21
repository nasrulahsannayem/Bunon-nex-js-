/**
 * Pinterest Conversions API — server-owned Purchase/checkout reporting.
 *
 * Mirrors server/services/metaPurchase.ts exactly, including the rules that
 * matter:
 *   • the order total comes from the DB row, never from the client payload
 *   • one send per order via a UNIQUE ledger row (affectedRows === 0 => dup)
 *   • the browser tag and this server event share one event_id so Pinterest
 *     merges them instead of double-counting the conversion
 *
 * Why it exists: Pinterest cannot see the server-side half of a checkout, so
 * without this every completed order is invisible to its ROAS reporting.
 */
import crypto from 'node:crypto';
import { productDbPool, dbPool } from '../db';

const API = 'https://api.pinterest.com/v5/ad_accounts';

const log = (...a: any[]) => console.log('[PinterestPurchase]', ...a);

const getEnv = (k: string) => String(process.env[k] || '').trim();

/** Same normalisation as the browser side, so both agree on the value. */
const cleanNum = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const normaliseCurrency = (c: any): string => {
  const v = String(c || '').trim().toUpperCase();
  return /^[A-Z]{3}$/.test(v) ? v : 'BDT';
};

/** Pinterest wants SHA-256 lowercase hex of the normalised value. */
const sha256 = (v: string) =>
  crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

const normalisePhone = (p: any) => {
  // Keep digits only; drop a leading country code so 8801… and 01… match.
  const d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('880') && d.length > 10) return d.slice(3);
  if (d.startsWith('0') && d.length > 10) return d.slice(1);
  return d;
};

/**
 * user_data assembled from whatever the order row actually holds.
 * Absent identifiers are omitted — Pinterest explicitly warns that sending
 * empty strings degrades match quality.
 */
const buildUserData = (o: any, clientIp: string, ua: string) => {
  const u: any = {};
  // bf_orders has no `email` column; WooCommerce/WhatsApp rows may carry one.
  const email = o.email || o.customer_email || o.billing_email;
  if (email && String(email).includes('@')) u.em = [sha256(email)];
  if (o.phone) u.ph = [sha256(normalisePhone(o.phone))];

  // external_id is present on bf_orders, but WhatsApp/Woo rows sometimes only
  // have customer_name — falling back to it keeps match quality up.
  const ext = o.external_id || o.customer_id || o.user_id || o.customer_name;
  if (ext && String(ext).trim()) u.external_id = [sha256(String(ext))];

  if (clientIp && clientIp !== '127.0.0.1' && clientIp !== '::1') {
    u.client_ip_address = clientIp;
  }
  if (ua && !/node|axios|undici|curl/i.test(ua)) u.client_user_agent = ua;

  // click_id (fbc equivalent) + browser_id — both already stored per order.
  if (o.fbc) u.click_id = String(o.fbc);
  if (o.fbp) u.browser_id = String(o.fbp);

  return Object.keys(u).length ? u : null;
};

export type PinterestPurchaseInput = {
  orderId: number | string;
  total: any;
  currency?: string;
  productId?: string | number | null;
  productName?: string | null;
  quantity?: number | null;
  clientIp?: string;
  userAgent?: string;
};

/** Read the committed order. Returns null when it isn't real yet. */
const loadOrder = async (orderId: number | string) => {
  const pools = [dbPool, productDbPool];
  for (const p of pools) {
    try {
      const [rows]: any = await p.execute(
        `SELECT * FROM bf_orders WHERE id = ? LIMIT 1`,
        [orderId]
      );
      if (rows && rows.length) return rows[0];
    } catch { /* try the next pool */ }
  }
  return null;
};

/**
 * Send one checkout event for a confirmed order.
 * Returns true when Pinterest accepted it, false when skipped or duplicated.
 */
export const sendPinterestPurchase = async (input: PinterestPurchaseInput) => {
  const acc = getEnv('PINTEREST_AD_ACCOUNT_ID') || getEnv('VITE_PINTEREST_AD_ACCOUNT_ID');
  const token = getEnv('PINTEREST_ACCESS_TOKEN');
  if (!acc || !token) {
    log('skipped — PINTEREST_AD_ACCOUNT_ID or PINTEREST_ACCESS_TOKEN missing');
    return false;
  }

  const order = await loadOrder(input.orderId);
  if (!order) { log(`skipped — order ${input.orderId} not found`); return false; }

  // bf_orders stores the payable total in total_payable (there is no `total`
  // or `amount` column) — check the real schema before assuming a name.
  const value = cleanNum(
    input.total ?? order.total_payable ?? order.grand_total ?? order.amount ?? order.total
  );
  if (value <= 0) { log(`skipped — order ${input.orderId} has no positive total`); return false; }

  const currency = normaliseCurrency(input.currency || order.currency || 'BDT');

  // Same id the browser tag used for this order (order-<id>), so the two
  // halves merge. Fall back to a random id if the browser id is unavailable.
  const eventId = `order-${input.orderId}`;

  // ── idempotency ledger: one row per order, UNIQUE ─────────────
  const ledger = 'bf_pinterest_purchase_log';
  try {
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS ${ledger} (
         order_id BIGINT NOT NULL,
         event_id VARCHAR(191) NOT NULL,
         value DECIMAL(12,2) NOT NULL,
         currency VARCHAR(8) NOT NULL,
         sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
         PRIMARY KEY (order_id),
         UNIQUE KEY uniq_event (event_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
  } catch (e: any) {
    log('ledger create failed:', e.message);
  }

  // Claim the slot BEFORE sending so two concurrent requests cannot both send,
  // but roll the claim back if Pinterest rejects the payload — otherwise a
  // transient API error would permanently mark the order as 'already sent'
  // and the revenue would never be reported.
  let inserted = false;
  try {
    const [res]: any = await dbPool.query(
      `INSERT IGNORE INTO ${ledger} (order_id, event_id, value, currency)
       VALUES (?, ?, ?, ?)`,
      [input.orderId, eventId, value, currency]
    );
    inserted = (res?.affectedRows || 0) === 1;
  } catch (e: any) {
    log('ledger insert error:', e.message);
    return false;
  }

  if (!inserted) {
    log(`duplicate — order ${input.orderId} already sent (event ${eventId})`);
    return false;
  }

  const releaseClaim = async () => {
    try { await dbPool.query(`DELETE FROM ${ledger} WHERE order_id = ?`, [input.orderId]); }
    catch { /* best effort */ }
  };

  const userData = buildUserData(order, input.clientIp || '', input.userAgent || '');
  if (!userData) {
    log(`skipped — order ${input.orderId} produced no user_data`);
    await releaseClaim();
    return false;
  }

  const event: any = {
    event_name: 'checkout',
    event_time: Math.floor(Date.now() / 1000),
    event_id: eventId,
    action_source: 'web',
    event_source_type: 'web',
    order_id: String(input.orderId),
    value,
    currency,
    user_data: userData,
    custom_data: {
      currency,
      value: String(value.toFixed(2)),
      order_id: String(input.orderId),
    },
  };

  // Pinterest types these fields strictly: product_id and num_items must be
  // JSON integers. Sending "1" as a string fails schema validation and the
  // entire event is dropped, so coerce and drop anything non-numeric.
  const toInt = (v: any) => {
    const n = parseInt(String(v ?? '').replace(/\D/g, ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  const pid = toInt(input.productId ?? order.product_id);
  if (pid !== null) event.custom_data.product_id = pid;
  if (input.productName || order.product_name) {
    event.custom_data.product_name = String(input.productName || order.product_name);
  }
  const qty = toInt(input.quantity ?? order.quantity) ?? 1;
  event.custom_data.num_items = qty;

  try {
    const r = await fetch(`${API}/${acc}/events`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ data: [event] }),
    });
    const body: any = await r.json().catch(() => ({}));
    const st = body?.events?.[0]?.status;
    if (r.ok && st === 'processed') {
      log(`SUCCESS order=${input.orderId} value=${value} ${currency} event=${eventId}`);
      return true;
    }
    const msg = body?.events?.[0]?.error_message || body?.message || `HTTP ${r.status}`;
    log(`FAILED order=${input.orderId}: ${msg}`);
    await releaseClaim();   // let a later attempt retry
    return false;
  } catch (e: any) {
    log(`ERROR order=${input.orderId}: ${e.message}`);
    await releaseClaim();
    return false;
  }
};

export default sendPinterestPurchase;