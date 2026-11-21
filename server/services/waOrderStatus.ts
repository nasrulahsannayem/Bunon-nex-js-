/**
 * Order-status WhatsApp automation.
 *
 * The shop had templates and a manual send, but nothing told the customer what
 * happened to their order. Staff had to send every update by hand, and the
 * moment they forgot, the customer called instead.
 *
 * This module is the single place that turns an order status change into one
 * (and only one) WhatsApp message containing the details the customer actually
 * asks for: product name, quantity, price, delivery total, address and — once
 * it exists — the courier tracking link.
 *
 * Safety rules built in, because a wrong message to a real customer is worse
 * than no message:
 *   - never send twice for the same (order, status): bf_wa_order_events has a
 *     UNIQUE key, and the insert is what claims the send
 *   - never send to someone who opted out: bf_wa_opt_in
 *   - never send outside the template's own rules; template lookup is by the
 *     status itself, so an unknown status simply produces no message
 *   - every attempt is logged with the real error, so the admin UI can show
 *     "why did this not send" instead of a silent failure
 */

// Canonical public origin. Every customer-facing link is built from this.
// It was previously referenced as `${SITE}` in this file but never declared
// here - only publicTrack.ts had its own copy. Because waTemplates.ts is
// imported by waOrderStatus.ts, the undefined identifier threw a
// ReferenceError inside the render path, which aborted the WHOLE status
// message (28 occurrences logged on 2026-10-05), not just the link. Fixed
// 2026-10-05.
const SITE = (process.env.SEO_ORIGIN || process.env.DOMAIN_URL || 'https://bunonfabrics.com').replace(/\/+$/, '');
import { dbPool, productDbPool } from '../db';
import {
  STATUS_TEMPLATES, canonicalStatus, cleanName as cleanCustomerName,
  productBlock, pricingBlock, addressBlock, paymentBlock, trackingBlock,
  helpline as helplineNumber, pricingMismatch, sanitizeMessage,
  useReturnReason, initHelpline,
} from './waTemplates';

export type OrderStatus =
  | 'pending' | 'confirmed' | 'processing' | 'packed'
  | 'shipped' | 'in_transit' | 'out_for_delivery' | 'delivered'
  | 'cancelled' | 'canceled' | 'returned' | 'partial_return' | 'failed';

const T = (n: number) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const money = (n: any) => T(Number(n || 0));

/** Normalise to 8801XXXXXXXXX, the form Baileys needs. */
export function normPhone(raw: any): string | null {
  let s = String(raw || '').replace(/\D/g, '');
  if (!s) return null;
  if (s.startsWith('880')) s = s.slice(3);
  if (s.startsWith('0')) s = '880' + s.slice(1);
  else if (s.length === 10 && s.startsWith('1')) s = '880' + s;
  if (s.length === 10) s = '880' + s;
  return /^8801\d{9}$/.test(s) ? s : null;
}

const BRIDGE_BASE = process.env.WA_BRIDGE_URL || 'http://127.0.0.1:5402';

async function bridgeSendText(phone: string, text: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const tokenFile = process.env.WA_BRIDGE_TOKEN_FILE || '/www/wwwroot/dash.bunonfabrics.com/wa-bridge/.bridge_token';
    const fs = await import('fs');
    const token = (process.env.WA_BRIDGE_TOKEN || fs.readFileSync(tokenFile, 'utf8')).trim();
    const r = await fetch(BRIDGE_BASE + '/send-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-token': token },
      body: JSON.stringify({ phone, text }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) return { ok: false, error: j?.error || j?.msg || 'bridge HTTP ' + r.status };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

async function bridgeSendImage(phone: string, b64: string, caption: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const tokenFile = process.env.WA_BRIDGE_TOKEN_FILE || '/www/wwwroot/dash.bunonfabrics.com/wa-bridge/.bridge_token';
    const fs = await import('fs');
    const token = (process.env.WA_BRIDGE_TOKEN || fs.readFileSync(tokenFile, 'utf8')).trim();
    const r = await fetch(BRIDGE_BASE + '/send-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-token': token },
      body: JSON.stringify({ phone, image_b64: b64, caption }),
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.ok === false) return { ok: false, error: j?.msg || j?.error || 'bridge HTTP ' + r.status };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}

/* ────────────────────────────── schema ────────────────────────────── */

let ready: Promise<void> | null = null;
export async function ensureAutomationSchema(): Promise<void> { return ensureSchema(); }

function ensureSchema() {
  if (!ready) {
    ready = (async () => {
      await dbPool.query(
        `CREATE TABLE IF NOT EXISTS bf_wa_order_events (
           id INT AUTO_INCREMENT PRIMARY KEY,
           order_id BIGINT NOT NULL,
           status VARCHAR(30) NOT NULL,
           phone VARCHAR(20) NOT NULL,
           body MEDIUMTEXT NULL,
           state VARCHAR(20) NOT NULL DEFAULT 'sent',
           error VARCHAR(255) NULL,
           created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
           sent_at DATETIME NULL,
           UNIQUE KEY uniq_order_status (order_id, status),
           INDEX idx_phone (phone)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
      await dbPool.query(
        `CREATE TABLE IF NOT EXISTS bf_wa_opt_in (
           phone VARCHAR(20) PRIMARY KEY,
           opted_in TINYINT(1) NOT NULL DEFAULT 1,
           source VARCHAR(40) NULL,
           updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
      // Missing-template and pricing-mismatch alerts. Created here so the table
      // exists from boot: logTemplateAlert() is also called from the send path
      // and must not depend on a prior failure having created it.
      await dbPool.query(
        `CREATE TABLE IF NOT EXISTS bf_wa_events_alert (
           id INT AUTO_INCREMENT PRIMARY KEY,
           order_id BIGINT NULL,
           status VARCHAR(40) NOT NULL,
           kind VARCHAR(40) NOT NULL,
           detail VARCHAR(255) NULL,
           created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
           INDEX idx_kind (kind),
           INDEX idx_status (status)
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
      await dbPool.query(
        `CREATE TABLE IF NOT EXISTS bf_wa_status_templates (
           status VARCHAR(30) PRIMARY KEY,
           title VARCHAR(120) NOT NULL,
           body MEDIUMTEXT NOT NULL,
           enabled TINYINT(1) NOT NULL DEFAULT 1,
           with_images TINYINT(1) NOT NULL DEFAULT 1,
           updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
         ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
      );
      // The table already existed from before this column was introduced, and
      // CREATE TABLE IF NOT EXISTS does not add columns to it. Add it
      // separately — pool.query takes ONE statement, passing a second was
      // silently dropped, which is why the column never appeared.
      try {
        await dbPool.query('ALTER TABLE bf_wa_status_templates ADD COLUMN with_images TINYINT(1) NOT NULL DEFAULT 1');
      } catch (e: any) {
        // ER_DUP_FIELDNAME just means a previous run already added it.
        if (String(e?.code) !== 'ER_DUP_FIELDNAME') {
          console.error('[WA Auto] could not add with_images column:', e?.message);
        }
      }
      // Owner-set corrections for names the resolver gets wrong or cannot read.
  await dbPool.query(
    `CREATE TABLE IF NOT EXISTS bf_wa_customer_gender (
       phone VARCHAR(20) PRIMARY KEY,
       honorific VARCHAR(10) NOT NULL DEFAULT '',
       updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
     ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
  );

      // Resolve the support number from bunon_settings once at boot, so a staff
      // edit of contact_phone reaches every template without a rebuild.
      try {
        const hp = await initHelpline();
        console.log('[WA Auto] helpline resolved: ' + hp);
      } catch (e: any) {
        console.error('[WA Auto] helpline lookup failed:', e?.message);
      }

  // Seed one message per status the shop actually uses. Placeholders are
      // filled per order, so one template covers every product and price.
      const seeds: [string, string, string][] = [
        ['pending', 'অর্ডার পাওয়া গেছে',
          'আসসালামু আলাইকুম {name} 🙏\n\nআপনার অর্ডারটি আমরা পেয়েছি। কিছুক্ষণের মধ্যে আমাদের টিম কনফার্ম করবে।\n\n🧾 অর্ডার: {invoice}{items}\n\n💰 মোট: {total}\n🚚 ডেলিভারি চার্জ: {delivery}\n🏠 ঠিকানা: {address}\n\nধন্যবাদ! — Bunon Fabrics'],
        ['confirmed', 'অর্ডার কনফার্ম',
          'আসসালামু আলাইকুম {name} ✅\n\nআপনার অর্ডারটি কনফার্ম হয়েছে।\n\n🧾 অর্ডার: {invoice}{items}\n\n💰 মোট: {total} ({payment})\n🏠 ঠিকানা: {address}\n\nশীঘ্রই কুরিয়ারে পাঠানো হবে। — Bunon Fabrics'],
        ['processing', 'অর্ডার প্রস্তুত হচ্ছে',
          'আসসালামু আলাইকুম {name}\n\nআপনার অর্ডারটি প্রস্তুত করা হচ্ছে।\n\n🧾 অর্ডার: {invoice}{items}\n💰 মোট: {total}\n\n— Bunon Fabrics'],
        ['packed', 'প্যাক হয়েছে',
          'আসসালামু আলাইকুম {name} 📦\n\nআপনার প্যাকেটটি প্যাক করা হয়েছে।\n\n🧾 অর্ডার: {invoice}{items}\n\nশীঘ্রই কুরিয়ারে হ্যান্ডওভার হবে। — Bunon Fabrics'],
        ['shipped', 'পাঠানো হয়েছে',
          'আসসালামু আলাইকুম {name} 🚚\n\nআপনার অর্ডারটি কুরিয়ারে পাঠানো হয়েছে।\n\n🧾 অর্ডার: {invoice}{items}\n💰 মোট: {total}\n\nট্র্যাকিং নম্বর শীঘ্রই জানানো হবে। — Bunon Fabrics'],
        ['in_transit', 'পথে আছে',
          'আসসালামু আলাইকুম {name} 🚚\n\nআপনার পার্সেলটি ডেলিভারির পথে আছে।\n\n🧾 অর্ডার: {invoice}\n📦 ট্র্যাকিং: {tracking}\n{tracking_link}ডেলিভারির দিন সাধারণত ১-৩ দিন। — Bunon Fabrics'],
        ['out_for_delivery', 'আজ ডেলিভারি হবে',
          'আসসালামু আলাইকুম {name} 🛵\n\nআপনার পার্সেলটি আজ ডেলিভারির পথে আছে।\n\n🧾 অর্ডার: {invoice}\n📦 ট্র্যাকিং: {tracking}\n\nদয়া করে ফোনটি সারাদিন চালু রাখবেন। — Bunon Fabrics'],
        ['delivered', 'ডেলিভারি সম্পন্ন',
          'আসসালামু আলাইকুম {name} 🎉\n\nআপনার অর্ডারটি ডেলিভারি হয়েছে। আশা করি পণ্যটি আপনার পছন্দ হয়েছে! 🙏\n\n🧾 অর্ডার: {invoice}\n💰 মোট: {total}\n\nআবার কিনতে চাইলে: {shop}\n\nযেকোনো সমস্যা জানাতে চাইলে এই নম্বরে মেসেজ দিন। — Bunon Fabrics'],
        ['cancelled', 'অর্ডার বাতিল',
          'আসসালামু আলাইকুম {name}\n\nদুঃখিত, আপনার অর্ডারটি বাতিল করা হয়েছে।\n\n🧾 অর্ডার: {invoice}\n📌 কারণ: {reason}\n\nকোনো সমস্যা হলে জানাবেন। — Bunon Fabrics'],
        ['canceled', 'অর্ডার বাতিল',
          'আসসালামু আলাইকুম {name}\n\nদুঃখিত, আপনার অর্ডারটি বাতিল করা হয়েছে।\n\n🧾 অর্ডার: {invoice}\n📌 কারণ: {reason}\n\nকোনো সমস্যা হলে জানাবেন। — Bunon Fabrics'],
        ['returned', 'রিটার্ন হয়েছে',
          'আসসালামু আলাইকুম {name}\n\nআপনার রিটার্নটি গ্রহণ করা হয়েছে।\n\n🧾 অর্ডার: {invoice}\n📌 কারণ: {reason}\n\nধন্যবাদ সহকারিতার জন্য। — Bunon Fabrics'],
        ['partial_return', 'আংশিক রিটার্ন',
          'আসসালামু আলাইকুম {name}\n\nআপনার অর্ডারের কিছু পণ্য ফেরত নেওয়া হয়েছে।\n\n🧾 অর্ডার: {invoice}{items}\n📌 কারণ: {reason}\n\n— Bunon Fabrics'],
      ];
      for (const [status, title, body] of seeds) {
        await dbPool.query(
          'INSERT IGNORE INTO bf_wa_status_templates (status, title, body) VALUES (?,?,?)',
          [status, title, body]
        );
      }
    })().catch((e) => console.error('[WA Auto] schema init failed:', e?.message));
  }
  return ready;
}

/**
 * Send the product photo(s) before the status text.
 *
 * A status message that only says "your order is on the way" makes the customer
 * open the app to check what they bought. Sending the actual photo alongside it
 * is what removes that step, and it is the single biggest upgrade to these
 * messages.
 *
 * The photo is fetched from our own sharp thumbnail endpoint rather than the
 * full-size original: WhatsApp re-encodes anything over ~1 MB anyway, and a
 * 640px WebP is ~30-60 KB, so the message goes out fast on a weak connection.
 * Products without a usable image are skipped silently — a missing photo must
 * never stop the status update itself.
 */
async function sendOrderImages(phone: string, orderId: number, items: any[], maxImages = 3): Promise<{ sent: number; skipped: number }> {
  let sent = 0, skipped = 0;
  if (!items.length) return { sent, skipped };

  // Resolve each line item to a real product so we have an image path even when
  // the order line stored a stale proxy URL.
  const ids = [...new Set(items.map((i) => Number(i.product_id)).filter((n) => Number.isInteger(n) && n > 0))];
  const pathById: Record<number, string> = {};
  if (ids.length) {
    try {
      const [prows]: any = await productDbPool.query(
        `SELECT id, thumbnail, local_images FROM bunon_products WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids
      );
      for (const p of prows as any[]) {
        const local = firstLocalPath(p.local_images) || firstLocalPath(p.thumbnail);
        if (local) pathById[Number(p.id)] = local;
      }
    } catch { /* fall back to the line item's own thumb */ }
  }

  const publicBase = (process.env.PUBLIC_BASE_URL || 'https://bunonfabrics.com').replace(/\/$/, '');
  let count = 0;
  for (const it of items) {
    if (count >= maxImages) break;
    const pid = Number(it.product_id);
    let src = pathById[pid] || firstLocalPath(it.product_thumb) || firstLocalPath(it.thumb) || firstLocalPath(it.image);
    if (!src) {
      // last resort: the line's stored URL may point at our own image proxy
      const raw = String(it.product_thumb || it.thumb || it.image || '');
      const m = raw.match(/image-proxy\?url=([^&]+)/);
      if (m) { try { src = firstLocalPath(decodeURIComponent(m[1])); } catch { /* ignore */ } }
    }
    if (!src) { skipped++; continue; }

    try {
      const thumbUrl = `${publicBase}/api/thumbs/640/640?src=${encodeURIComponent(src)}`;
      const r = await fetch(thumbUrl);
      if (!r.ok) { skipped++; continue; }
      const buf = Buffer.from(await r.arrayBuffer());
      if (!buf.length || buf.length > 5 * 1024 * 1024) { skipped++; continue; }

      const name = String(it.product_name || '').slice(0, 80);
      const qty = Number(it.qty || 1);
      const line = Number(it.line_total != null ? it.line_total : it.price);
      const caption = name ? `${name}${qty > 1 ? ` ×${qty}` : ''}\n💰 ${T(line)}` : '';

      const res = await bridgeSendImage(phone, buf.toString('base64'), caption);
      if (res.ok) { sent++; count++; }
      else skipped++;
    } catch {
      skipped++;
    }
  }
  return { sent, skipped };
}

/** Pull a /uploads or /image path out of a thumbnail field (string/array/JSON). */
function firstLocalPath(v: any): string | null {
  const visit = (x: any): string | null => {
    if (!x) return null;
    if (typeof x === 'string') {
      const t = x.trim();
      if (!t) return null;
      if (t[0] === '[' || t[0] === '{') { try { return visit(JSON.parse(t)); } catch { return null; } }
      const m = t.match(/image-proxy\?url=([^&]+)/);
      if (m) { try { return visit(decodeURIComponent(m[1])); } catch { return null; } }
      let p = t;
      try { p = new URL(t).pathname; } catch { /* already a path */ }
      return /^\/(uploads|image)\//i.test(p) ? p : null;
    }
    if (Array.isArray(x)) { for (const i of x) { const r = visit(i); if (r) return r; } return null; }
    if (typeof x === 'object') {
      for (const k of ['src', 'url', 'image', 'thumbnail', 'thumb', 'picture']) {
        const r = visit(x[k]);
        if (r) return r;
      }
    }
    return null;
  };
  return visit(v);
}

/**
 * The owner's correction for a customer the resolver got wrong.
 * '' means "use no kinship word at all", which is a real choice, so an empty
 * string is returned as-is rather than falling through to the automatic guess.
 */
/* ────────────────────────────── message ────────────────────────────── */

function itemLines(items: any[]): string {
  if (!items.length) return '';
  if (!items.length) return '';
  return (
    '\n' +
    items
      .map((it, i) => {
        const qty = Number(it.qty || 1);
        const name = String(it.product_name || 'পণ্য').slice(0, 90);
        const line = Number(it.line_total != null ? it.line_total : it.price);
        return `${i + 1}. ${name}${qty > 1 ? ` ×${qty}` : ''} — ${money(line)}`;
      })
      .join('\n')
  );
}

/**
 * The customer's name as they typed it on the order.
 *
 * Only whitespace is tidied and empty entries are collapsed. The "মোঃ" prefix
 * stays because customers type it themselves and it is how they expect to be
 * addressed. Nothing is added and nothing is removed from the name.
 */
function cleanName(raw: any): string {
  // Shared with waTemplates.cleanCustomerName: also drops a phone number that
  // was typed into the name box and the "Guest"/"test" placeholders, so the
  // greeting is either a real name or a neutral fallback.
  return cleanCustomerName(raw);
}

function render(template: string, o: any, items: any[], st: string): string {
  // Steadfast ships a ready-made public tracking link with every booking, so
  // use it rather than guessing a URL shape. Fall back to their public tracker
  // only if it is missing, and hide the line entirely when there is no code.
  const trackCode = o.courier_tracking_code || o.tracking_code || '';
  // Steadfast never returns a public tracking link: neither create_order nor
  // status_by_cid nor any webhook payload carries one, and the /tl/{token} links
  // only exist once a human generates them inside Steadfast's dashboard. So the
  // old guessed fallback
  //   https://www.steadfast.com.bd/track?tracking_number=...
  // 404s - that path does not exist on their site at all (verified, with and
  // without www). Every customer whose order lacked a saved URL was therefore
  // sent a dead link. We now fall back to our own tracker, which resolves the
  // parcel through /trackings_by_invoice and cannot rot.
  const savedUrl = String(o.courier_tracking_url || '').trim();
  const trackUrl =
    savedUrl ||
    (trackCode ? `${SITE}/track?code=${encodeURIComponent(trackCode)}` : '');
  const map: Record<string, string> = {
    // FIX-20: the greeting is the name exactly as typed on the order. A kinship
    // word is never added — not "ভাই", not "আপু" — because inferring a
    // customer's gender from a name is a guess, and a wrong one is worse than
    // none. The owner can still override the wording per customer.
    greeting: cleanName(o.customer_name) || 'ভাই/বোন',
    invoice: o.invoice || ('#' + o.id),
    total: money(o.total_payable),
    // delivery_fee = 0 means free, and "ডেলিভারি চার্জ: ৳0" reads like a
    // charge that was applied and lost. Say free.
    delivery: Number(o.delivery_fee || 0) > 0 ? money(o.delivery_fee) : 'ফ্রি',
    subtotal: money(o.subtotal),
    discount: money(o.discount_amount),
    address: [o.city, o.state, o.address].filter(Boolean).join(', ') || '—',
    items: itemLines(items),
    tracking: o.courier_tracking_code || o.tracking_code || 'শীঘ্রই জানানো হবে',
    tracking_url: trackUrl || '',
    // A bare 'লিংক:' with nothing after it looked broken to customers.
    tracking_link: trackUrl ? `\n🔗 লিংক: ${trackUrl}` : '',
    // Customer-safe reason only: return_reason / cancel_reason. internal_note
    // is a staff column and its contents (internal ids, pipeline notes) must
    // never be shown to a customer, so it is deliberately not a fallback.
    reason: useReturnReason(o) || '',
    payment: paymentBlock(o).replace(/^\n/, '').split('\n')[0].replace(/^\S+\s*/, '') || '',
    shop: 'https://bunonfabrics.com',

    // ── block variables (waTemplates) ──────────────────────────────────────
    customer_name: cleanName(o.customer_name),
    // আপনার সময়়লিক ররেশ্যে — no name stored → just "আসসালামু আলাইকুম, যিওয়ার মেগেছে\u201d, no dangling comma.
    name_suffix: cleanName(o.customer_name) ? ', ' + cleanName(o.customer_name) : '',
    order_number: o.invoice || ('#' + o.id),
    order_id: String(o.id),
    customer_phone: String(o.phone || ''),
    product_block: productBlock(items),
    address_block: addressBlock(o),
    payment_block: paymentBlock(o),
    pricing_block: pricingBlock(o),
    tracking_block: trackingBlock(o, { courierAssigned: hasCourier(o) }),
    helpline: helplineNumber(),
    helpline_line: `📞 সহায়তা: ${helplineNumber()}`,
    return_reason: useReturnReason(o),
    return_reason_line: reasonLine(o),
    cancel_reason: useReturnReason(o),
    cancel_reason_line: reasonLine(o),
    delivery_charge: money(o.delivery_fee),
    delivery_label: Number(o.delivery_fee || 0) > 0 ? `🚚 ডেলিভারি চার্জ: ${money(o.delivery_fee)}` : '🎁 হোম ডেলিভারি: ফ্রি',
    payment_type: String(o.payment_type || ''),
    payment_method: String(o.payment_method || ''),
    courier_name: String(o.courier_name || o.courier_code || ''),
    tracking_code: String(o.courier_tracking_code || o.tracking_code || o.consignment_id || ''),
    status: st,
  };
  // {{name}} with braces and {name} without both resolve, so a template copied
  // from the admin UI works exactly like one written by hand.
  let out = template
    .replace(/\{\{(\w+)\}\}/g, (m, k) => (k in map ? map[k] : m))
    .replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m));
  // Collapse the blank-line runs that an omitted block leaves behind.
  return out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim();
}


/** A reason line, or '' so the template drops it. Never invents a reason. */
function reasonLine(o: any): string {
  const r = useReturnReason(o);
  return r ? `\n📝 কারণ: ${r}` : '';
}

/** True once a courier is actually attached, so "ট্র্যাকিং শিগগিরই জানানো হবে"
 *  is only promised when a tracking number is genuinely still coming. */
function hasCourier(o: any): boolean {
  return !!(String(o?.courier_name || '').trim() || String(o?.courier_code || '').trim()
    || Number(o?.courier_consignment_id || 0) > 0);
}

/**
 * A missing template is a configuration fault, not a normal outcome, so it is
 * recorded where the admin can see it instead of vanishing. The table is
 * created lazily so this stays safe even before the first send.
 */
async function logTemplateAlert(orderId: any, status: string, reason: string) {
  try {
    await dbPool.query(
      `CREATE TABLE IF NOT EXISTS bf_wa_events_alert (
         id INT AUTO_INCREMENT PRIMARY KEY,
         order_id BIGINT NULL,
         status VARCHAR(40) NOT NULL,
         kind VARCHAR(40) NOT NULL,
         detail VARCHAR(255) NULL,
         created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
         INDEX idx_kind (kind),
         INDEX idx_status (status)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    );
    await dbPool.query(
      'INSERT INTO bf_wa_events_alert (order_id, status, kind, detail) VALUES (?,?,?,?)',
      [orderId || null, status, 'template', String(reason || '').slice(0, 250)]
    );
  } catch (e: any) {
    console.error('[WA Auto] could not record alert:', e?.message);
  }
}

/* ────────────────────────────── public API ────────────────────────────── */

/**
 * Send the message for one status change. Safe to call from anywhere, any
 * number of times: repeat calls for the same (order, status) are no-ops.
 */
export async function notifyOrderStatus(orderId: number | string, status: string, opts: { force?: boolean } = {}): Promise<{
 sent: boolean; reason: string; skipped?: boolean; status?: string }> {
  // Master outbound switch: see waStatusWatcher. Returns early with a reason the
  // caller can surface, instead of failing as a send error.
  if (String(process.env.WA_OUTBOUND_ENABLED ?? 'true').toLowerCase() === 'false') {
    console.warn(`[WA Auto] ${status} -> skipped (outbound disabled by WA_OUTBOUND_ENABLED)`);
    return { ok: false, skipped: true, reason: 'outbound_disabled', status };
  }
  try {
    await ensureSchema();

    let st = String(status || '').toLowerCase().trim();
    if (!st) return { sent: false, reason: 'no status' };

    // Resolve courier/sync aliases (intransit -> in_transit, cancell ->
    // cancelled) to the canonical status, but keep an alias row the shop has
    // actually customised.
    let [tplRows]: any = await dbPool.query(
      'SELECT status, title, body, with_images FROM bf_wa_status_templates WHERE status = ? AND enabled = 1',
      [st]
    );
    if (!tplRows.length) {
      const canon = canonicalStatus(st);
      if (canon !== st) {
        [tplRows] = await dbPool.query(
          'SELECT status, title, body, with_images FROM bf_wa_status_templates WHERE status = ? AND enabled = 1',
          [canon]
        );
      }
      if (tplRows.length) st = canon;
    }
    if (!tplRows.length) {
      // Silent skip is the bug this fixes: record it so the admin can see that
      // a customer-visible status has no template at all.
      await logTemplateAlert(orderId, st, 'no enabled template for status');
      console.error(`[WA Auto] MISSING TEMPLATE for status "${st}" (order ${orderId}) - customer NOT notified`);
      return { sent: false, reason: `no enabled template for status "${st}"` };
    }
    const tpl = tplRows[0];

    const [oRows]: any = await dbPool.query('SELECT * FROM bf_orders WHERE id = ? LIMIT 1', [orderId]);
    if (!oRows.length) return { sent: false, reason: 'order not found' };
    const order = oRows[0];

    const phone = normPhone(order.phone);
    if (!phone) return { sent: false, reason: 'customer phone is missing or not a valid BD number' };

    const [iRows]: any = await dbPool.query('SELECT * FROM bf_order_items WHERE order_id = ? ORDER BY id ASC', [orderId]);

    // A footer total that disagrees with its own components means the order row
    // is wrong, not the template. Surface it rather than quietly showing our
    // own arithmetic; the stored total_payable is still what we send.
    const mismatch = pricingMismatch(order, iRows as any[]);
    if (mismatch) {
      console.error(`[WA Auto] ${st} order ${orderId}: ${mismatch}`);
      await logTemplateAlert(orderId, st, mismatch);
    }

    const rendered = render(tpl.body, order, iRows as any[], st);
    const { text: body, fixes } = sanitizeMessage(rendered);
    if (fixes.length) {
      console.warn(`[WA Auto] ${st} order ${orderId} sanitizer: ${fixes.join(' | ')}`);
      await logTemplateAlert(orderId, st, 'sanitized: ' + fixes.join(' | '));
    }

    // Claim the send. The UNIQUE key is what guarantees one message per
    // (order, status) even if two requests race.
    let claimId: number;
    try {
      const [ins]: any = await dbPool.query(
        'INSERT INTO bf_wa_order_events (order_id, status, phone, body, state) VALUES (?,?,?,?,?)',
        [orderId, st, phone, body, 'queued']
      );
      claimId = ins.insertId;
    } catch (e: any) {
      if (String(e?.code) === 'ER_DUP_ENTRY') {
        if (!opts.force) return { sent: false, reason: 'already sent for this status (duplicate suppressed)' };
        await dbPool.query('DELETE FROM bf_wa_order_events WHERE order_id = ? AND status = ?', [orderId, st]);
        const [ins2]: any = await dbPool.query(
          'INSERT INTO bf_wa_order_events (order_id, status, phone, body, state) VALUES (?,?,?,?,?)',
          [orderId, st, phone, body, 'queued']
        );
        claimId = ins2.insertId;
      } else throw e;
    }

    // Opt-out wins over everything.
    const [optRows]: any = await dbPool.query('SELECT opted_in FROM bf_wa_opt_in WHERE phone = ?', [phone]);
    if (optRows.length && Number(optRows[0].opted_in) === 0) {
      await dbPool.query("UPDATE bf_wa_order_events SET state='opted_out', sent_at=NOW() WHERE id=?", [claimId]);
      return { sent: false, reason: 'customer opted out' };
    }

    // Photos first, then the text: the customer sees what they bought before
    // they read the status. Failures here are counted, never fatal.
    let imgInfo = { sent: 0, skipped: 0 };
    if (Number(tpl.with_images) === 1) {
      try {
        imgInfo = await sendOrderImages(phone, Number(orderId), iRows as any[]);
        if (imgInfo.sent) console.log(`[WA Auto] ${imgInfo.sent} product photo(s) -> ${phone}`);
      } catch (e: any) {
        console.error('[WA Auto] image send failed (text still going out):', e?.message);
      }
    }

    const res = await bridgeSendText(phone, body);
    await dbPool.query(
      "UPDATE bf_wa_order_events SET state=?, error=?, sent_at=NOW() WHERE id=?",
      [res.ok ? 'sent' : 'failed', res.error ? String(res.error).slice(0, 250) : null, claimId]
    );
    if (res.ok) console.log(`[WA Auto] ${st} -> ${phone} (order ${orderId})`);
    else console.error(`[WA Auto] ${st} -> ${phone} FAILED: ${res.error}`);
    return res.ok
      ? { sent: true, reason: 'sent' + (imgInfo.sent ? ` (with ${imgInfo.sent} photo(s))` : '') }
      : { sent: false, reason: res.error || 'send failed' };
  } catch (e: any) {
    console.error('[WA Auto] notifyOrderStatus error:', e?.message);
    return { sent: false, reason: e?.message || 'unexpected error' };
  }
}

/** Render a status message without sending it — used by the admin preview. */
export async function previewOrderStatus(orderId: number | string, status: string): Promise<{ ok: boolean; body?: string; title?: string; reason?: string }> {
  try {
    await ensureSchema();
    const raw = String(status).toLowerCase();
    let [t]: any = await dbPool.query('SELECT status,title,body FROM bf_wa_status_templates WHERE status=?', [raw]);
    if (!t.length) {
      const canon = canonicalStatus(raw);
      if (canon !== raw) [t] = await dbPool.query('SELECT status,title,body FROM bf_wa_status_templates WHERE status=?', [canon]);
    }
    if (!t.length) return { ok: false, reason: 'no template for this status' };
    const [o]: any = await dbPool.query('SELECT * FROM bf_orders WHERE id=? LIMIT 1', [orderId]);
    if (!o.length) return { ok: false, reason: 'order not found' };
    const [i]: any = await dbPool.query('SELECT * FROM bf_order_items WHERE order_id=? ORDER BY id', [orderId]);
    const { text } = sanitizeMessage(render(t[0].body, o[0], i as any[], raw));
    return { ok: true, title: t[0].title, body: text };
  } catch (e: any) {
    return { ok: false, reason: e?.message };
  }
}
