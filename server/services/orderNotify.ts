/**
 * server/services/orderNotify.ts — T4
 * Order Telegram alerts for bunon.shop.
 * Parity port of /planner/tg_bot.php transport logic (tg() + sendText()):
 *   - Bot API sendMessage via POST with timeouts
 *   - 3900-char chunking on line boundaries
 * Code-only: reads existing env (TELEGRAM_BOT_TOKEN, TELEGRAM_RECRUITMENT_CHANNEL_ID).
 * No token/chat changes. Fire-and-forget — never throws into checkout.
 */

import { getSecret } from '../utils/secrets';
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const CHAT_ID = process.env.TELEGRAM_ORDER_CHAT_ID || process.env.TELEGRAM_RECRUITMENT_CHANNEL_ID || '';
const TIMEOUT_MS = 15000;
const MAX_LEN = 3900;

async function courierLine(phone: string): Promise<string | null> {
  try {
    const ph = String(phone || '').replace(/\D+/g, '');
    if (ph.length < 6) return null;
    const apiKey = await getSecret('hoorin_api_key');
    if (!apiKey) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 7000);
    try {
      const r: any = await fetch('https://plugin.hoorin.com/courier/api/v1/search?apiKey=' + encodeURIComponent(apiKey) + '&searchTerm=' + encodeURIComponent(ph) + '&view=full', { signal: ctl.signal as any }).then((x) => x.json().catch(() => null));
      const ov = (r && r.overall) || {};
      const total = Number(ov.total_parcels) || 0;
      const del = Number(ov.delivered_parcels) || 0;
      const canc = Number(ov.cancelled_parcels) || 0;
      const pct = total > 0 ? +((del * 100) / total).toFixed(1) : 0;
      const cq = (r && r.couriers) || {};
      const cn = (k: string) => {
        const c = cq[k] || {};
        const t = Number(c.total_parcels) || 0, d = Number(c.delivered_parcels) || 0;
        return d + '/' + t;
      };
      let score: number | null = null;
      try {
        const ak = await getSecret('steadfast_api_key');
        const sk = await getSecret('steadfast_secret_key');
        if (ak && sk) {
          const s2: any = await fetch('https://portal.packzy.com/api/v1/fraud_check/score/' + encodeURIComponent(ph), { headers: { 'Api-Key': ak, 'Secret-Key': sk }, signal: ctl.signal as any }).then((x) => x.json().catch(() => null));
          if (s2 && s2.status === 200 && s2.score !== null && s2.score !== undefined) score = Number(s2.score);
        }
      } catch { /* score optional */ }
      if (total === 0 && score === null) return null;
      if (total === 0) return '📊 কুরিয়ার: নতুন (SF ' + score + '/100)';
      const tag = score === null ? '' : score >= 90 ? 'Trusted' : score >= 60 ? 'Good' : score >= 30 ? 'Average' : 'Risky';
      const badge = pct >= 80 ? '🟢' : pct >= 50 ? '🟡' : '🔴';
      return '📊 <b>কুরিয়ার রিপোর্ট</b> ' + badge + (score === null ? '' : ' — Score ' + score + '/100 (' + tag + ')')
        + '\nমোট ' + total + ' | Delivered ' + del + ' | Cancelled ' + canc + ' | Success ' + pct + '%'
        + '\nSteadfast ' + cn('steadfast') + ' · Pathao ' + cn('pathao') + ' · RedX ' + cn('redx') + ' · Carrybee ' + cn('carrybee');
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
export interface OrderAlertItem {
  name?: string;
  sku?: string;
  quantity?: number;
  price?: number;
}

export interface OrderAlert {
  orderId: number | string;
  invoice?: string;
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  subtotal?: number;
  shippingFee?: number;
  discount?: number;
  total?: number;
  paymentMethod?: string;
  customerType?: string;
  items?: OrderAlertItem[];
}

function chunk(text: string): string[] {
  const t = (text || '').trim() || '…';
  if (t.length <= MAX_LEN) return [t];
  const lines = t.split(/\r?\n/);
  const parts: string[] = [];
  let buf = '';
  for (const line of lines) {
    const candidate = buf === '' ? line : buf + '\n' + line;
    if (candidate.length > MAX_LEN) {
      if (buf !== '') parts.push(buf);
      buf = line;
    } else {
      buf = candidate;
    }
  }
  if (buf.trim() !== '') parts.push(buf);
  return parts.length ? parts : [t.slice(0, MAX_LEN)];
}

async function tgSend(chatId: string | number, text: string): Promise<boolean> {
  if (!BOT_TOKEN || chatId === '') return false;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: ctl.signal as any,
      });
      return res.ok;
    } finally {
      clearTimeout(timer);
    }
  } catch (err: any) {
    console.error('[OrderNotify] send failed:', err?.message || err);
    return false;
  }
}

function esc(t: any): string {
  return String(t ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
export function formatOrderMessage(o: OrderAlert): string {
  const div = '━━━━━━━━━━━━';
  const lines: string[] = [
    '🛍️ <b>নতুন অর্ডার!</b>',
    div,
    '🧾 <code>#' + esc(o.orderId) + '</code>' + (o.invoice ? ' • ' + esc(o.invoice) : ''),
    '👤 ' + esc(o.name),
    '📞 ' + esc(o.phone),
    ...((o as any).courier ? [(o as any).courier, div] : []),
    '📍 ' + esc(o.address) + (o.city ? ', ' + esc(o.city) : ''),
    '💳 ' + esc(o.paymentMethod || 'cod') + (o.customerType ? (o.customerType === 'returning' ? ' • 🔁 রিপিট কাস্টমার' : ' • ✨ নতুন কাস্টমার') : ''),
  ];
  if (o.items && o.items.length) {
    lines.push('', '🛒 <b>আইটেম (' + o.items.length + ')</b>');
    o.items.slice(0, 20).forEach((it, i) => {
      lines.push((i + 1) + '️⃣ ' + esc(it.name) + ' × ' + (it.quantity ?? 1) + ' — ৳' + (Number(it.price || 0) * Number(it.quantity ?? 1)).toLocaleString());
    });
    if (o.items.length > 20) lines.push('… +' + (o.items.length - 20) + ' more');
  }
  lines.push(
    '',
    '💰 <b>হিসাব</b>',
    'Subtotal ৳' + Number(o.subtotal ?? 0).toLocaleString() + '  •  Delivery ৳' + Number(o.shippingFee ?? 0).toLocaleString() + '  •  Discount ৳' + Number(o.discount ?? 0).toLocaleString(),
    '✅ <b>Total: ৳' + Number(o.total ?? 0).toLocaleString() + '</b>',
  );
  return lines.join('\n');
}
export async function sendOrderToTelegram(order: OrderAlert): Promise<boolean> {
  try {
    if (!BOT_TOKEN || !CHAT_ID) {
      console.log('[OrderNotify] skipped: Telegram env not configured');
      return false;
    }
    (order as any).courier = await courierLine(order.phone || '');
    const msg = formatOrderMessage(order);
    let ok = true;
    for (const part of chunk(msg)) {
      const sent = await tgSend(CHAT_ID, part);
      if (!sent) ok = false;
    }
    if (ok) console.log('[OrderNotify] order alert sent:', order.orderId);
    return ok;
  } catch (err: any) {
    console.error('[OrderNotify ERROR]:', err?.message || err);
    return false;
  }
}
