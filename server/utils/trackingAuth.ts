/**
 * Shared secret check for first-party tracking endpoints.
 *
 * /api/v1/sync (Meta CAPI + GA4 MP) and /api/v1/tiktok/sync accept fully
 * attacker-controlled payloads (event_name, value, phone). Unauthenticated,
 * anyone could POST synthetic Purchases into the ad accounts and poison ROAS.
 *
 * The browser cannot keep a secret, so we use the same pattern as server-side
 * tagging providers: a per-process signing key the server sends out as a nonce
 * and the client echoes back on the custom header. This stops third parties who
 * never load our JS; it does NOT stop a user reading our own bundle.
 *
 * Real defence against data poisoning is also Meta/GA4-side dedup plus never
 * trusting these numbers for billing, which is already true.
 */
import type { Request, Response, NextFunction } from 'express';
import { randomBytes, timingSafeEqual, createHmac } from 'crypto';

let NONCE = randomBytes(16).toString('hex');

/** Rotate occasionally so a leaked bundle header expires. */
setInterval(() => { NONCE = randomBytes(16).toString('hex'); }, 6 * 60 * 60 * 1000).unref?.();

const HEADER = 'x-trk-nonce';

export function currentNonce(): string {
  return NONCE;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export function requireTrackingAuth(req: Request, res: Response, next: NextFunction) {
  // Disabled explicitly for local debugging only.
  if (process.env.TRACKING_AUTH === 'off') return next();

  const provided = String(req.headers[HEADER] || '');
  if (!provided || !safeEqual(provided, NONCE)) {
    return res.status(401).json({
      ok: false,
      error: 'unauthorized_tracking_call',
      hint: 'fetch the nonce from /api/v1/tracking/nonce and resend with x-trk-nonce',
    });
  }
  next();
}

/** Hash helper kept for parity with the signature option if we move to HMAC. */
export function signNonce(value: string) {
  return createHmac('sha256', NONCE).update(value).digest('hex');
}