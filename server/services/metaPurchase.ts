/**
 * Server-owned Meta Purchase (Conversions API).
 *
 * Why this exists:
 * /api/v1/sync is protected by browserEventGuard (server.ts), which downgrades
 * every browser 'Purchase' to 'ViewContent' and strips value/transaction_id.
 * That guard is deliberate -- an attacker who can POST to a public endpoint
 * could otherwise inflate ROAS. But it had a second, unintended consequence:
 * NO website order ever reached Meta as a Purchase, so Ads Manager and the
 * ad accounts saw the funnel but never the revenue. Only WhatsApp-sourced
 * orders (server/routes/waAnalytics.ts) reported a real purchase.
 *
 * This module closes that gap from the one trustworthy place: the checkout
 * route itself, immediately after the order row is committed. No browser input
 * reaches the value -- it comes from the server's own computed total.
 *
 * Dedupe (browser + server):
 *   - The order id is used as event_id, and it is also written to the order row
 *     as external_id. The browser Purchase carries transaction_id = order id.
 *     Meta dedupes browser/server on event_id, and order id is the natural key
 *     both sides agree on, so a given order is counted once.
 *   - Every send is recorded in bf_meta_purchase_log keyed by order id, so a
 *     retry after a crash cannot double-report, and delivery can be audited.
 *
 * Safety:
 *   - Fire-and-forget: a Meta failure must never break checkout.
 *   - Phone is SHA256 hashed; fbp/fbc are opaque and sent unhashed.
 *   - Test identities are skipped, same as capi.ts.
 */
import crypto from 'crypto';
import { dbPool } from '../db';
import { getSecret } from '../utils/secrets';

const PIXEL_FALLBACK = '887459306920960';
const META_API_VERSION = process.env.META_API_VERSION || 'v22.0';

const sha256 = (v: string) =>
  crypto.createHash('sha256').update(String(v).trim().toLowerCase()).digest('hex');

// Same identities capi.ts refuses to forward.
const TEST_PHONES = new Set(['01773258555', '8801799553223']);
const TEST_EMAILS = new Set(['test@test.com', 'naim@gmail.com']);

/** Digits-only phone, country code stripped to the last 11 (BD mobile). */
function normPhone(v: any): string {
  return String(v || '').replace(/\D/g, '').slice(-11);
}

export interface ServerPurchaseInput {
  orderId: string | number;
  value: number;
  currency?: string;
  phone?: string;
  email?: string;
  fbp?: string;
  fbc?: string;
  city?: string;
  productIds?: string[];
  sourceUrl?: string;
  /** Buyer's real IP + UA captured at checkout; omitting these lowers Meta EMQ. */
  clientIpAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Report one Purchase to Meta. Never throws.
 * Returns true only when Meta acknowledged the event.
 */
export async function sendServerPurchase(input: ServerPurchaseInput): Promise<boolean> {
  try {
    const orderId = String(input.orderId || '').trim();
    const value = Number(input.value);
    if (!orderId || !Number.isFinite(value) || value <= 0) {
      console.log('[MetaPurchase] skipped: missing order id or non-positive value');
      return false;
    }

    const phone = normPhone(input.phone);
    const email = String(input.email || '').trim().toLowerCase();
    if (TEST_PHONES.has(phone) || TEST_EMAILS.has(email)) {
      console.log(`[MetaPurchase] skipped order ${orderId} (test identity)`);
      return false;
    }

    // ---- idempotency: one Purchase per order, ever ----
    //
    // The claim is the INSERT itself, not a follow-up COUNT. A previous version
    // inserted with INSERT IGNORE and then asserted COUNT(*) > 1, which is
    // never true for a UNIQUE order_id -- so a retry sent a SECOND Purchase to
    // Meta and double-counted revenue. MySQL reports affectedRows: 1 when the
    // row was really inserted and 0 when the UNIQUE key rejected it, so that
    // value is the correct claim signal.
    try {
      const [claim]: any = await dbPool.execute(
        `INSERT IGNORE INTO bf_meta_purchase_log (order_id, event_id, created_at)
         VALUES (?, ?, NOW())`,
        [orderId, `order-${orderId}`]
      );
      if (Number(claim?.affectedRows || 0) === 0) {
        console.log(`[MetaPurchase] order ${orderId} already reported -- not sending again`);
        return false;
      }
    } catch (dbErr: any) {
      // If the ledger is unavailable we must NOT send: that is exactly how
      // duplicates get created.
      console.error('[MetaPurchase] idempotency check failed, refusing to send:', dbErr?.message || dbErr);
      return false;
    }

    // ---- build the event ----
    const userData: any = {};
    if (phone.length >= 11) userData.ph = [sha256(phone)];
    if (/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) userData.em = [sha256(email)];
    if (input.fbp) userData.fbp = String(input.fbp).trim();
    if (input.fbc) userData.fbc = String(input.fbc).trim();
    if (input.city) userData.ct = String(input.city).trim().toLowerCase().slice(0, 60);
    userData.external_id = [sha256(orderId)];
    // FIX (2026-10-04): these used to be hardcoded to loopback + a fake UA.
    // Meta treats client_ip_address and client_user_agent as hashed-able user
    // identifiers -- sending "127.0.0.1"/"bunon-server/1.0" for every single
    // purchase actively DEGRADED Event Match Quality, because thousands of
    // unrelated buyers all presented the same IP+UA pair to Meta and looked like
    // one suspicious cluster. Send the REAL buyer values when we have them; the
    // order row already stores them (server-side capture at checkout).
    const realIp = input.clientIpAddress || order.client_ip || order.clientIpAddress || null;
    const realUa = input.userAgent || order.user_agent || order.userAgent || null;
    if (realIp) userData.client_ip_address = String(realIp).trim();
    if (realUa) userData.client_user_agent = String(realUa).trim();
    // If we genuinely have neither, omit the fields rather than send a shared
    // placeholder -- an absent identifier is neutral, a wrong one is not.
    if (!realIp) delete userData.client_ip_address;
    if (!realUa) delete userData.client_user_agent;

    const contentIds = (input.productIds || []).filter(Boolean).map(String);
    const customData: any = {
      value: Math.round(value * 100) / 100,
      currency: input.currency || 'BDT',
      content_type: 'product',
      order_id: orderId,
    };
    if (contentIds.length) {
      customData.content_ids = contentIds;
      customData.contents = contentIds.map((id) => ({ id, quantity: 1 }));
    }

    const event = {
      event_name: 'Purchase',
      event_time: Math.floor(Date.now() / 1000),
      action_source: 'website',
      event_id: `order-${orderId}`,
      event_source_url: input.sourceUrl || 'https://bunonfabrics.com/order-received',
      user_data: userData,
      custom_data: customData,
    };

    const PIXEL_ID = (await getSecret('meta_pixel_id')) || PIXEL_FALLBACK;
    const token = await getSecret('meta_capi_token');
    if (!token) {
      console.log('[MetaPurchase] no CAPI token configured; purchase NOT reported');
      return false;
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(
      `https://graph.facebook.com/${META_API_VERSION}/${PIXEL_ID}/events?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [event] }),
        signal: ctrl.signal,
      }
    );
    clearTimeout(timer);
    const body: any = await r.json().catch(() => ({}));

    if (r.ok && Number(body.events_received || 0) > 0) {
      console.log(
        `[MetaPurchase] order ${orderId} Purchase sent value=${customData.value} ${customData.currency}` +
        (contentIds.length ? ` items=${contentIds.join(',')}` : '')
      );
      return true;
    }

    console.error('[MetaPurchase] order ' + orderId + ' rejected:', JSON.stringify(body).slice(0, 400));
    // Allow a retry: drop the log row so the next attempt can try again.
    try {
      await dbPool.execute(`DELETE FROM bf_meta_purchase_log WHERE order_id = ?`, [orderId]);
    } catch { /* ignore */ }
    return false;
  } catch (e: any) {
    console.error('[MetaPurchase] failed for order', input?.orderId, ':', e?.message || e);
    try {
      await dbPool.execute(`DELETE FROM bf_meta_purchase_log WHERE order_id = ?`, [String(input?.orderId)]);
    } catch { /* ignore */ }
    return false;
  }
}