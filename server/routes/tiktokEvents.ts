/**
 * TikTok Events API (server-side) — mirror of the Meta CAPI + GA4 MP pattern.
 *
 * Why server-side: ad blockers kill the browser pixel for a large share of
 * Bangladeshi traffic, and ttclid only survives if we persist it ourselves.
 * Browser ttq.track + this server copy share event_id so TikTok deduplicates.
 *
 * Endpoint: business-api.tiktok.com (NOT api.tiktokbiz.com — the latter is
 * the Marketing API host and does not resolve).
 */
import { Router, type Request, type Response } from 'express';
import { createHash } from 'crypto';

const router = Router();

const TIKTOK_API_URL = 'https://business-api.tiktok.com/open_api/v1.3/event/track/';

// TikTok rejects events outside this standard set; anything else is dropped.
const ALLOWED = new Set([
  'ViewContent', 'AddToWishlist', 'Search', 'AddPaymentInfo', 'AddToCart',
  'InitiateCheckout', 'PlaceAnOrder', 'CompleteRegistration', 'Purchase',
  'CompletePayment', 'ViewableImpression', 'ClickButton',
]);

const sha256 = (v: string) => createHash('sha256').update(v.trim().toLowerCase()).digest('hex');

/** BD local numbers -> E.164 (+88). TikTok rejects anything else. */
function normalizePhone(raw: string): string | undefined {
  if (!raw) return undefined;
  let d = String(raw).replace(/[^\d+]/g, '');
  if (d.startsWith('+')) d = d.slice(1);
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('88')) return '+' + d;
  if (d.startsWith('0')) return '+88' + d.slice(1);
  if (d.length === 10) return '+88' + d;
  if (d.length === 11 && d.startsWith('1')) return '+88' + d;
  if (d.length >= 8) return '+' + d;
  return undefined;
}

router.post('/sync', async (req: Request, res: Response) => {
  try {
    const token = (process.env.TIKTOK_API_TOKEN || '').trim();
    const pixelId = (process.env.TIKTOK_PIXEL_ID || process.env.VITE_TIKTOK_PIXEL_ID || '').trim();
    if (!token || !pixelId) {
      return res.json({ ok: true, skipped: true, reason: 'tiktok_not_configured' });
    }

    const body = req.body || {};
    const eventName = String(body.event_name || '').trim();
    if (!ALLOWED.has(eventName)) {
      return res.json({ ok: true, skipped: true, reason: 'unsupported_event' });
    }

    const ud = body.user_data || {};
    const cd = body.custom_data || {};

    const email = String(ud.em || '').trim();
    const phone = normalizePhone(ud.ph || '');

    const cfIp = (req.headers as any)['cf-connecting-ip'];
    const xff = req.headers['x-forwarded-for'];
    const ip =
      (typeof cfIp === 'string' && cfIp.trim()) ||
      (typeof xff === 'string' ? xff.split(',').pop()!.trim() : '') ||
      req.socket.remoteAddress || '';
    const ua = req.headers['user-agent'] ? String(req.headers['user-agent']) : '';

    // TikTok requires at least one user identifier plus IP/UA for match quality.
    const user: any = {};
    if (ud.ttclid) user.ttclid = String(ud.ttclid);
    if (ud.ttp) user.ttp = String(ud.ttp);
    if (email) user.email = sha256(email);
    if (phone) user.phone = sha256(phone.slice(1)); // digits only, no '+'
    if (ud.external_id) user.external_id = String(ud.external_id);
    if (ip) user.ip = ip;
    if (ua) user.user_agent = ua;

    if (!user.ttclid && !user.email && !user.phone && !user.external_id) {
      return res.json({ ok: true, skipped: true, reason: 'no_identifier' });
    }

    const eventData: any = {
      event: eventName,
      event_time: Number(body.event_time || Math.floor(Date.now() / 1000)),
      // Must match the browser pixel's event id so TikTok deduplicates.
      event_id: String(body.event_id || `tt-${Date.now()}`),
      user,
      page: {
        url: body.event_source_url || process.env.DOMAIN_URL || 'https://bunonfabrics.com',
      },
    };

    if (req.headers['referer']) eventData.page.referrer = String(req.headers['referer']);

    // value/currency live under "properties", and contents are singular
    // content_id objects (TikTok never accepted Meta's content_ids array).
    const props: any = {
      currency: cd.currency ? String(cd.currency).toUpperCase() : 'BDT',
    };
    if (cd.value != null && Number.isFinite(Number(cd.value))) props.value = Number(cd.value);
    if (cd.order_id) props.order_id = String(cd.order_id);
    if (cd.num_items != null) props.num_items = Number(cd.num_items);
    if (cd.content_name) props.content_name = String(cd.content_name);
    if (cd.content_type) props.content_type = String(cd.content_type);

    const ids = Array.isArray(cd.content_ids)
      ? cd.content_ids
      : cd.content_ids != null ? [cd.content_ids] : [];
    if (ids.length) {
      props.contents = ids.map((id: any) => ({
        content_id: String(id),
        content_type: String(cd.content_type || 'product'),
        ...(cd.content_name ? { content_name: String(cd.content_name) } : {}),
        ...(cd.value != null && ids.length === 1 ? { price: Number(cd.value) } : {}),
      }));
    }
    eventData.properties = props;

    const payload: any = {
      event_source: 'web',
      event_source_id: pixelId,
      data: [eventData],
    };
    if (process.env.TIKTOK_TEST_CODE) payload.test_event_code = process.env.TIKTOK_TEST_CODE;

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(TIKTOK_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Access-Token': token },
        body: JSON.stringify(payload),
        signal: ctrl.signal,
      });
      const text = await r.text();
      let parsed: any = {};
      try { parsed = JSON.parse(text); } catch { /* non-JSON body */ }
      const code = parsed?.code ?? 0;
      const message = parsed?.message || '';
      if (code === 0) {
        console.log(`[TIKTOK SUCCESS] ${eventName} - ID: ${eventData.event_id}`);
      } else {
        console.warn(`[TIKTOK FAIL] ${eventName} code=${code} msg=${String(message).slice(0, 200)}`);
      }
      return res.json({ ok: true, tiktok_code: code, tiktok_message: message || null });
    } catch (e: any) {
      // Never let TikTok block the browser pixel or the Meta/GA4 path.
      console.warn(`[TIKTOK ERROR] ${eventName}: ${e.message}`);
      return res.json({ ok: true, error: e.message });
    } finally {
      clearTimeout(timer);
    }
  } catch (e: any) {
    console.warn(`[TIKTOK ROUTE ERROR] ${e.message}`);
    return res.json({ ok: true, error: e.message });
  }
});

export default router;