import express from 'express';
import { getSecret } from '../../utils/secrets';
import { dbPool } from '../../db';

// Steadfast courier gateway (https://portal.packzy.com/api/v1).
// Keys resolve server-side via getSecret('steadfast_api_key'/'steadfast_secret_key')
// (bunon_settings wins, .env fallback) — values are NEVER logged or returned.
// GET  /api/admin/couriers/status                            — connected pills (booleans only)
// POST /api/admin/couriers/steadfast/create-order            — book one parcel
// POST /api/admin/couriers/steadfast/bulk-order              — book up to 500 parcels
// GET  /api/admin/couriers/steadfast/status-by-invoice/:inv  — live status by invoice
// GET  /api/admin/couriers/steadfast/status-by-cid/:cid      — live status by consignment id
// GET  /api/admin/couriers/steadfast/trackings/:inv          — full tracking history
// POST /api/admin/couriers/steadfast/webhook                 — authenticated replay/test receiver
// Public receiver (no admin auth; Steadfast calls this): POST /api/steadfast/status-update (webhook.ts)
const router = express.Router();

const BASE = 'https://portal.packzy.com/api/v1';
const INVOICE_RE = /^[A-Za-z0-9_-]{1,100}$/;
const PHONE_RE = /^01\d{9}$/;

const nonEmpty = (v: unknown) => typeof v === 'string' ? v.trim() !== '' && v.trim() !== '***' : !!v;

// Safety: 401-fail circuit (doc: 10 fails/5min -> 60min lockout) + 60s GET cache for status paths.
const sfCircuit = { fails: 0, firstFailAt: 0, lockedUntil: 0 };
const sfGetCache: Record<string, { at: number; data: any }> = {};
const SF_CACHEABLE = /^\/(status_by_cid|status_by_invoice|status_by_trackingcode|status_with_return_status_by_cid|trackings_by_invoice|fraud_check\/score)\//;
async function sfCall(path: string, method: 'GET' | 'POST' = 'GET', body?: unknown) {
  if (Date.now() < sfCircuit.lockedUntil)
    return { ok: false, http: 503 as number, data: { status: 503, message: 'Steadfast সাময়িক বন্ধ (ভুল কী-সুরক্ষা)। ১ মিনিট পর আবার চেষ্টা করুন।' } };
  if (method === 'GET' && SF_CACHEABLE.test(path)) {
    const hit = sfGetCache[path];
    if (hit && Date.now() - hit.at < 60000) return { ok: true, http: 200 as number, data: hit.data, cached: true };
  }
  const apiKey = await getSecret('steadfast_api_key');
  const secretKey = await getSecret('steadfast_secret_key');
  if (!apiKey || !secretKey) return { ok: false, http: 503 as number, data: { status: 503, message: 'Steadfast keys not configured' } };
  const res = await fetch(BASE + path, {
    method,
    headers: { 'Api-Key': apiKey, 'Secret-Key': secretKey, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: any = null;
  try { data = await res.json(); } catch { data = { status: res.status, message: 'Non-JSON upstream reply' }; }
  if (res.status === 401) {
    const now = Date.now();
    if (now - sfCircuit.firstFailAt > 5 * 60 * 1000) { sfCircuit.fails = 0; sfCircuit.firstFailAt = now; }
    sfCircuit.fails++;
    if (sfCircuit.fails >= 5) { sfCircuit.lockedUntil = now + 60 * 1000; sfCircuit.fails = 0; }
  } else if (res.ok) {
    sfCircuit.fails = 0;
    if (method === 'GET' && SF_CACHEABLE.test(path)) sfGetCache[path] = { at: Date.now(), data };
  }
  return { ok: res.ok, http: res.status, data, retryable: res.status === 429 || res.status >= 500 };
}

function validateOrder(o: any): string | null {
  if (!o || typeof o !== 'object') return 'Order must be an object';
  if (!o.invoice || !INVOICE_RE.test(String(o.invoice))) return 'invoice: letters/digits/hyphen/underscore, max 100';
  if (!o.recipient_name || String(o.recipient_name).trim() === '') return 'recipient_name is required';
  if (!o.recipient_phone || !PHONE_RE.test(String(o.recipient_phone))) return 'recipient_phone: 11 digits starting 01';
  if (!o.recipient_address || String(o.recipient_address).trim() === '') return 'recipient_address is required';
  if (o.cod_amount === undefined || o.cod_amount === null || isNaN(Number(o.cod_amount))) return 'cod_amount must be a number';
  if (Number(o.cod_amount) < 0 || Number(o.cod_amount) > 1000000) return 'cod_amount: 0 থেকে ১০,০০,০০০ এর মধ্যে হতে হবে';
  if (String(o.recipient_name).length > 100) return 'recipient_name: সর্বোচ্চ ১০০ অক্ষর';
  if (String(o.recipient_address).length > 490) return 'recipient_address: সর্বোচ্চ ৪৯০ অক্ষর';
  if (o.note !== undefined && o.note !== null && String(o.note).length > 480) return 'note: সর্বোচ্চ ৪৮০ অক্ষর';
  if (o.alternative_phone !== undefined && o.alternative_phone !== null && String(o.alternative_phone) !== '' && !PHONE_RE.test(String(o.alternative_phone))) return 'alternative_phone: 11 digits starting 01';
  if (o.item_description !== undefined && o.item_description !== null && String(o.item_description).length > 255) return 'item_description: সর্বোচ্চ ২৫৫ অক্ষর';
  if (o.total_lot !== undefined && o.total_lot !== null && (isNaN(Number(o.total_lot)) || Number(o.total_lot) < 1)) return 'total_lot: ১ বা বেশি হতে হবে';
  if (o.delivery_type !== undefined && o.delivery_type !== null && ![0, 1, '0', '1'].includes(o.delivery_type as any)) return 'delivery_type: 0 (home) বা 1 (point)';
  return null;
}
// Upstream error-code -> human (BN) message
const SF_ERR_BN: Record<string, string> = {
  INVOICE_IS_REQUIRED: 'ইনভয়েস নেই',
  INVOICE_MUST_BE_ALPHA_NUM_DASH_UNDERSCORE: 'ইনভয়েসে শুধু অক্ষর/সংখ্যা/-/_ চলবে',
  INVOICE_LENGTH_SHOULD_BE_LESS_THAN_100_CHARS: 'ইনভয়েস ১০০ অক্ষরের বেশি',
  THIS_INVOICE_ALREADY_EXISTS: 'এই ইনভয়েসে আগেই বুক হয়েছে',
  RECEIVER_NAME_IS_REQUIRED: 'ক্রেতার নাম নেই',
  RECEIVER_NAME_LENGTH_SHOULD_BE_LESS_THAN_100_CHARS: 'নাম ১০০ অক্ষরের বেশি',
  RECEIVER_PHONE_IS_REQUIRED: 'ফোন নেই',
  RECEIVER_PHONE_LENGTH_SHOULD_BE_LESS_THAN_40_CHARS: 'ফোন ৪০ অক্ষরের বেশি',
  RECEIVER_ADDRESS_IS_REQUIRED: 'ঠিকানা নেই',
  RECEIVER_ADDRESS_LENGTH_SHOULD_BE_LESS_THAN_500_CHARS: 'ঠিকানা অনেক লম্বা',
  RECEIVER_NOTE_LENGTH_SHOULD_BE_LESS_THAN_500_CHARS: 'নোট অনেক লম্বা',
  COD_AMOUNT_ERROR: 'COD টাকা ভুল/নেই',
};
function sfEntryCodes(err: any): string[] {
  if (!err) return [];
  if (Array.isArray(err)) return err.map(String);
  if (typeof err === 'string') { try { const v = JSON.parse(err); if (Array.isArray(v)) return v.map(String); } catch {} return [err]; }
  return [String(err)];
}
function sfEntryBn(err: any): string {
  const codes = sfEntryCodes(err);
  if (!codes.length) return '';
  return codes.map(c => SF_ERR_BN[c] || c).join('; ');
}

// Mirror a successful booking into bf_orders when the invoice matches a local order.
async function mirrorBooking(invoice: string, consignment: any) {
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT id, consignment_id FROM bf_orders WHERE invoice = ? LIMIT 1', [invoice]
    );
    if (!rows?.length || rows[0].consignment_id) return;
    await dbPool.execute(
      "UPDATE bf_orders SET consignment_id = ?, tracking_code = ?, courier_code = 'steadfast', status = 'in_transit' WHERE id = ?",
      [consignment.consignment_id, consignment.tracking_code, rows[0].id]
    );
    await dbPool.execute(
      'INSERT INTO bf_order_logs (order_id, log_type, message, created_by, created_at) VALUES (?, ?, ?, ?, NOW())',
      [rows[0].id, 'courier_booked', `Booked with Steadfast: ${consignment.consignment_id}`, 'steadfast']
    );
  } catch (e: any) { console.error('[Steadfast] mirrorBooking failed:', e.message); }
}

router.get('/status', async (_req, res) => {
  try {
    const sApi = await getSecret('steadfast_api_key');
    const sSec = await getSecret('steadfast_secret_key');
    const sStatus = await getSecret('steadfast_status');
    const pId = await getSecret('pathao_client_id');
    const pTok = await getSecret('pathao_access_token');
    const pStatus = await getSecret('pathao_status');
    const rTok = await getSecret('redx_api_token');
    const rStatus = await getSecret('redx_status');
    const steadfast = (sStatus === 'on' || nonEmpty(sApi)) && (nonEmpty(sApi) || nonEmpty(sSec));
    const pathao = (pStatus === 'on' || nonEmpty(pId)) && (nonEmpty(pId) || nonEmpty(pTok));
    const redx = (rStatus === 'on' || nonEmpty(rTok)) && nonEmpty(rTok);
    res.json({ ok: true, steadfast: !!steadfast, pathao: !!pathao, redx: !!redx });
  } catch (e: any) {
    console.error('[Admin Couriers] Status error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/couriers/steadfast/create-order — book one parcel (real booking: call deliberately).
router.post('/steadfast/create-order', async (req, res) => {
  const err = validateOrder(req.body);
  if (err) return res.status(422).json({ ok: false, msg: err });
  try {
    const r = await sfCall('/create_order', 'POST', req.body);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    if (r.data?.status === 200 && r.data?.consignment) {
      await mirrorBooking(String(req.body.invoice), r.data.consignment);
      return res.json({ ok: true, consignment: r.data.consignment });
    }
    return res.status(r.data?.status === 400 ? 400 : 422).json({ ok: false, msg: r.data?.message || 'Steadfast booking failed', errors: r.data?.errors, upstream: r.data });
  } catch (e: any) {
    console.error('[Steadfast] create-order error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/couriers/steadfast/bulk-order — book up to 500 parcels in one request.
router.post('/steadfast/bulk-order', async (req, res) => {
  const data = req.body?.data;
  if (!Array.isArray(data) || data.length === 0 || data.length > 500)
    return res.status(400).json({ ok: false, msg: 'Body must be { data: [...] } with 1..500 orders' });
  // Doc partial-success model: bad items fail per-entry, good ones still book.
  const valid: any[] = [];
  const preFailed: any[] = [];
  for (let i = 0; i < data.length; i++) {
    const err = validateOrder(data[i]);
    if (err) preFailed.push({ invoice: data[i]?.invoice, index: i, status: null, error: JSON.stringify(['LOCAL_VALIDATION']), msg: `data[${i}]: ${err}` });
    else valid.push({ item: data[i], index: i });
  }
  try {
    const entries: any[] = [];
    if (valid.length) {
      const r = await sfCall('/create_order/bulk-order', 'POST', { data: valid.map(v => v.item) });
      if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
      const up: any[] = Array.isArray(r.data?.data) ? r.data.data : [];
      for (let k = 0; k < up.length; k++) {
        const e = { ...up[k], index: valid[k]?.index ?? k, msg: sfEntryBn(up[k]?.error) };
        entries.push(e);
        if (e?.status === 'success' && e?.consignment_id && e?.invoice)
          await mirrorBooking(String(e.invoice), { consignment_id: e.consignment_id, tracking_code: e.tracking_code });
      }
    }
    const merged = [...entries, ...preFailed].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    const okN = merged.filter(e => e?.status === 'success').length;
    return res.json({ ok: true, booked: okN, failed: merged.length - okN, data: merged });
  } catch (e: any) {
    console.error('[Steadfast] bulk-order error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/status-by-invoice/:invoice — read-only pull.
router.get('/steadfast/status-by-invoice/:invoice', async (req, res) => {
  const inv = String(req.params.invoice || '');
  if (!INVOICE_RE.test(inv)) return res.status(400).json({ ok: false, msg: 'Invalid invoice' });
  try {
    const r = await sfCall(`/status_by_invoice/${encodeURIComponent(inv)}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] status-by-invoice error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/status-by-cid/:cid — read-only pull.
router.get('/steadfast/status-by-cid/:cid', async (req, res) => {
  const cid = String(req.params.cid || '');
  if (!/^\d{1,12}$/.test(cid)) return res.status(400).json({ ok: false, msg: 'Invalid consignment id' });
  try {
    const r = await sfCall(`/status_by_cid/${encodeURIComponent(cid)}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] status-by-cid error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/return-status-by-cid/:cid — return journey (stock truth: *_return_received).
router.get('/steadfast/return-status-by-cid/:cid', async (req, res) => {
  const cid = String(req.params.cid || '');
  if (!/^\d{1,12}$/.test(cid)) return res.status(400).json({ ok: false, msg: 'Invalid consignment id' });
  try {
    const r = await sfCall(`/status_with_return_status_by_cid/${encodeURIComponent(cid)}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    const st = String((r.data as any)?.delivery_status || '');
    return res.json({ ok: true, ...r.data, stock_back: /_return_received$/.test(st) });
  } catch (e: any) {
    console.error('[Steadfast] return-status error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/trackings/:invoice — full step history (for "where is my order?").
router.get('/steadfast/trackings/:invoice', async (req, res) => {
  const inv = String(req.params.invoice || '');
  if (!INVOICE_RE.test(inv)) return res.status(400).json({ ok: false, msg: 'Invalid invoice' });
  try {
    const r = await sfCall(`/trackings_by_invoice/${encodeURIComponent(inv)}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] trackings error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// Shared status-update applier (used by the authenticated receiver below and the public receiver in webhook.ts).
export async function applySteadfastUpdate(payload: any): Promise<{ matched: boolean; orderId?: number }> {
  const cid = payload?.consignment_id ?? payload?.consignmentId;
  const inv = payload?.invoice;
  const dlvStatus = String(payload?.delivery_status ?? payload?.status ?? '');
  if (!cid && !inv) return { matched: false };
  const [rows]: any = cid
    ? await dbPool.execute('SELECT id FROM bf_orders WHERE consignment_id = ? LIMIT 1', [cid])
    : await dbPool.execute('SELECT id FROM bf_orders WHERE invoice = ? LIMIT 1', [inv]);
  if (!rows?.length) return { matched: false };
  const orderId = rows[0].id;
  const map: Record<string, string> = { delivered: 'delivered', cancelled: 'cancelled', partial_delivered: 'partial_return' };
  if (map[dlvStatus]) await dbPool.execute('UPDATE bf_orders SET status = ? WHERE id = ?', [map[dlvStatus], orderId]);
  await dbPool.execute(
    'INSERT INTO bf_order_logs (order_id, log_type, message, created_by, created_at) VALUES (?, ?, ?, ?, NOW())',
    [orderId, 'courier_status', `Steadfast update: ${dlvStatus || 'unknown'}`, 'steadfast_webhook']
  );
  return { matched: true, orderId };
}

// POST /api/admin/couriers/steadfast/webhook — authenticated receiver (manual replays/tests).
router.post('/steadfast/webhook', async (req, res) => {
  // Public route (index.ts bypass) — shared-secret guard:
  try {
    const secret = await getSecret('steadfast_webhook_secret');
    if (secret && String((req.query as any)?.key || '') !== secret)
      return res.status(403).json({ ok: false, msg: 'bad key' });
    const r = await applySteadfastUpdate(req.body || {});
    res.json({ ok: true, ...r });
  } catch (e: any) {
    console.error('[Steadfast] webhook error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});


// ---- Steadfast FULL parity (doc_45cab42f61cc): remaining read-only/request endpoints ----
const POLICE_TTL_MS = 24 * 3600 * 1000;
let policeCache: { at: number; data: any } | null = null;

// POST /api/admin/couriers/steadfast/bulk-order/extended — same as bulk, per-field messages.
router.post('/steadfast/bulk-order/extended', async (req, res) => {
  const data = req.body?.data;
  if (!Array.isArray(data) || data.length === 0 || data.length > 500)
    return res.status(400).json({ ok: false, msg: 'Body must be { data: [...] } with 1..500 orders' });
  for (let i = 0; i < data.length; i++) {
    const err = validateOrder(data[i]);
    if (err) return res.status(422).json({ ok: false, msg: `data[${i}]: ${err}` });
  }
  try {
    const r = await sfCall('/create_order/bulk-order/extended', 'POST', { data });
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    const entries: any[] = Array.isArray(r.data?.data) ? r.data.data : [];
    for (const e of entries) {
      if (e?.status === 'success' && e?.consignment_id && e?.invoice)
        await mirrorBooking(String(e.invoice), { consignment_id: e.consignment_id, tracking_code: e.tracking_code });
    }
    return res.json({ ok: true, message: r.data?.message, data: entries, upstream_status: r.data?.status });
  } catch (e: any) {
    console.error('[Steadfast] bulk-order/extended error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/status-with-return/:cid — status incl. return leg.
router.get('/steadfast/status-with-return/:cid', async (req, res) => {
  const cid = String(req.params.cid || '');
  if (!/^\d{1,12}$/.test(cid)) return res.status(400).json({ ok: false, msg: 'Invalid consignment id' });
  try {
    const r = await sfCall(`/status_with_return_status_by_cid/${encodeURIComponent(cid)}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] status-with-return error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/status-by-tracking/:code — status by tracking code.
router.get('/steadfast/status-by-tracking/:code', async (req, res) => {
  const code = String(req.params.code || '');
  if (!/^[A-Za-z0-9]{4,32}$/.test(code)) return res.status(400).json({ ok: false, msg: 'Invalid tracking code' });
  try {
    const r = await sfCall(`/status_by_trackingcode/${encodeURIComponent(code)}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] status-by-tracking error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/couriers/steadfast/pickup — ask a rider to collect (201; 409 if one pending).
router.post('/steadfast/pickup', async (req, res) => {
  const b = req.body || {};
  if (!Number.isFinite(Number(b.address_id))) return res.status(422).json({ ok: false, msg: 'address_id is required' });
  if (!Number.isFinite(Number(b.police_station_id))) return res.status(422).json({ ok: false, msg: 'police_station_id is required (see police-stations)' });
  if (!b.address || String(b.address).trim() === '') return res.status(422).json({ ok: false, msg: 'address is required' });
  if (!b.contact_number || !/^01[3-9]\d{8}$/.test(String(b.contact_number))) return res.status(422).json({ ok: false, msg: 'contact_number: 11 digits starting 013-019' });
  try {
    const r = await sfCall('/create_pickup_request', 'POST', b);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.status(r.http).json({ ok: r.ok, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] pickup error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/couriers/steadfast/return — request a parcel back (201; 422 if delivered).
router.post('/steadfast/return', async (req, res) => {
  const b = req.body || {};
  if (!b.consignment_id && !b.invoice && !b.tracking_code)
    return res.status(422).json({ ok: false, msg: 'One of consignment_id, invoice, tracking_code is required' });
  try {
    const r = await sfCall('/create_return_request', 'POST', b);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.status(r.http).json({ ok: r.ok, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] return error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/returns — newest first, 10/page.
router.get('/steadfast/returns', async (req, res) => {
  const page = Math.max(1, parseInt(String((req.query as any)?.page || '1'), 10) || 1);
  try {
    const r = await sfCall(`/get_return_requests?page=${page}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] returns error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/returns/:id — one return request.
router.get('/steadfast/returns/:id', async (req, res) => {
  const id = String(req.params.id || '');
  if (!/^\d{1,12}$/.test(id)) return res.status(400).json({ ok: false, msg: 'Invalid return id' });
  try {
    const r = await sfCall(`/get_return_request/${encodeURIComponent(id)}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] return-get error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/balance — current COD balance owed.
router.get('/steadfast/balance', async (_req, res) => {
  try {
    const r = await sfCall('/get_balance');
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] balance error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/payments — payouts, 10/page.
router.get('/steadfast/payments', async (req, res) => {
  const page = Math.max(1, parseInt(String((req.query as any)?.page || '1'), 10) || 1);
  try {
    const r = await sfCall(`/payments?page=${page}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] payments error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/payments/:id — one payout (digits only; SFC- prefix ok).
router.get('/steadfast/payments/:id', async (req, res) => {
  const digits = String(req.params.id || '').replace(/\D/g, '');
  if (!digits) return res.status(400).json({ ok: false, msg: 'Invalid payment id' });
  try {
    const r = await sfCall(`/payments/${encodeURIComponent(digits)}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] payment-get error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/police-stations — thana list, cached 24h.
router.get('/steadfast/police-stations', async (_req, res) => {
  try {
    if (policeCache && Date.now() - policeCache.at < POLICE_TTL_MS)
      return res.json({ ok: true, cached: true, data: policeCache.data });
    const r = await sfCall('/police_stations');
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    if (r.ok) policeCache = { at: Date.now(), data: r.data };
    return res.json({ ok: true, cached: false, data: r.data });
  } catch (e: any) {
    console.error('[Steadfast] police-stations error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/couriers/steadfast/fraud-score/:phone — 0-100 customer safety score.
router.get('/steadfast/fraud-score/:phone', async (req, res) => {
  const ph = String(req.params.phone || '');
  if (!PHONE_RE.test(ph)) return res.status(400).json({ ok: false, msg: 'Invalid phone' });
  try {
    const r = await sfCall(`/fraud_check/score/${encodeURIComponent(ph)}`);
    if (r.http === 503) return res.status(503).json({ ok: false, msg: r.data.message });
    return res.json({ ok: true, ...r.data });
  } catch (e: any) {
    console.error('[Steadfast] fraud-score error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
