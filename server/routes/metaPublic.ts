import express from 'express';
import { getSecret } from '../utils/secrets';
// Public Meta webhook (verify + receive, code-only) + OAuth start/callback (secrets via Settings, never logged).
const router = express.Router();
// GET /api/meta/webhook?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
router.get('/webhook', async (req, res) => {
  const mode = req.query['hub.mode'], token = req.query['hub.verify_token'], challenge = req.query['hub.challenge'];
  const verify = (await getSecret('meta_webhook_verify_token', ['META_WEBHOOK_VERIFY_TOKEN'])) || '';
  if (mode === 'subscribe' && token && verify && token === verify) return res.status(200).send(String(challenge || ''));
  return res.sendStatus(403);
});
// POST /api/meta/webhook — verify signature, enrich + forward summary to Telegram, ack.
import crypto from 'crypto';
import { productDbPool } from '../db';
const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
// nupur 2026-09-29: Meta webhook alerts must go only to Nasrul's DM, not the
// 'Lead Bunon' channel (-1003800514507) or any group. Owner-direct override first.
const TG_CHAT = process.env.META_WEBHOOK_ALERT_CHAT_ID || '';
// nupur 2026-10-01: the app-level webhook is not scoped by ad account, so every
// account subscribed to this app posts here. Forward only our own account.
const OWN_AD_ACCOUNT = '9062712053815635';
const GRAPH = 'https://graph.facebook.com/v21.0/';
const g: any = global as any;
g.__metaCache = g.__metaCache || new Map();
g.__metaAlertSeen = g.__metaAlertSeen || new Map();

const cacheGet = (k: string, ttlMs: number): any => {
  const hit = g.__metaCache.get(k);
  if (hit && Date.now() - hit.t < ttlMs) return hit.v;
  return undefined;
};
const cacheSet = (k: string, v: any) => g.__metaCache.set(k, { t: Date.now(), v });

const graphGet = async (path: string, fields?: string): Promise<any> => {
  const tok = await getSecret('meta_access_token', ['META_ACCESS_TOKEN']);
  if (!tok) return null;
  const url = `${GRAPH}${path}?access_token=${encodeURIComponent(tok)}${fields ? `&fields=${encodeURIComponent(fields)}` : ''}`;
  try {
    const r = await fetch(url, { method: 'GET' });
    const j: any = await r.json();
    return j && !j.error ? j : null;
  } catch { return null; }
};

// Resolve an ad id to human names + 7d money. 6h cache; returns null if the ad
// is not in our account (foreign alert) so the alert still shows the raw ID.
const enrichAd = async (id: string): Promise<string | null> => {
  if (!id) return null;
  const key = 'ad:' + id;
  const c = cacheGet(key, 6 * 3600_000);
  if (c !== undefined) return c;
  const ad: any = await graphGet(id, 'id,name,status,effective_status,adset{id,name,campaign{id,name}}');
  if (!ad) { cacheSet(key, null); return null; }
  const L: string[] = [`🏷️ ${ad.name || '(নাম নেই)'}`];
  if (ad.adset) L.push(`📂 Ad Set: ${ad.adset.name}`);
  if (ad.adset && ad.adset.campaign) L.push(`📁 Campaign: ${ad.adset.campaign.name}`);
  L.push(`🔎 Status: ${ad.effective_status || ad.status || '—'}`);
  const ins: any = await graphGet(`${id}/insights`, 'spend,impressions,clicks,ctr,actions,action_values');
  if (ins && ins.data && ins.data[0]) {
    const d = ins.data[0];
    const spend = Number(d.spend || 0);
    const purch = (d.actions || []).filter((a: any) => String(a.action_type).includes('purchase'));
    const val = (d.action_values || []).filter((a: any) => String(a.action_type).includes('purchase'));
    const cnt = purch.reduce((s: number, a: any) => s + Number(a.value || 0), 0);
    const rev = val.reduce((s: number, a: any) => s + Number(a.value || 0), 0);
    L.push(`💵 ৭ দিনের খরচ: $${spend.toFixed(2)} | 👆 ক্লিক: ${d.clicks || 0} | CTR: ${Number(d.ctr || 0).toFixed(2)}%`);
    if (cnt && spend) L.push(`🛒 বিক্রি: ${cnt} | আয়: $${rev.toFixed(2)} | ROAS: ${(rev / spend).toFixed(2)}x`);
  }
  const out = L.join('\n');
  cacheSet(key, out);
  return out;
};

const enrichCatalog = async (catalogId: string): Promise<string | null> => {
  if (!catalogId) return null;
  const key = 'cat:' + catalogId;
  const c = cacheGet(key, 3 * 3600_000);
  if (c !== undefined) return c;
  const cat: any = await graphGet(catalogId, 'id,name,product_count');
  const out = cat ? `📦 Catalog: ${cat.name} (${cat.product_count || 0}টি প্রোডাক্ট)` : null;
  cacheSet(key, out);
  return out;
};

router.post('/webhook', async (req, res) => {
  try {
    const body = (req.body as any) || {};
    const secret = await getSecret('meta_app_secret');
    const sig = String(req.headers['x-hub-signature-256'] || '');
    if (secret && sig.startsWith('sha256=')) {
      const raw = (req as any).rawBody || Buffer.from(JSON.stringify(body));
      const expect = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
      if (expect.length !== sig.length || !crypto.timingSafeEqual(Buffer.from(expect), Buffer.from(sig))) {
        console.warn('[meta-webhook] bad signature');
        return res.sendStatus(403);
      }
    }
    const object = body.object || '?';
    const esc = (t: any): string => String(t ?? '?').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const acctOf = (e: any, v: any) => String((v && v.ad_account_id) || (object === 'ad_account' ? e.id : '') || '');
    const fmtChange = async (f: string, v: any): Promise<string[]> => {
      const L: string[] = [];
      if (f === 'with_issues_ad_objects') {
        L.push('⚠️ <b>Ad-এ সমস্যা</b>', `🧩 Level: ${esc(v.level)}`, `🆔 ID: ${esc(v.id)}`, `❌ ${esc(v.error_summary || v.error_message || ('code ' + v.error_code))}`);
        if (v.error_message && v.error_summary) L.push(esc(v.error_message).slice(0, 300));
        const e = await enrichAd(String(v.id || ''));
        if (e) L.push('', e);
      } else if (f === 'in_process_ad_objects') {
        L.push('🔄 <b>Ad রিভিউ চলছে</b>', `🧩 Level: ${esc(v.level)}`, `🆔 ID: ${esc(v.id)}`, `📌 Status: ${esc(v.status_name)}`);
        const e = await enrichAd(String(v.id || ''));
        if (e) L.push('', e);
      } else if (f === 'creative_fatigue') {
        L.push('😴 <b>Creative ক্লান্ত</b>', `🆔 Ad: ${esc(v.adgroup_id)}`, `📊 Level: ${esc(v.creative_fatigue_level)}`, esc(v.creative_fatigue_message || '').slice(0, 300));
        const e = await enrichAd(String(v.adgroup_id || ''));
        if (e) L.push('', e);
      } else if (f === 'ad_recommendations') {
        L.push('💡 <b>Meta পরামর্শ</b>', `🏷️ ${esc(v.recommendation_type)}`, `📍 Stage: ${esc(v.recommendation_stage || '—')}`, esc(v.recommendation_message || '').slice(0, 300));
        if (v.recommendation_hash) L.push(`🔗 Ref: ${esc(v.recommendation_hash)}`);
      } else if (f === 'product_set_issue') {
        L.push('📦 <b>Product Set সমস্যা</b>', `🏷️ ${esc(v.type)}`, esc(v.description || '').slice(0, 400), `✅ করণীয়: ${esc(v.recommended_action || '—').slice(0, 200)}`);
        const e = await enrichCatalog(String(v.catalog_id || ''));
        if (e) L.push(e);
      } else if (f === 'items_batch') {
        L.push('📥 <b>Catalog Batch</b>', `📌 Status: ${esc(v.status)}`, `🆔 Catalog: ${esc(v.catalog_id)}`);
        const e = await enrichCatalog(String(v.catalog_id || ''));
        if (e) L.push(e);
      } else if (f === 'product_feed') {
        L.push('📥 <b>Product Feed</b>', `📌 Status: ${esc(v.status)}`, `🆔 Feed: ${esc(v.product_feed_id)}`);
        const e = await enrichCatalog(String(v.catalog_id || ''));
        if (e) L.push(e);
        if (v.errors) L.push('❌ ' + esc(JSON.stringify(v.errors)).slice(0, 300));
      } else if (f === 'product_set_product_status') {
        L.push('🧾 <b>প্রোডাক্ট স্ট্যাটাস</b>', `📌 ${esc(v.status)}`, `🆔 ${esc(v.product_id || v.id || '—')}`);
        if (v.reason) L.push('❌ ' + esc(v.reason).slice(0, 300));
      } else if (f === 'ads_async_creation_request') {
        L.push('⚙️ <b>Ad তৈরি</b>', `📌 Status: ${esc(v.status)}`, v.error_message ? `❌ ${esc(v.error_message).slice(0, 200)}` : '✅ সফল');
        const e = await enrichAd(String(v.ad_id || v.id || ''));
        if (e) L.push('', e);
      } else if (f === 'marketing_messages_subscriber_upload_status') {
        L.push('📨 <b>Marketing Message Upload</b>', `📌 Status: ${esc(v.status)}`, `🆔 ${esc(v.id || '—')}`);
        if (v.error_message) L.push('❌ ' + esc(v.error_message).slice(0, 200));
      } else if (f === 'test_alert') {
        L.push('🧪 <b>Test Alert</b>', esc((v as any).note || 'webhook কাজ করছে'));
      } else {
        L.push('📋 Field: <b>' + esc(f) + '</b>', esc(typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 300));
      }
      return L;
    };
    const nowMs = Date.now();
    for (const [k, t] of Array.from(g.__metaAlertSeen.entries()) as any) { if (nowMs - (t as number) > 1800000) g.__metaAlertSeen.delete(k); }
    const evtKeys: string[] = [];
    let foreign = 0;
    for (const e of (body.entry || [])) for (const c of (e.changes || [])) {
      const vv: any = c.value || {};
      const acct = acctOf(e, vv);
      if (acct && acct !== OWN_AD_ACCOUNT) { foreign++; continue; }
      evtKeys.push((c.field || '?') + '|' + (vv.id || vv.adgroup_id || vv.catalog_id || vv.product_feed_id || '?') + '|' + (vv.status_name || vv.status || vv.error_code || vv.recommendation_type || ''));
    }
    if (foreign) console.log('[meta-webhook] dropped foreign-account changes=', foreign);
    const freshKeys = evtKeys.filter(k => !g.__metaAlertSeen.has(k));
    if (evtKeys.length && !freshKeys.length) { console.log('[meta-webhook] deduped, keys=' + evtKeys.join(',')); return res.status(200).json({ ok: true, deduped: true }); }
    freshKeys.forEach(k => g.__metaAlertSeen.set(k, nowMs));
    const lines: string[] = ['🔔 <b>Meta Alert</b> — bunon.shop', ''];
    const rows: any[] = [];
    for (const e of (body.entry || []).slice(0, 5)) {
      if (e.time) lines.push('🕒 ' + new Date(e.time * 1000).toLocaleString('en-GB'));
      for (const c of (e.changes || []).slice(0, 5)) {
        const vv: any = c.value || {};
        const acct = acctOf(e, vv);
        if (acct && acct !== OWN_AD_ACCOUNT) continue;
        lines.push(...await fmtChange(c.field || '?', vv));
        lines.push('');
        rows.push([new Date((e.time || Math.floor(nowMs / 1000)) * 1000), object, c.field || '', acct || OWN_AD_ACCOUNT, JSON.stringify(vv).slice(0, 2000)]);
      }
    }
    console.log('[meta-webhook] event received, object=', object, 'rows=', rows.length);
    try { console.log('[meta-webhook] payload=' + JSON.stringify(body).slice(0, 2000)); } catch (_) {}
    if (rows.length) {
      try {
        await productDbPool.query('INSERT INTO meta_webhook_log (event_time, object_type, field_name, ad_account_id, payload) VALUES ?', [rows]);
      } catch (er: any) { console.error('[meta-webhook] db log failed:', er?.message || er); }
    }
    if (TG_TOKEN && TG_CHAT) {
      fetch('https://api.telegram.org/bot' + TG_TOKEN + '/sendMessage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: TG_CHAT, text: lines.join('\n').slice(0, 3500), parse_mode: 'HTML', disable_web_page_preview: true, disable_notification: true }),
      }).catch((er: any) => console.error('[meta-webhook] tg failed:', er?.message || er));
    }
    res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('[meta-webhook] handler error:', e?.message || e);
    res.status(200).json({ ok: true });
  }
});
// GET /api/meta/oauth/start — redirect to FB OAuth dialog (app id via Settings, else env)
router.get('/oauth/start', async (_req, res) => {
  const appId = await getSecret('meta_app_id');
  const redirect = (await getSecret('meta_oauth_redirect_uri')) || 'https://bunon.shop/api/meta/oauth/callback';
  if (!appId) return res.status(500).json({ ok: false, error: 'META_APP_ID not configured' });
  const url = 'https://www.facebook.com/' + (process.env.META_API_VERSION || 'v19.0') + '/dialog/oauth?' + new URLSearchParams({ client_id: appId, redirect_uri: redirect, scope: 'ads_read,ads_management,business_management' }).toString();
  res.redirect(url);
});
// GET /api/meta/oauth/callback?code=... — exchange (token never echoed/logged)
router.get('/oauth/callback', async (req, res) => {
  try {
    const code = String(req.query.code || '');
    if (!code) return res.status(400).json({ ok: false, error: 'missing code' });
    const appId = await getSecret('meta_app_id'), secret = await getSecret('meta_app_secret');
    const redirect = (await getSecret('meta_oauth_redirect_uri')) || 'https://bunon.shop/api/meta/oauth/callback';
    if (!appId || !secret) return res.status(500).json({ ok: false, error: 'META_APP_ID/SECRET not configured' });
    const r = await fetch('https://graph.facebook.com/' + (process.env.META_API_VERSION || 'v19.0') + '/oauth/access_token?' + new URLSearchParams({ client_id: appId, client_secret: secret, redirect_uri: redirect, code }).toString());
    const j: any = await r.json();
    if (j?.error) return res.status(400).json({ ok: false, error: 'OAuth exchange failed' });
    res.json({ ok: true, received: true, hint: 'Store access_token in Settings meta_access_token (not echoed here).' });
  } catch (e: any) { res.status(500).json({ ok: false, error: String(e?.message || e) }); }
});
export default router;
