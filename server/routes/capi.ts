import express from 'express';
import { getSecret } from '../utils/secrets';
const router = express.Router();

// Secrets resolve per-request: bunon_settings value wins, process.env fallback.
// (PIXEL_ID default kept for storefront parity; CAPI token has no hardcoded fallback.)
const PIXEL_FALLBACK = '887459306920960';

// Meta Marketing API version. v24.0 sunsets 2026-10-06; keep this current or
// server-side CAPI dies and Pixel-only data (ROAS/CPA) is silently lost.
const META_API_VERSION = process.env.META_API_VERSION || 'v22.0';

// GA4 Measurement Protocol: fires alongside Meta CAPI, non-blocking.
// Captures backend events (WhatsApp orders) that browser gtag can never see.
async function fireGA4(
  eventName: string,
  eventId: string,
  customData: any,
  sourceUrl: string,
  userData: any
): Promise<void> {
  const secret = process.env.GA4_API_SECRET;
  if (!secret) return; // not configured -> silently skip, never break CAPI

  const params: Record<string, any> = {
    session_id: eventId,
    engagement_time_msec: Date.now(),
  };
  if (sourceUrl) params.page_location = sourceUrl;
  if (customData?.value != null) {
    params.value = customData.value;
    params.currency = customData.currency || 'BDT';
  }
  if (customData?.order_id) params.transaction_id = String(customData.order_id);
  if (userData?.client_id) params.client_id = userData.client_id;
  // Without the original ad click ID, GA4 counts paid traffic as organic /
  // unassigned, which is why Meta and Google disagreed on session counts.
  if (userData?.gclid) params.gclid = userData.gclid;
  if (userData?.gbraid) params.gbraid = userData.gbraid;
  if (userData?.wbraid) params.wbraid = userData.wbraid;
  // Never invent a session from event_id: that makes every event a distinct
  // session in GA4 and inflates 'active users'.
  if (userData?.session_id) params.session_id = String(userData.session_id);
  if (userData?.user_id) params.user_id = userData.user_id;

  const body = new URLSearchParams({
    api_secret: secret,
    client_id: userData?.client_id || 'bunon.web',
    events: JSON.stringify([{ name: eventName, params }]),
  });

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const r = await fetch('https://www.google-analytics.com/mp/collect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
      signal: ctrl.signal,
    });
    console.log(`[GA4 MP] ${eventName} -> HTTP ${r.status}`);
  } catch (e: any) {
    // Never let GA4 failure affect the Meta CAPI response path.
    console.warn(`[GA4 MP] ${eventName} failed (non-blocking): ${e.message}`);
  } finally {
    clearTimeout(timer);
  }
}

router.post('/', async (req, res) => {
  try {
    const { event_name, event_time, user_data, custom_data, event_id, event_source_url, action_source } = req.body;

    if (!event_name || !event_id) {
      return res.status(400).json({ error: 'event_name and event_id are required' });
    }

    // Suppress CAPI events for owner/test identities.
    // Meta penalises events that carry PII it cannot attribute to a real buyer,
    // which drags down Event Match Quality and therefore ad optimisation.
    const TEST_PHONES = new Set(['01773258555', '8801799553223']);
    const TEST_EMAILS = new Set(['test@test.com', 'naim@gmail.com']);
    const rawPh = String(user_data?.ph || '').replace(/[\s-]/g, '');
    const rawEm = String(user_data?.em || '').trim().toLowerCase();
    if (TEST_PHONES.has(rawPh) || TEST_EMAILS.has(rawEm)) {
      console.log(`[CAPI SKIP] event=${event_name} ph=${rawPh || 'n/a'} em=${rawEm || 'n/a'} (test identity, not forwarded to Meta)`);
      return res.json({ ok: true, skipped: true, reason: 'test_identity' });
    }

    // Capture standard IP and User-Agent for better Event Match Quality.
    // Behind Cloudflare, x-forwarded-for[0] is a Cloudflare edge IP (162.158.x),
    // which Meta read as the visitor's real location and mis-attributed ads.
    // cf-connecting-ip is the true client address Cloudflare forwards.
    const cfIp = (req.headers as any)['cf-connecting-ip'];
    const xff = req.headers['x-forwarded-for'];
    const clientIpAddress =
      (typeof cfIp === 'string' && cfIp.trim()) ||
      (typeof xff === 'string' ? xff.split(',').pop()!.trim() : '') ||
      req.socket.remoteAddress ||
      req.ip;
    const clientUserAgent = req.headers['user-agent'] || '';

    // Cloudflare already resolved the visitor's country for us; sending it as
    // `ct` lets Meta grade Event Match Quality instead of guessing from IP.
    const cfCountry = String((req.headers as any)['cf-ipcountry'] || '').trim().toUpperCase();
    const country = /^[A-Z]{2}$/.test(cfCountry) ? cfCountry : undefined;

    // Helper to normalize and hash in SHA256
    const hashData = (val: string) => {
      if (!val) return undefined;
      const normalized = val.toString().trim().toLowerCase();
      if (!normalized) return undefined;
      return require('crypto').createHash('sha256').update(normalized).digest('hex');
    };

    const userDataHash: any = { ...(user_data || {}) };
    // ct must be present or Meta treats the event as geo-unspecified.
    if (!userDataHash.ct && !userDataHash.country && country) {
      userDataHash.ct = country;
    }
    const hashedUserData: any = {};
    
    // Hash specific fields if they exist
    ['em', 'ph', 'fn', 'ln', 'ge', 'db', 'ct', 'st', 'zp', 'country', 'external_id'].forEach(key => {
      if (userDataHash[key]) {
        // external_id does not strictly require hashing but it's often recommended, however Bunon sends plain external_id, we will hash it just in case or leave it plain if we don't want to break it. 
        // FB accepts plain external_id, but email, phone, name, etc MUST be hashed.
        if (key === 'external_id') {
          hashedUserData[key] = userDataHash[key];
        } else {
          hashedUserData[key] = hashData(userDataHash[key]);
        }
      }
    });

    const enrichedUserData = {
      ...userDataHash,
      ...hashedUserData,
      client_ip_address: clientIpAddress,
      client_user_agent: clientUserAgent,
    };

    if (process.env.CAPI_DEBUG_GEO === '1') {
      console.log(`[CAPI GEO] ${event_name} ip=${clientIpAddress} cc=${country || 'unknown'}`);
    }

    // Meta accepts the Google click ID so its own attribution agrees with GA4.
    // custom_data is const (destructured), so merge into a separate object.
    const metaCustomData: any = { ...(custom_data || {}) };
    if (user_data?.gclid && !metaCustomData.gclid) metaCustomData.gclid = user_data.gclid;

    const payload: any = {
      data: [
        {
          event_name,
          event_time: event_time || Math.floor(Date.now() / 1000),
          action_source: action_source || 'website',
          event_id: event_id,
          event_source_url: event_source_url || (process.env.DOMAIN_URL || 'https://bunon.shop'),
          user_data: enrichedUserData,
          custom_data: metaCustomData
        }
      ]
    };

    // Add Test Event Code if provided in environment variables for debugging
    const testCode = process.env.META_TEST_EVENT_CODE;;
    if (testCode && process.env.META_TEST_EVENTS === 'true') {
      payload.test_event_code = testCode;
    }

    const PIXEL_ID = (await getSecret('meta_pixel_id')) || PIXEL_FALLBACK;
    const CAPI_TOKEN = await getSecret('meta_capi_token');
    if (!CAPI_TOKEN) {
      return res.status(500).json({ success: false, error: 'Meta CAPI token not configured (Settings → Meta / Eman Keys)' });
    }

    const url = `https://graph.facebook.com/${META_API_VERSION}/${PIXEL_ID}/events?access_token=${CAPI_TOKEN}`;

    // RETRY: Meta CAPI egress is intermittently blocked on this host (ConnectTimeout).
    // 3 attempts, exponential backoff, hard 8s timeout per attempt so we never hang the request.
    let response = null;
    let lastErr = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: ctrl.signal
        });
        clearTimeout(timer);
        break;
      } catch (e) {
        lastErr = e;
        console.warn(`[CAPI] attempt ${attempt}/3 failed: ${e.message}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 800));
      }
    }
    if (!response) {
      console.error('[CAPI EXCEPTION] all retries failed:', lastErr);
      return res.status(500).json({ success: false, error: 'Upstream CAPI unreachable' });
    }

    const result = await response.json();
    
    if (result.error) {
      console.error('[CAPI ERROR]', result.error);
      return res.status(400).json({ success: false, error: result.error });
    }

    // Fire-and-forget: response is already formed, GA4 must not delay it.
    fireGA4(event_name, event_id, custom_data, event_source_url, user_data).catch(() => {});

    console.log(`[CAPI SUCCESS] ${event_name} - ID: ${event_id}`);
    res.json({ success: true, result });

  } catch (err) {
    console.error('[CAPI EXCEPTION]', err);
    res.status(500).json({ success: false, error: 'Internal Server Error' });
  }
});

export default router;
