/**
 * Reusable block renderers + production templates for Bunon Fabrics.
 *
 * Split out of waOrderStatus.ts on purpose: that file is the send path and is
 * working in production, so this module only ADDS the block renderers and the
 * 14 canonical status bodies. Everything the old render() supported
 * ({name}, {invoice}, {total}, {items}, {address}, {delivery}, {discount},
 * {payment}, {tracking}, {tracking_url}, {tracking_link}, {reason}, {shop})
 * keeps working, so no existing template breaks.
 *
 * The one behaviour change on purpose: `reason` no longer falls back to
 * internal_note. That column holds staff notes like
 * "Converted from Website Incomplete Order INC-472", and a customer must never
 * see an internal id or a pipeline annotation. useReturnReason() is the
 * customer-safe source and returns '' when nothing real is stored, so the
 * template's {return_reason} / {cancel_reason} line drops out entirely.
 */

// Canonical public origin. Every customer-facing link is built from this.
// It was previously referenced as `${SITE}` in this file but never declared
// here - only publicTrack.ts had its own copy. Because waTemplates.ts is
// imported by waOrderStatus.ts, the undefined identifier threw a
// ReferenceError inside the render path, which aborted the WHOLE status
// message (28 occurrences logged on 2026-10-05), not just the link. Fixed
// 2026-10-05.
const SITE = (process.env.SEO_ORIGIN || process.env.DOMAIN_URL || 'https://bunonfabrics.com').replace(/\/+$/, '');

/* ─────────────────────────── formatting helpers ─────────────────────────── */

const T = (n: any) => '৳' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const money = (n: any) => T(Number(n || 0));
const num = (v: any): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const DIVIDER = '━━━━━━━━━━━━━━';

/**
 * The customer's name exactly as they typed it on the order.
 *
 * Garbage that is clearly not a name gets dropped rather than greeted:
 * a phone number, an all-digit string, or one of the placeholder words the
 * checkout falls back to. A kinship word is never added — inferring gender
 * from a name is a guess, and "Guest ভাই" reads worse than no word at all.
 */
export function cleanName(raw: any): string {
  let s = String(raw == null ? '' : raw)
    .replace(/\s+/g, ' ')
    .replace(/[<>{}\[\]`\\]/g, '')
    .trim()
    .slice(0, 80);
  if (!s) return '';
  const digits = s.replace(/\D/g, '');
  // Purely numeric, or a phone number with a +/0 prefix, is not a name.
  if (digits && digits.length >= 7 && digits.length >= s.replace(/\s/g, '').length) return '';
  // Placeholder values the site itself writes when no name was given.
  if (/^(guest|customer|unknown|n\/a|null|undefined|test|user|নাম)\b/i.test(s)) return '';
  return s;
}

/** Greeting used as {name}. Neutral: no kinship word, ever. */
export function greetingFor(order: any): string {
  const n = cleanName(order?.customer_name);
  return n || 'ভাই/বোন';
}

/** Customer-safe reason text, or '' so the caller omits the line. */
export function useReturnReason(order: any): string {
  const candidates = [order?.return_reason, order?.cancel_reason, order?.cancellation_reason];
  for (const c of candidates) {
    const v = String(c == null ? '' : c).trim();
    if (!v) continue;
    // An internal note is not a customer-facing reason. Refuse anything that
    // looks like a pipeline annotation or an internal id.
    if (/INC-\d+|bf_orders|website incomplete|converted from/i.test(v)) continue;
    return v.slice(0, 300);
  }
  return '';
}

/**
 * The store's support number.
 *
 * Priority: bunon_settings.contact_phone (the row staff can edit) -> SHOP_PHONE
 * env -> the last-resort fallback. The setting lives in the PRODUCT database
 * (bunon_shop_db), not the dash database, which is why this needs the product
 * pool. Resolved once and cached for 5 minutes: one extra query per process
 * rather than one per outgoing message.
 */
const HELPLINE_FALLBACK = '09611900606';
const HELPLINE_TTL_MS = 5 * 60_000;
let helplineCache: { value: string; at: number } | null = null;

/** Synchronous read of the cached value, for template rendering. */
export function helpline(): string {
  if (helplineCache && Date.now() - helplineCache.at < HELPLINE_TTL_MS) return helplineCache.value;
  return String(process.env.SHOP_PHONE || '').trim() || helplineCache?.value || HELPLINE_FALLBACK;
}

/**
 * Warm the cache from bunon_settings. Called once when the automation boots so
 * a staff edit of contact_phone reaches the templates without a rebuild.
 */
export async function initHelpline(): Promise<string> {
  const fromEnv = String(process.env.SHOP_PHONE || '').trim();
  let value = fromEnv || HELPLINE_FALLBACK;
  try {
    // Imported lazily so this module stays usable from plain render tests.
    const { productDbPool } = await import('./db');
    const [rows]: any = await productDbPool.query(
      "SELECT setting_value FROM bunon_settings WHERE setting_key = 'contact_phone' LIMIT 1"
    );
    const v = String(rows?.[0]?.setting_value || '').trim();
    if (v) value = v;
  } catch {
    // bunon_settings may be absent on a fresh shop; keep env/fallback.
  }
  helplineCache = { value, at: Date.now() };
  return value;
}

export function helplineLine(): string {
  return `📞 সহায়তা: ${helpline()}`;
}

/* ───────────────────────────── block renderers ──────────────────────────── */

/**
 * Product lines. Long English product names are wrapped rather than cut, so
 * the customer can still tell two similar items apart — truncation would lose
 * the product's identity, which is the one thing this line must not do.
 */
export function productBlock(items: any[], opts: { withPrices?: boolean } = {}): string {
  if (!Array.isArray(items) || items.length === 0) return '';
  const lines = items.map((it, i) => {
    const qty = Math.max(1, Math.round(num(it.qty)));
    const name = wrapProductName(String(it.product_name || 'পণ্য'), 58);
    const unit = num(it.price);
    const lineTotal = it.line_total != null ? num(it.line_total) : unit * qty;
    const head = `${i + 1}️⃣ ${name}`;
    if (opts.withPrices === false) return qty > 1 ? `${head}\n   পরিমাণ: ${qty}টি` : head;
    return `${head}\n   পরিমাণ: ${qty} × ${money(unit)}\n   মূল্য: ${money(lineTotal)}`;
  });
  return '\n🛍️ অর্ডারের পণ্য\n' + lines.join('\n');
}

/** Break a long name on word boundaries; hard-split only if one word is huge. */
function wrapProductName(name: string, width: number): string {
  const clean = name.replace(/\s+/g, ' ').trim();
  if (clean.length <= width) return clean;
  const words = clean.split(' ');
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    if (!line.length) { line = w; continue; }
    if ((line + ' ' + w).length <= width) line += ' ' + w;
    else { out.push(line); line = w; }
  }
  if (line) out.push(line);
  // A single word longer than the width still has to be cut to stay readable.
  return out.map((l) => (l.length <= width ? l : l.slice(0, width - 1) + '…')).join('\n   ');
}

/**
 * Money summary straight from the order row.
 *
 * delivery_fee = 0 must read "🎁 হোম ডেলিভারি: ফ্রি", never "৳0" — a customer
 * reading "ডেলিভারি চার্জ: ৳0" assumes something was added and then lost.
 * A zero discount is omitted rather than shown as "−৳0".
 *
 * The footer total is always the stored total_payable, never a recomputed sum:
 * the server price is the authoritative one, and if the components genuinely
 * disagree we surface that to the log instead of quietly showing our own maths.
 */
export function pricingBlock(order: any): string {
  const itemsTotal = itemsSubtotal(order);
  const subtotal = num(order?.subtotal) || itemsTotal;
  const discount = num(order?.discount_amount) || num(order?.discount);
  const delivery = num(order?.delivery_fee);
  const total = num(order?.total_payable);

  const lines: string[] = ['💰 অর্ডার সারাংশ', `পণ্যের মূল্য: ${money(subtotal)}`];
  if (discount > 0) lines.push(`ডিসকাউন্ট: −${money(discount)}`);
  lines.push(delivery > 0 ? `🚚 ডেলিভারি চার্জ: ${money(delivery)}` : '🎁 হোম ডেলিভারি: ফ্রি');
  lines.push(DIVIDER);
  lines.push(`💵 সর্বমোট: ${money(total)}`);
  return '\n' + lines.join('\n');
}

/** Sum the line items; used when bf_orders.subtotal was never filled in. */
export function itemsSubtotal(order: any, items?: any[]): number {
  if (Array.isArray(items) && items.length) {
    return items.reduce((s, it) => {
      const qty = Math.max(1, Math.round(num(it.qty)));
      return s + (it.line_total != null ? num(it.line_total) : num(it.price) * qty);
    }, 0);
  }
  return 0;
}

/**
 * Consistency check for the footer. Returns a human sentence when the stored
 * components do not add up to the stored total, '' when they do. The caller
 * logs it; the customer still sees the authoritative total.
 */
export function pricingMismatch(order: any, items?: any[]): string {
  const subtotal = num(order?.subtotal) || itemsSubtotal(order, items);
  const discount = num(order?.discount_amount) || num(order?.discount);
  const delivery = num(order?.delivery_fee);
  const total = num(order?.total_payable);
  const expect = subtotal - discount + delivery;
  if (Math.abs(expect - total) > 1) {
    return `pricing mismatch: subtotal ${subtotal} - discount ${discount} + delivery ${delivery} = ${expect}, but total_payable = ${total}`;
  }
  return '';
}

/**
 * Address as separate lines, skipping whatever is not actually stored so the
 * message never ends up with a dangling comma or a bare "—".
 */
export function addressBlock(order: any): string {
  // A line that is only punctuation/emoji ("#;#*#*", "---", "??") is not an
  // address: the customer typed something into the box but there is nothing to
  // deliver to. Showing it verbatim looks broken, so such a line is dropped and
  // the block disappears entirely when nothing real remains.
  const usable = (v: any): string => {
    const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!t) return '';
    const meaningful = t.replace(/[^\p{L}\p{N}]/gu, '');
    if (meaningful.length < 3) return '';
    return t;
  };
  const parts: string[] = [];
  const raw = usable(order?.address);
  if (raw) parts.push(raw);
  const state = usable(order?.state);
  const city = usable(order?.city);
  // city holds the district/city in this schema; state the area/upazila.
  if (state) parts.push(state);
  if (city) parts.push(city);
  if (!parts.length) return '';
  return '\n📍 ডেলিভারি ঠিকানা\n' + parts.join('\n');
}

/**
 * Payment from the real fields. payment_method being NULL must NOT be read as
 * COD — the shop records the mode in payment_type ('cod' | 'advance'), and
 * money actually collected lives in advance / cod_collected.
 */
export function paymentBlock(order: any): string {
  const type = String(order?.payment_type || '').trim().toLowerCase();
  const method = String(order?.payment_method || '').trim().toLowerCase();
  const advance = num(order?.advance);
  const due = num(order?.due_amount);
  const lines: string[] = [];

  const isCod = type === 'cod' || method === 'cod' || method === 'cash_on_delivery' || method === 'cod';
  const isAdvance = type === 'advance' || method === 'advance' || method === 'online' || method === 'bkash' || method === 'nagad';

  if (isAdvance) {
    lines.push('💳 পেমেন্ট: অগ্রিম পরিশোধ করা হয়েছে');
    if (advance > 0) lines.push(`💵 অগ্রিম: ${money(advance)}`);
    if (due > 0) lines.push(`💵 বাকি: ${money(due)}`);
  } else if (isCod) {
    lines.push('💳 পেমেন্ট: ক্যাশ অন ডেলিভারি');
    if (advance > 0) lines.push(`💵 অগ্রিম: ${money(advance)}`);
    if (due > 0) lines.push(`💵 ডেলিভারিতে পরিশোধ: ${money(due)}`);
  } else if (method) {
    // Unknown but real gateway name: show it as-is rather than guessing a mode.
    lines.push(`💳 পেমেন্ট: ${method}`);
    if (due > 0) lines.push(`💵 বাকি: ${money(due)}`);
  }
  // Neither payment_type nor payment_method stored: omit the block entirely
  // rather than assert a payment mode we do not actually know.
  return lines.length ? '\n' + lines.join('\n') : '';
}

/**
 * Courier + tracking. Steadfast ships a ready-made public tracking URL with
 * every booking, so use theirs instead of guessing a URL shape. With no code
 * we say it will be shared shortly — never invent a number, and never promise
 * one if the order was never actually handed to a courier.
 */
export function trackingBlock(order: any, opts: { courierAssigned?: boolean } = {}): string {
  const code = String(order?.courier_tracking_code || order?.tracking_code || order?.consignment_id || '').trim();
  const courier = String(order?.courier_name || order?.courier_code || '').trim();
  // See waOrderStatus.ts: Steadfast publishes no tracking link through its API
  // or webhooks, and the guessed /track?tracking_number= path 404s. Fall back to
  // our own tracker instead of sending the customer a dead link.
  const url = String(order?.courier_tracking_url || '').trim()
    || (code ? `${SITE}/track?code=${encodeURIComponent(code)}` : '');
  const lines: string[] = [];
  if (courier) lines.push(`🚚 কুরিয়ার: ${courier}`);
  if (code) {
    lines.push(`🔎 ট্র্যাকিং: ${code}`);
    if (url) lines.push(`🔗 লিংক: ${url}`);
  } else if (opts.courierAssigned) {
    lines.push('ট্র্যাকিং তথ্য শিগগিরই জানানো হবে।');
  }
  return lines.length ? '\n' + lines.join('\n') : '';
}

/* ───────────────────────── production templates ─────────────────────────── */

/**
 * The 14 canonical customer-visible statuses. Bodies use {{block}} markers and
 * are stored in bf_wa_status_templates, so staff can still edit the wording
 * from the admin UI; the blocks are resolved at render time.
 */
export const STATUS_TEMPLATES: Record<string, { title: string; body: string; withImages?: number }> = {
  pending: {
    title: 'অর্ডারটি পেয়েছি',
    withImages: 1,
    body: [
      `${DIVIDER} 📋 অর্ডারটি পেয়েছি ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার অর্ডারটি আমরা সফলভাবে পেয়েছি।',
      'আমাদের একজন প্রতিনিধি খুব শিগগিরই ফোন করে আপনার অর্ডারটি কনফার্ম করবেন।',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{product_block}}',
      '{{address_block}}',
      '{{payment_block}}',
      '{{pricing_block}}',
      '',
      '📞 অর্ডারটি কনফার্ম করার জন্য অনুগ্রহ করে ফোনটি চালু রাখুন।',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  confirmed: {
    title: 'অর্ডার কনফার্ম হয়েছে',
    body: [
      `${DIVIDER} ✅ অর্ডার কনফার্ম হয়েছে ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার অর্ডারটি সফলভাবে কনফার্ম হয়েছে। 🎉',
      'আমরা এখন আপনার পণ্যটি প্রস্তুত করছি।',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{product_block}}',
      '{{pricing_block}}',
      '{{address_block}}',
      '',
      'খুব শিগগিরই আপনার অর্ডারের পরবর্তী আপডেট জানানো হবে।',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  processing: {
    title: 'পণ্য প্রস্তুত হচ্ছে',
    body: [
      `${DIVIDER} 🏷️ পণ্য প্রস্তুত হচ্ছে ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার অর্ডারের পণ্যটি এখন প্রস্তুত করা হচ্ছে। 📦',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{product_block}}',
      '{{pricing_block}}',
      '',
      'শিগগিরই পণ্যটি প্যাক করে পরবর্তী ধাপে পাঠানো হবে।',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  packed: {
    title: 'প্যাকেট প্রস্তুত হয়েছে',
    withImages: 1,
    body: [
      `${DIVIDER} 📦 প্যাকেট প্রস্তুত হয়েছে ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার অর্ডারের প্যাকেটটি সফলভাবে প্যাক করা হয়েছে। ✅',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{product_block}}',
      '',
      'আপনার পার্সেলটি এখন কুরিয়ারে হ্যান্ডওভার করার জন্য প্রস্তুত।',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  ready_to_ship: {
    title: 'কুরিয়ারে পাঠানোর জন্য প্রস্তুত',
    body: [
      `${DIVIDER} 📦 কুরিয়ারে পাঠানোর জন্য প্রস্তুত ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার অর্ডারটি সফলভাবে প্রস্তুত হয়েছে। ✅',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{product_block}}',
      '{{pricing_block}}',
      '',
      'আপনার পার্সেলটি এখন কুরিয়ারে হ্যান্ডওভার করার অপেক্ষায় রয়েছে।',
      'হ্যান্ডওভার সম্পন্ন হলে আপনাকে কুরিয়ার ও ট্র্যাকিং তথ্য জানানো হবে।',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  shipped: {
    title: 'কুরিয়ারে পাঠানো হয়েছে',
    body: [
      `${DIVIDER} 📮 কুরিয়ারে পাঠানো হয়েছে ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার পার্সেলটি সফলভাবে কুরিয়ারে হ্যান্ডওভার করা হয়েছে। 📦🚚',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{tracking_block}}',
      '',
      'পার্সেলটি এখন আপনার ঠিকানার দিকে যাত্রা করছে।',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  on_hold: {
    title: 'অর্ডারটি হোল্ডে আছে',
    body: [
      `${DIVIDER} ⚠️ অর্ডারটি হোল্ডে আছে ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার সাথে অর্ডারটি কনফার্ম করার জন্য যোগাযোগ করার চেষ্টা করা হয়েছিল, কিন্তু আপনাকে পাওয়া যায়নি।',
      'তাই আপনার অর্ডারটি আপাতত হোল্ডে রাখা হয়েছে।',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '',
      '📞 সহায়তার জন্য: {{helpline}}',
      'অনুগ্রহ করে আমাদের সাথে যোগাযোগ করুন। অর্ডার কনফার্ম হওয়ার পরই এটি কুরিয়ারে পাঠানো হবে।',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  in_transit: {
    title: 'পার্সেল পথে আছে',
    body: [
      `${DIVIDER} 🚚 পার্সেল পথে আছে ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার পার্সেলটি কুরিয়ারে হ্যান্ডওভার করা হয়েছে এবং এখন আপনার ঠিকানার দিকে যাচ্ছে। 🚚',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{tracking_block}}',
      '',
      'পার্সেলটি পৌঁছানোর সময় কুরিয়ার থেকে আপনার সাথে ফোনে যোগাযোগ করা হতে পারে।',
      '{{helpline_line}}',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  out_for_delivery: {
    title: 'আজ ডেলিভারি হবে',
    body: [
      `${DIVIDER} 🛵 আজ ডেলিভারি হবে ${DIVIDER}`,
      '',
      'সুসংবাদ{{name_suffix}}! 🎉',
      '',
      'আপনার পার্সেলটি আজ ডেলিভারির জন্য বের হয়েছে।',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{tracking_block}}',
      '',
      '📱 অনুগ্রহ করে ফোনটি চালু রাখুন। ডেলিভারি রাইডার আপনার সাথে যোগাযোগ করতে পারেন।',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  delivered: {
    title: 'অর্ডার ডেলিভারি সম্পন্ন',
    body: [
      `${DIVIDER} 🎉 অর্ডার ডেলিভারি সম্পন্ন ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার অর্ডারটি সফলভাবে ডেলিভারি সম্পন্ন হয়েছে। ❤️',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{product_block}}',
      '{{pricing_block}}',
      '',
      'Bunon Fabrics-এর সাথে কেনাকাটা করার জন্য আন্তরিক ধন্যবাদ। 🌸',
      'পণ্য নিয়ে কোনো সমস্যা বা সহায়তার প্রয়োজন হলে আমাদের সাথে যোগাযোগ করুন:',
      '{{helpline_line}}',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  partial_delivered: {
    title: 'আংশিক ডেলিভারি সম্পন্ন',
    // No product images: showing only part of the order next to photos of
    // everything is more confusing than the text alone.
    withImages: 0,
    body: [
      `${DIVIDER} 📦 আংশিক ডেলিভারি সম্পন্ন ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার অর্ডারের কিছু পণ্য সফলভাবে ডেলিভারি হয়েছে।',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{product_block}}',
      '',
      'বাকি পণ্যগুলোর স্ট্যাটাস অনুযায়ী পরবর্তী আপডেট আপনাকে জানানো হবে।',
      '{{helpline_line}}',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  partial_returned: {
    title: 'আংশিক রিটার্ন গ্রহণ করা হয়েছে',
    withImages: 0,
    body: [
      `${DIVIDER} 📥 আংশিক রিটার্ন গ্রহণ করা হয়েছে ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার অর্ডারের কিছু পণ্য আমাদের কাছে রিটার্ন হিসেবে গ্রহণ করা হয়েছে।',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{product_block}}',
      '{{return_reason_line}}',
      '',
      'রিটার্ন সংক্রান্ত কোনো সহায়তার প্রয়োজন হলে:',
      '{{helpline_line}}',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  cancelled: {
    title: 'অর্ডার বাতিল হয়েছে',
    withImages: 0,
    body: [
      `${DIVIDER} 🚫 অর্ডার বাতিল হয়েছে ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার অর্ডারটি বাতিল করা হয়েছে। দুঃখিত।',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{cancel_reason_line}}',
      '',
      'কোনো প্রশ্ন থাকলে আমাদের সাথে যোগাযোগ করুন:',
      '{{helpline_line}}',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
  returned: {
    title: 'রিটার্ন গ্রহণ করা হয়েছে',
    withImages: 0,
    body: [
      `${DIVIDER} 📥 রিটার্ন গ্রহণ করা হয়েছে ${DIVIDER}`,
      '',
      'আসসালামু আলাইকুম{{name_suffix}} 🌸',
      '',
      'আপনার রিটার্ন করা পার্সেলটি আমরা সফলভাবে পেয়েছি। ✅',
      '',
      '🧾 অর্ডার: {{order_number}}',
      '{{return_reason_line}}',
      '',
      'রিটার্ন সংক্রান্ত পরবর্তী প্রক্রিয়া সম্পন্ন হলে প্রয়োজনীয় তথ্য আপনাকে জানানো হবে।',
      '{{helpline_line}}',
      'সহযোগিতার জন্য ধন্যবাদ। ❤️',
      '',
      '— Bunon Fabrics',
    ].join('\n'),
  },
};

/**
 * Aliases the courier/sync layer writes that mean the same thing to a customer.
 * They keep the old bodies working (we do not delete rows), but the canonical
 * status is what staff edit. notifyOrderStatus() resolves to the canonical
 * template when no alias row exists for the incoming status.
 */
export const STATUS_ALIASES: Record<string, string> = {
  confirm: 'confirmed',
  confimed: 'confirmed',
  cancel: 'cancelled',
  canceled: 'cancelled',
  cancell: 'cancelled',
  partial_canceled: 'cancelled',
  onhold: 'on_hold',
  'on-hold': 'on_hold',
  hold: 'on_hold',
  packed_done: 'packed',
  intransit: 'in_transit',
  on_the_way: 'in_transit',
  complete: 'delivered',
  completed: 'delivered',
  courier_complete: 'delivered',
  outfordelivery: 'out_for_delivery',
  partial_delivered_status: 'partial_delivered',
  partial_return: 'partial_returned',
  return: 'returned',
  return_delivered: 'returned',
  return_in_transit: 'returned',
};

/** Every customer-visible status that MUST have an enabled template. */
export const REQUIRED_STATUSES = Object.keys(STATUS_TEMPLATES);

/**
 * Resolve an incoming status to the canonical template key. An alias row that
 * the shop has customised keeps its own body, so the alias is only a fallback
 * for when nothing exists under the raw status.
 */
export function canonicalStatus(status: string): string {
  const s = String(status || '').trim().toLowerCase();
  return STATUS_ALIASES[s] || s;
}

/* ────────────────────────── safety net / sanitizer ──────────────────────── */

/**
 * Last line of defence before a message leaves the building.
 *
 * Anything that would look broken or leak internals is either replaced with
 * something readable or removed: an unresolved {{placeholder}}, a literal
 * undefined/NaN/null, an internal id, or a leaked error string.
 */
export function sanitizeMessage(text: string): { text: string; fixes: string[] } {
  const fixes: string[] = [];
  let out = String(text || '');

  // Unresolved placeholders: drop the line rather than show raw braces.
  const leftover = out.match(/\{\{\s*\w+\s*\}\}|\{\s*\w+\s*\}/g);
  if (leftover) {
    fixes.push(`removed ${leftover.length} unresolved placeholder(s): ${[...new Set(leftover)].join(', ')}`);
    out = out.replace(/[ \t]*\{\{\s*\w+\s*\}\}|\{\s*\w+\s*\}\n?/g, '');
  }

  // Literal undefined / NaN / null anywhere in the text.
  const bad = out.match(/\b(undefined|NaN|null)\b/g);
  if (bad) {
    fixes.push(`removed literal ${[...new Set(bad)].join(', ')}`);
    out = out.replace(/\bundefined\b/g, '').replace(/\bNaN\b/g, '').replace(/\bnull\b/g, '');
  }

  // Internal identifiers must never reach a customer.
  const leak = out.match(/\bINC-\d+\b|\bbf_orders\b|\bbf_order_items\b|\bbunon_shop_db\b|\bbunonfabrics_dash_db\b/gi);
  if (leak) {
    fixes.push(`stripped internal reference(s): ${[...new Set(leak)].join(', ')}`);
    out = out.replace(/\s*\b(?:INC-\d+|bf_orders|bf_order_items|bunon_shop_db|bunonfabrics_dash_db)\b\s*/gi, ' ');
  }

  // A literal zero delivery charge reads as a charge that disappeared. The
  // real templates never produce it (the 0 case takes the "ফ্রি" branch), but a
  // staff-written one using {delivery_fee} would.
  const zeroShip = out.match(/(ডেলিভারি চার্জ|delivery charge)\s*[:\-]\s*৳0/gi);
  if (zeroShip) {
    fixes.push(`replaced ${zeroShip.length} zero delivery charge(s) with free-delivery wording`);
    out = out.replace(/(ডেলিভারি চার্জ|delivery charge)\s*[:\-]\s*৳0/gi, 'ডেলিভারি চার্জ: ফ্রি');
  }

  // Collapse the blank lines that stripping may have left behind, and never
  // return a message that starts or ends with whitespace.
  out = out.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim();

  return { text: out, fixes };
}