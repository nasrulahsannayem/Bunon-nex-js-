import express from 'express';
import { getSecret } from '../../utils/secrets';

const router = express.Router();
const PLUGIN_BASE = 'https://plugin.hoorin.com';
const SHEET_BASE = 'https://dash.hoorin.com';
const SF_BASE = 'https://portal.packzy.com/api/v1';

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Pick first finite number from candidate keys (case-insensitive)
function pick(src: Record<string, any>, keys: string[]): number | null {
  const lower: Record<string, any> = {};
  for (const k of Object.keys(src || {})) lower[k.toLowerCase()] = (src as any)[k];
  for (const k of keys) {
    const v = lower[k.toLowerCase()];
    if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

function riskFrom(pct: number): string {
  return pct >= 80 ? 'low' : pct >= 50 ? 'medium' : 'high';
}

async function fetchJson(url: string, ms = 12000): Promise<any> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error('upstream ' + resp.status);
    return await resp.json().catch(() => { throw new Error('bad json'); });
  } finally {
    clearTimeout(t);
  }
}


// Steadfast fraud score (GET /fraud_check/score/{phone}) — fail-open, never throws, never logs keys.
async function fetchSteadfastScore(phone: string): Promise<{ score: number | null; level: string; reasons: string[]; doubtful_reports: boolean; total_reports: number } | null> {
  try {
    const apiKey = await getSecret('steadfast_api_key');
    const secretKey = await getSecret('steadfast_secret_key');
    if (!apiKey || !secretKey) return null;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    try {
      const resp = await fetch(SF_BASE + '/fraud_check/score/' + encodeURIComponent(phone), {
        headers: { 'Api-Key': apiKey, 'Secret-Key': secretKey },
        signal: ctrl.signal,
      });
      if (!resp.ok) return null;
      const j: any = await resp.json().catch(() => null);
      if (!j || j.status !== 200) return null;
      const score = j.score === null || j.score === undefined ? null : Number(j.score);
      const level = typeof j.level === 'string' ? j.level : 'new';
      const reasons = Array.isArray(j.reasons) ? j.reasons.map(String) : [];
      return { score: Number.isFinite(score as number) ? (score as number) : null, level, reasons, doubtful_reports: j.doubtful_reports === true, total_reports: Number(j.total_reports) || 0 };
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

type CourierStat = { delivered: number; total: number };
const COURIER_KEYS = ['steadfast', 'redx', 'pathao', 'carrybee'] as const;

function emptyCouriers(): Record<string, CourierStat> {
  const o: Record<string, CourierStat> = {};
  for (const k of COURIER_KEYS) o[k] = { delivered: 0, total: 0 };
  return o;
}

// Normalize NEW plugin shape:
// { success, overall: { total_parcels, delivered_parcels, cancelled_parcels, success_ratio },
//   couriers: { steadfast, redx, pathao, carrybee } }
function normalizePlugin(data: any) {
  const overall = (data && data.overall) || {};
  const total = num(overall.total_parcels);
  const delivered = num(overall.delivered_parcels);
  const cancelled = num(overall.cancelled_parcels);
  const ratio = Number(overall.success_ratio);
  const success_pct = Number.isFinite(ratio)
    ? +ratio.toFixed(1)
    : total > 0 ? +(delivered * 100 / total).toFixed(1) : 0;
  const rawCouriers = (data && data.couriers) || {};
  const lower: Record<string, any> = {};
  for (const k of Object.keys(rawCouriers)) lower[k.toLowerCase()] = rawCouriers[k];
  const perCourier: Record<string, CourierStat> = {};
  for (const k of COURIER_KEYS) {
    const c = lower[k];
    if (c && typeof c === 'object' && !Array.isArray(c)) {
      const t = pick(c, ['total', 'total_parcels', 'total_orders', 'orders', 'count']);
      const d = pick(c, ['delivered', 'delivered_parcels', 'delivered_orders', 'success', 'successful']);
      perCourier[k] = { delivered: d ?? 0, total: t ?? (d ?? 0) };
    } else if (c !== undefined && c !== null && Number.isFinite(Number(c))) {
      perCourier[k] = { delivered: Number(c), total: Number(c) };
    } else {
      perCourier[k] = { delivered: 0, total: 0 };
    }
  }
  return { overall: { total, delivered, cancelled, success_pct }, perCourier };
}

// Legacy sheet fallback: flat key scan (dash fraud_api.php parity)
function normalizeSheet(data: any) {
  const flat: Record<string, any> = {};
  const merge = (o: any) => { if (o && typeof o === 'object' && !Array.isArray(o)) Object.assign(flat, o); };
  merge(data);
  merge(data?.data);
  merge(data?.result);
  merge(data?.summary);
  const total = pick(flat, ['total', 'total_orders', 'totalorders', 'orders', 'count']) ?? 0;
  const delivered = pick(flat, ['delivered', 'delivered_orders', 'success', 'successful', 'success_count']) ?? 0;
  const cancelled = (pick(flat, ['cancelled', 'canceled', 'cancel', 'cancelled_orders']) ?? 0)
    + (pick(flat, ['returned', 'return', 'returns', 'returned_orders']) ?? 0);
  const success_pct = total > 0 ? +(delivered * 100 / total).toFixed(1) : 0;
  return { overall: { total, delivered, cancelled, success_pct }, perCourier: emptyCouriers() };
}

// GET /api/admin/fraud/check?phone=01XXXXXXXXX
// Primary: plugin endpoint (view=full). Fallback: old sheet endpoint on failure.
router.get('/check', async (req, res) => {
  const raw = ((req.query.phone as string) || (req.query.searchTerm as string) || '').trim();
  const phone = raw.replace(/\D+/g, '');
  if (!phone || phone.length < 6) {
    res.status(400).json({ ok: false, msg: 'phone parameter is required' });
    return;
  }
  const apiKey = await getSecret('hoorin_api_key');
  if (!apiKey) {
    res.status(500).json({ ok: false, msg: 'Fraud check is not configured' });
    return;
  }
  const view = ((req.query.view as string) || 'full').trim() || 'full';
  const pluginUrl = PLUGIN_BASE + '/courier/api/v1/search?apiKey=' + encodeURIComponent(apiKey)
    + '&searchTerm=' + encodeURIComponent(phone) + '&view=' + encodeURIComponent(view);
  try {
    const data: any = await fetchJson(pluginUrl, 12000);
    if (!data || data.error) throw new Error((data && data.error) || 'plugin error');
    const { overall, perCourier } = normalizePlugin(data);
    const risk = overall.total > 0 ? riskFrom(overall.success_pct) : 'unknown';
    const steadfast_score = await fetchSteadfastScore(phone);
    res.json({ ok: true, phone, source: 'plugin', overall, perCourier, risk, success_pct: overall.success_pct, steadfast_score, data });
    return;
  } catch {
    // fall through to legacy sheet
  }
  try {
    const sheetUrl = SHEET_BASE + '/api/courier/sheet?apiKey=' + encodeURIComponent(apiKey)
      + '&searchTerm=' + encodeURIComponent(phone);
    const data: any = await fetchJson(sheetUrl, 12000);
    if (!data || (data as any).error) throw new Error(((data as any) && (data as any).error) || 'sheet error');
    const { overall, perCourier } = normalizeSheet(data);
    const risk = overall.total > 0 ? riskFrom(overall.success_pct) : 'unknown';
    const steadfast_score = await fetchSteadfastScore(phone);
    res.json({ ok: true, phone, source: 'sheet', overall, perCourier, risk, success_pct: overall.success_pct, steadfast_score, data });
  } catch (e: any) {
    const aborted = e && (e.name === 'AbortError' || e.name === 'TimeoutError');
    res.status(aborted ? 504 : 500).json({ ok: false, phone, msg: aborted ? 'Fraud check timed out' : 'Server Error' });
  }
});

export default router;
