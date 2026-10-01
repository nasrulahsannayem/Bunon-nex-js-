/**
 * Body signing for first-party tracking endpoints.
 *
 * /api/v1/sync (Meta CAPI + GA4 MP) and /api/v1/tiktok/sync accept fully
 * attacker-controlled payloads (event_name, value, phone). A previous attempt
 * used a nonce served by a public GET under CORS origin '*', which was proven
 * bypassable from any foreign origin in one curl - that is not auth.
 *
 * The real fix: sign the request body with a secret that never leaves the
 * server. The browser cannot hold a secret, so it cannot forge events either -
 * which is the correct trade-off. Conversions are then reported from
 * server-owned sources (WhatsApp cron, order pipeline) where a real secret is
 * available, and browser clicks are recorded without their monetary fields.
 *
 * Meta's own Event Match Quality is driven by hashed customer identifiers plus
 * IP/UA, not by the value being server-signed, so real purchases still match.
 */
import type { Request, Response, NextFunction } from 'express';
import { createHmac, timingSafeEqual } from 'crypto';

const SECRET = (process.env.TRACKING_SIGNING_SECRET || '').trim();
export const signingEnabled = SECRET.length >= 32;

const SIG_HEADER = 'x-trk-signature';
const TS_HEADER = 'x-trk-timestamp';
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'hex');
  const bb = Buffer.from(b, 'hex');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

export function signBody(body: string, timestamp: number): string {
  return createHmac('sha256', SECRET).update(`${timestamp}.${body}`).digest('hex');
}

export function verifyTrackingSignature(body: string, sig: string, ts: string): boolean {
  if (!signingEnabled) return false;
  const timestamp = Number(ts);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > REPLAY_WINDOW_MS) return false;
  return safeEqual(signBody(body, timestamp), sig);
}

export function requireSignedTracking(req: Request, res: Response, next: NextFunction) {
  // Until a signing secret is provisioned, tracking calls are rejected rather
  // than accepted unverified. Server-owned reporting uses its own secret.
  if (!signingEnabled) {
    return res.status(503).json({
      ok: false,
      error: 'tracking_signing_unconfigured',
    });
  }

  const sig = String(req.headers[SIG_HEADER] || '');
  const ts = String(req.headers[TS_HEADER] || '');
  const rawBuf = (req as any).rawBody as Buffer | undefined;
  const raw = rawBuf && rawBuf.length ? rawBuf.toString('utf8') : '';

  if (!sig || !ts || !verifyTrackingSignature(raw, sig, ts)) {
    return res.status(401).json({ ok: false, error: 'unsigned_tracking_call' });
  }
  next();
}

/**
 * Browser events are accepted but scrubbed: no value, currency, or monetary
 * custom fields, and revenue-bearing events are downgraded to engagement.
 * Meta/GA4 still get the funnel (PageView, ViewContent, AddToCart) for
 * optimisation signals, while ad-account revenue can only come from a signed
 * server-owned call.
 */
const REVENUE_EVENTS = new Set(['Purchase', 'PlaceAnOrder', 'CompletePayment', 'Donate']);

export function browserEventGuard(req: any, res: any, next: any) {
  if (req.method !== 'POST') return next();

  const body = req.body || {};
  const name = String(body.event_name || '');
  const cd = { ...(body.custom_data || {}) };

  // Strip anything monetary regardless of event.
  delete cd.value;
  delete cd.revenue;
  delete cd.total;
  delete cd.order_total;
  delete cd.total_payable;
  delete cd.payment_amount;

  if (REVENUE_EVENTS.has(name)) {
    // Keep the funnel signal, drop the transaction.
    delete cd.transaction_id;
    delete cd.order_id;
    body.custom_data = cd;
    body.event_name = name === 'Purchase' ? 'ViewContent' : 'InitiateCheckout';
    return next();
  }

  body.custom_data = cd;
  return next();
}
