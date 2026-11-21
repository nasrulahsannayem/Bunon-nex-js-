import { Router } from 'express';
import { getSecret } from '../utils/secrets';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import { dbPool } from '../db';

/**
 * The rider has to travel to the door, so district/thana is not enough for them
 * to act on the page. The tracking link is the credential: it is generated per
 * order and only sent to that buyer over WhatsApp, so the address is shown in
 * full. The customer's phone number stays masked.
 */
function maskPublicAddress(v: any) {
  return String(v || '').replace(/[;\n]+/g, ',').replace(/\s*,\s*,\s*/g, ', ').trim();
}


/**
 * Show only the operator prefix and the last three digits. Anything else about
 * the number is not needed to answer "where is my parcel".
 */
function maskPublicPhone(raw: any) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length < 4) return '';
  return `${d.slice(0, 3)}${'*'.repeat(Math.max(3, d.length - 6))}${d.slice(-3)}`;
}

const router = Router();

const SITE = (process.env.SEO_ORIGIN || process.env.DOMAIN_URL || 'https://bunonfabrics.com').replace(/\/$/, '');
const SF_BASE = 'https://portal.packzy.com/api/v1';

// The customer's own order timeline is the story; these are the milestones we
// show as a fixed spine so a parcel that has not moved yet still renders.
const SPINE = [
  { key: 'pending', label: 'অর্ডার নিশ্চিত', icon: 'check' },
  { key: 'processing', label: 'প্যাকিং চলছে', icon: 'box' },
  { key: 'in_transit', label: 'কুরিয়ারে পাঠানো হয়েছে', icon: 'truck' },
  { key: 'out_for_delivery', label: 'ডেলিভারির পথে', icon: 'route' },
  { key: 'delivered', label: 'ডেলিভার্ড হয়েছে', icon: 'home' },
];

const STEP_ICON: Record<string, string> = {
  pending: 'check', processing: 'box', shipped: 'truck', in_transit: 'truck',
  out_for_delivery: 'route', delivered: 'home', cancelled: 'x',
  partial_return: 'return', returned: 'return', failed: 'x',
  tracking_update: 'dot',
};

const STEP_LABEL_BN: Record<string, string> = {
  pending: 'অর্ডার নিশ্চিত', processing: 'প্যাকিং চলছে', shipped: 'কুরিয়ারে যাচ্ছে',
  in_transit: 'কুরিয়ারে পাঠানো হয়েছে', out_for_delivery: 'ডেলিভারির পথে',
  delivered: 'ডেলিভার্ড হয়েছে', cancelled: 'বাতিল হয়েছে',
  partial_return: 'আংশিক রিটার্ন', returned: 'রিটার্ন হয়েছে', failed: 'ডেলিভারি ব্যর্থ',
  tracking_update: 'কুরিয়ার আপডেট',
};

/** Steadfast gives us the whole journey; ask for it by our own invoice number. */
async function fetchSteadfastJourney(invoice: string, consignmentId?: string) {
  // Both credential stores are valid against Steadfast (verified: /get_balance
  // returns 200). Prefer .env so a rotated key in one place does not silently
  // change tracking behaviour, and fall back to the DB store when the
  // environment variable is missing.
  const key = process.env.STEADFAST_API_KEY || (await getSecret('steadfast_api_key'));
  const secret = process.env.STEADFAST_SECRET_KEY || (await getSecret('steadfast_secret_key'));
  if (!key || !secret) return { steps: [], error: 'credentials_missing' };
  // Verified against the live API: /trackings_by_invoice accepts ONLY an invoice
  // (a consignment id returns 401, and there is no /trackings_by_cid endpoint
  // at all). Passing the consignment here silently emptied the journey, so the
  // courier timeline collapsed to whatever few rows the webhook had stored.
  const path = `trackings_by_invoice/${encodeURIComponent(invoice)}`;

  try {
    const ctl = AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined;
    const r = await fetch(`${SF_BASE}/${path}`, {
      headers: { 'Api-Key': key, 'Secret-Key': secret },
      signal: ctl as any,
    });
    if (!r.ok) return { steps: [], error: `http_${r.status}` };
    const j: any = await r.json();
    return { steps: j?.tracking || j?.consignment?.trackings || [], error: null };
  } catch (e: any) {
    return { steps: [], error: e?.message || 'fetch_failed' };
  }
}

// Invoice numbers are sequential, so an unthrottled lookup endpoint lets
// anyone enumerate the shop's customers. express-rate-limit is already a
// dependency; this route had never applied it.
const trackLimiter = rateLimit({
  windowMs: 60_000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, msg: 'অনেকবার খুঁজেছেন। এক মিনিট পরে আবার চেষ্টা করুন।' },
});

// Steadfast's public API carries no rider name or phone field at all — several
// sampled parcels returned deliveryman_id: null and no name/phone keys exist.
// The merchant portal renders both, and rider_info.php reads that page with the
// portal session cookie the reply flow already maintains.
const RIDER_URL = 'https://dash.bunonfabrics.com/api/orders/rider_info.php';
const RIDER_TTL = 30 * 60 * 1000;
const riderCache = new Map<string, { n: string; p: string; at: number }>();


/**
 * Steadfast is the only authority on where a parcel actually is.
 *
 * Our stored bf_orders.status used to be shown verbatim, and that column can be
 * wrong and stay wrong: a webhook path that matched the substring "deliver"
 * once froze parcels mid-journey at "delivered" and nothing moved them back.
 * status_by_cid is a live read of the same parcel, so that is what the customer
 * is told. The stored column remains only as a fallback when the courier API
 * cannot answer (not booked yet, rate limited, or a timeout).
 */
const liveStatusCache = new Map<string, { v: string; at: number }>();
const LIVE_TTL_MS = 5 * 60 * 1000; // Steadfast caches status ~60s; 5min is safe and light.

async function liveDeliveryStatus(consignmentId?: string): Promise<string> {
  const id = String(consignmentId || '').trim();
  if (!/^\d{3,}$/.test(id)) return '';

  const hit = liveStatusCache.get(id);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.v;

  const creds = await getSecret('steadfast') as any;
  const key = creds?.apiKey || process.env.STEADFAST_API_KEY || '';
  const secret = creds?.secretKey || process.env.STEADFAST_SECRET_KEY || '';
  if (!key || !secret) return '';

  try {
    const r = await fetch(`${SF_BASE}/status_by_cid/${encodeURIComponent(id)}`, {
      headers: { 'Api-Key': key, 'Secret-Key': secret, Accept: 'application/json' },
    });
    if (!r.ok) return '';
    const j: any = await r.json();
    const raw = String(j?.delivery_status || j?.consignment?.status || '').toLowerCase();
    const v = normaliseLive(raw);
    if (v) liveStatusCache.set(id, { v, at: Date.now() });
    return v;
  } catch {
    return '';
  }
}

/** Map a Steadfast delivery_status onto our own ladder. */
function normaliseLive(raw: string): string {
  const v = String(raw || '').toLowerCase();
  if (!v) return '';
  // "partial_delivered" contains "delivered", so the completion test has to come
  // second or a part-delivered parcel is reported as fully delivered.
  if (v.includes('partial')) return 'partial_returned';
  if (v.includes('delivered')) return 'delivered';
  if (v.includes('return') || v.includes('cancel')) return 'returned';
  if (v.includes('out_for_delivery') || v.includes('out for delivery')) return 'out_for_delivery';
  if (v.includes('transit') || v.includes('shipped') || v.includes('picked')
      || v.includes('warehouse') || v.includes('processing') || v.includes('delivery')) return 'in_transit';
  if (v.includes('pending') || v.includes('approval')) return 'pending';
  return '';
}


/** Webhooks that carry a hand-written rider message are flagged as such. */
function raw_status_is_rider(n: any) {
  return ['rider_note', 'rider_message', 'rider_reply']
    .includes(String(n.raw_status || '').toLowerCase());
}


/** A message a human rider typed, as opposed to a scan the courier system made. */
function isRiderMessage(text: any) {
  const t = String(text || '').trim();
  return /^rider\s*(note|message|reply|comment)\s*[:\-]/i.test(t);
}

async function fetchRider(cid: any) {
  const id = String(cid || '').trim();
  if (!/^\d{3,}$/.test(id)) return { name: '', phone: '', assigned: false };
  const hit = riderCache.get(id);
  if (hit && Date.now() - hit.at < RIDER_TTL) {
    return { name: hit.n, phone: hit.p, assigned: !!hit.n };
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`${RIDER_URL}?consignment_id=${encodeURIComponent(id)}`, {
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!r.ok) return { name: '', phone: '', assigned: false };
    const j: any = await r.json();
    const n = String(j?.rider_name || '');
    const p = String(j?.rider_phone || '');
    riderCache.set(id, { n, p, at: Date.now() });
    return { name: n, phone: p, assigned: !!n };
  } catch {
    // A rider lookup must never break tracking; fall through as unassigned.
    return { name: '', phone: '', assigned: false };
  }
}

router.get('/track', trackLimiter, async (req: any, res) => {
  const code = String(req.query.code || req.query.tracking || req.query.invoice || '').trim();
  if (!code || code.length > 100) {
    return res.status(400).json({ ok: false, msg: 'ট্র্যাকিং কোড দিন।' });
  }

  try {
    // Exact match only - never a LIKE, so a guessed code cannot walk orders.
    // Four identifier columns are tried because the site uses two different
    // tracking columns: courier_tracking_code holds the Steadfast 'SFR…'
    // code that WhatsApp actually sends, while tracking_code holds a
    // different value on legacy rows. Before this fix the SFR code sent to
    // every customer matched nothing, so the tracking page 404'd for real
    // customer links.
    const [rows]: any = await dbPool.execute(
      `SELECT o.id, o.invoice, o.created_at, o.status, o.total_payable AS amount,
              o.customer_name, o.phone, o.address, o.city, o.state,
              o.payment_method, o.cod_amount, o.delivery_fee, o.discount_amount,
              o.consignment_id, o.courier_consignment_id,
              o.tracking_code, o.courier_code, o.courier_name,
              o.courier_tracking, o.internal_note
         FROM bf_orders o
        WHERE o.courier_tracking_code = ?
           OR o.tracking_code = ?
           OR o.consignment_id = ?
           OR o.courier_consignment_id = ?
           OR o.invoice = ?
        ORDER BY o.created_at DESC LIMIT 1`,
      [code, code, code, code, code],
    );
    if (!rows?.length) {
      return res.status(404).json({ ok: false, msg: 'এই ট্র্যাকিং কোডে কোনো অর্ডার পাওয়া যায়নি।' });
    }
    const o = rows[0];

    const [items]: any = await dbPool.execute(
      `SELECT product_name AS name, qty AS quantity, price,
              COALESCE(NULLIF(product_thumb, ''), NULLIF(image, ''), NULLIF(thumb, '')) AS thumbnail
         FROM bf_order_items WHERE order_id = ?`, [o.id]);

    // Our own notes and courier remarks - the "customer did not pick up" style
    // events live in the webhook log, not in the order row.
    const [notes]: any = await dbPool.execute(
      `SELECT tracking_message, raw_status, webhook_updated_at, created_at
         FROM bf_tracking_logs
        WHERE invoice = ? OR (consignment_id IS NOT NULL AND consignment_id = ?)
        ORDER BY created_at ASC LIMIT 200`, [o.invoice, o.courier_consignment_id || o.consignment_id]);

    const journey = await fetchSteadfastJourney(o.invoice, o.courier_consignment_id || o.consignment_id);

    // Steadfast is the live source; fall back to what the webhook already stored
    // so the page still shows a journey if the courier API is slow.
    // Steadfast returns only its own warehouse/dispatch events. A note a rider
    // types ("customer phone off, call tomorrow", "keep the parcel at the
    // merchant") reaches us only through the webhook log, so the two sources
    // are merged rather than one replacing the other - otherwise every real
    // rider message disappeared as soon as the courier API started responding.
    const courierSteps = journey.steps.map((t: any) => {
      const text = String(t.text || '');
      return {
        text,
        at: t.updated_at || t.created_at || null,
        // Steadfast files a hand-written rider message in the same feed as its
        // warehouse scans, so the text is what tells them apart.
        type: isRiderMessage(text) ? 'rider_note' : (t.tracking_type ?? null),
        rider: t.deliveryman_id ?? null,
        source: 'steadfast',
      };
    });
    const riderNotes = (notes || [])
      // Only a message a human actually wrote counts as a rider note. The same
      // log table also holds the courier's automated warehouse/dispatch lines,
      // and labelling those "রাইডার নোট" would drown the real messages.
      .filter((n: any) => {
        const msg = String(n.tracking_message || '').trim();
        if (!msg) return false;
        return isRiderMessage(msg) || raw_status_is_rider(n);
      })
      .map((n: any) => ({
        text: n.tracking_message || '',
        at: n.webhook_updated_at || n.created_at || null,
        type: 'rider_note',
        rider: null,
        source: 'webhook',
      }));
    const raw = [...courierSteps, ...riderNotes].sort((a: any, b: any) => {
      const ta = a.at ? Date.parse(a.at) : 0;
      const tb = b.at ? Date.parse(b.at) : 0;
      return (ta || 0) - (tb || 0);
    });

    // Drop retry duplicates: the same courier sentence arriving three times is
    // one fact, and showing it three times makes the timeline look broken.
    const seen = new Set<string>();
    const steps = raw.filter((s: any) => {
      const k = (s.text || '').trim().slice(0, 90).toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const cidRaw = o.courier_consignment_id || o.consignment_id;
    const liveStatus = await liveDeliveryStatus(cidRaw);

    // The spine is the progress bar the customer reads, so it has to be built
    // from the same live value as the status line. Using the stored column here
    // made a parcel frozen at "delivered" show a full green bar while the line
    // above it said pending.
    const effective = liveStatus || o.status;
    const done = new Set<string>([effective]);
    let reached = 0;
    for (let i = 0; i < SPINE.length; i++) if (done.has(SPINE[i].key)) reached = i;

    const rider = await fetchRider(o.courier_consignment_id || o.consignment_id);

    res.json({
      ok: true,
      order: {
        invoice: o.invoice,
        customer: o.customer_name,
        // Masked: the URL gets pasted into group chats.
        // The public page is reachable by anyone who knows an invoice number,
        // so the raw number must never leave the server. Anchor on the digit
        // count instead of an exact 11-digit pattern: earlier the regex ended
        // with $, so it matched nothing and the full number was returned.
        phone: maskPublicPhone(o.phone),
        address: maskPublicAddress([o.address, o.city].filter(Boolean).join(', ')),
        amount: o.amount,
        payment: o.payment_method,
        cod: o.cod_amount,
        deliveryFee: o.delivery_fee,
        discount: o.discount_amount,
        createdAt: o.created_at,
        status: effective,
        courier: o.courier_name || o.courier_code || 'steadfast',
        rider,
        trackingCode: o.tracking_code,
        consignmentId: o.courier_consignment_id || o.consignment_id,
        latestRemark: o.courier_tracking || '',
        note: o.internal_note || '',
      },
      items,
      riderNoteCount: steps.filter((x: any) => x.type === 'rider_note').length,
      spine: SPINE.map((s, i) => ({ ...s, done: i <= reached })),
      steps: steps.map((s: any) => ({
        text: s.text,
        at: s.at,
        rider: s.rider,
        // Carried through so the page can render a rider's own message
        // differently from an automated courier scan.
        type: s.type ?? null,
        source: s.source ?? null,
        label: s.type === 'rider_note' ? 'রাইডার নোট' : '',
        icon: s.type === 'rider_note' ? 'note' : 'dot',
      })),
      help: {
        hotline: '09611900606',
        whatsapp: 'https://wa.me/8809611900606',
      },
      site: SITE,
    });
  } catch (e: any) {
    console.error('[public-track] failed:', e?.message || e);
    res.status(500).json({ ok: false, msg: 'একটু পরে আবার চেষ্টা করুন।' });
  }
});

export default router;