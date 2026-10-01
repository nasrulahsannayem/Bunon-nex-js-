import express from 'express';
import { getSecret } from '../../utils/secrets';
import { requirePermission } from '../../middleware/auth';
// Read-only Meta KPI proxy ported from dash_ref api/meta_kpi.php + meta_ads_live_fetch.php + meta_accounts.php
// Secrets via Settings (getSecret) with env fallback. Never logged.
const router = express.Router();
const API_VER = process.env.META_API_VERSION || 'v19.0';
let activeAccount = '';

async function token(): Promise<string> { return getSecret('meta_access_token'); }
async function accounts(): Promise<string[]> {
  if (activeAccount) return [activeAccount];
  const multi = ((await getSecret('meta_ad_account_ids', ['META_AD_ACCOUNT_IDS'])) || '').split(',').map(s => s.trim()).filter(Boolean);
  const single = (await getSecret('meta_ad_account_id')) || '';
  const all = [...multi, ...(single ? [single] : [])].filter(Boolean);
  return [...new Set(all.map(a => a.startsWith('act_') ? a : 'act_' + a.replace(/\D/g, '')))];
}
function rangeOf(range: string, from: string, to: string): { since: string; until: string } {
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const now = new Date();
  switch (range) {
    case 'yesterday': { const d = new Date(now); d.setDate(d.getDate() - 1); return { since: fmt(d), until: fmt(d) }; }
    case 'last7': { const d = new Date(now); d.setDate(d.getDate() - 6); return { since: fmt(d), until: fmt(now) }; }
    case 'last30': { const d = new Date(now); d.setDate(d.getDate() - 29); return { since: fmt(d), until: fmt(now) }; }
    case 'this_month': return { since: fmt(now).slice(0, 7) + '-01', until: fmt(now) };
    case 'this_week': { const d = new Date(now); const day = (d.getDay() + 6) % 7; d.setDate(d.getDate() - day); return { since: fmt(d), until: fmt(now) }; }
    case 'this_year': return { since: fmt(now).slice(0, 4) + '-01-01', until: fmt(now) };
    case 'lifetime': { const d = new Date(now); d.setMonth(d.getMonth() - 36); return { since: fmt(d), until: fmt(now) }; }
    case 'custom': return { since: from || fmt(now), until: to || fmt(now) };
    default: return { since: fmt(now), until: fmt(now) };
  }
}
const PICK: Record<string, string[]> = {
  purchase: ['offsite_conversion.purchase', 'offsite_conversion.fb_pixel_purchase', 'website_purchase'],
  view_content: ['view_content', 'offsite_conversion.fb_pixel_view_content'],
  add_to_cart: ['add_to_cart', 'offsite_conversion.fb_pixel_add_to_cart'],
  initiate_checkout: ['initiate_checkout', 'offsite_conversion.fb_pixel_initiate_checkout'],
};
function sumActions(actions: any[], key: string): number {
  let n = 0;
  for (const a of actions || []) if ((PICK[key] || []).includes(a?.action_type)) n += Number(a?.value || 0);
  return n;
}
async function g(url: string, params: Record<string, string>): Promise<any> {
  const qs = new URLSearchParams(params).toString();
  const r = await fetch(url + '?' + qs);
  return r.json();
}
// GET /api/admin/meta/status — sync/config status (read-only, no Graph call)
router.get('/status', requirePermission('view_kpi_advanced'), async (_req, res) => {
  const tk = await token();
  const accts = await accounts();
  res.json({ ok: true, connected: Boolean(tk), accounts: accts, active_account: accts[0] || null, api_version: API_VER, last_sync: null, mode: 'live-read-only' });
});
// GET /api/admin/meta/accounts
router.get('/accounts', requirePermission('view_kpi_advanced'), async (_req, res) => {
  const list = await accounts();
  const tk = await token();
  const rows = await Promise.all(list.map(async (id, i) => {
    let name = id;
    try {
      const r: any = await g('https://graph.facebook.com/' + API_VER + '/' + id, { access_token: tk, fields: 'name,account_status' });
      if (r && r.name) name = r.name;
    } catch { /* name optional */ }
    return { id, name, active: i === 0 };
  }));
  res.json({ ok: true, accounts: rows, active_id: list[0] || '' });
});
// POST /api/admin/meta/account {account_id} — set active (memory only)
router.post('/account', requirePermission('edit_marketing'), (req, res) => {
  const id = String(req.body?.account_id || req.body?.ad_account_id || '').trim();
  if (!id) return res.status(400).json({ ok: false, error: 'account_id required' });
  activeAccount = id.startsWith('act_') ? id : 'act_' + id.replace(/\D/g, '');
  res.json({ ok: true, active_id: activeAccount });
});
// GET /api/admin/meta/kpi?range=today&from=&to=&mode=day&account_id=
router.get('/kpi', requirePermission('view_kpi_advanced'), async (req, res) => {
  try {
    const tk = await token();
    if (!tk) return res.json({ ok: false, error: 'Meta access token not configured (META_ACCESS_TOKEN)' });
    const q = req.query as Record<string, string>;
    if (q.account_id) activeAccount = q.account_id.startsWith('act_') ? q.account_id : 'act_' + q.account_id.replace(/\D/g, '');
    const acct = (await accounts())[0];
    if (!acct) return res.json({ ok: false, error: 'No ad account configured (META_AD_ACCOUNT_ID)' });
    const { since, until } = rangeOf(q.range || 'today', q.from || '', q.to || '');
    const time_range = JSON.stringify({ since, until });
    const modeInc = q.mode === 'month' ? '30' : q.mode === 'week' ? '7' : '1';
    const base = `https://graph.facebook.com/${API_VER}/${acct}/insights`;
    const main: any = await g(base, { access_token: tk, fields: 'date_start,spend,impressions,clicks,reach,actions,cpm,cpc,frequency,website_purchase_roas', level: 'account', time_increment: modeInc, time_range });
    if (main?.error) return res.json({ ok: false, error: 'Meta API Error', details: main.error });
    const summary = { spend: 0, purchases: 0, impressions: 0, clicks: 0, reach: 0, revenue: 0, view_content: 0, add_to_cart: 0, initiate_checkout: 0, roas: 0, cpa: 0, cpc: 0, cpm: 0, frequency: 0 };
    const breakdown: any[] = [];
    for (const row of main?.data || []) {
      const spend = Number(row.spend || 0), pur = sumActions(row.actions, 'purchase');
      const roas = Number(row?.website_purchase_roas?.[0]?.value || 0);
      summary.spend += spend; summary.impressions += Number(row.impressions || 0); summary.clicks += Number(row.clicks || 0);
      summary.reach += Number(row.reach || 0); summary.purchases += pur;
      summary.revenue += spend * roas;
      summary.view_content += sumActions(row.actions, 'view_content');
      summary.add_to_cart += sumActions(row.actions, 'add_to_cart');
      summary.initiate_checkout += sumActions(row.actions, 'initiate_checkout');
      breakdown.push({ date: row.date_start, spend, purchases: pur, revenue: spend * roas, roas, cpa: pur > 0 ? spend / pur : 0 });
    }
    if (summary.clicks > 0) summary.cpc = summary.spend / summary.clicks;
    if (summary.impressions > 0) summary.cpm = (summary.spend / summary.impressions) * 1000;
    if (summary.purchases > 0) summary.cpa = summary.spend / summary.purchases;
    if (summary.spend > 0) summary.roas = summary.revenue / summary.spend;
    if (summary.reach > 0) summary.frequency = summary.impressions / summary.reach;
    const camp: any = await g(base, { access_token: tk, level: 'campaign', fields: 'campaign_name,spend,actions,website_purchase_roas,clicks,impressions', time_range, limit: '50' });
    const campaigns = (camp?.data || []).map((c: any) => {
      const sp = Number(c.spend || 0), pur = sumActions(c.actions, 'purchase');
      const imp = Number(c.impressions || 0), clk = Number(c.clicks || 0);
      return { name: c.campaign_name || '', spend: sp, purchases: pur, cpa: pur > 0 ? sp / pur : 0, roas: Number(c?.website_purchase_roas?.[0]?.value || 0), impressions: imp, clicks: clk, ctr: imp > 0 ? (clk / imp) * 100 : 0 };
    });
    // Audience breakdowns (age/gender/placement/device/city) — best-effort, never fails the response
    // PLACEMENT_BLOCK
    let audience: any = { age: [], gender: [] };
    let winners: any = null;
    try {
      const abase = `https://graph.facebook.com/${API_VER}/${acct}/insights`;
      const [ag, gd, pl, dv, ct] = await Promise.all([
        g(abase, { access_token: tk, fields: 'spend,actions,impressions', level: 'account', breakdowns: 'age', time_range, limit: '20' }).catch(() => null),
        g(abase, { access_token: tk, fields: 'spend,actions,impressions', level: 'account', breakdowns: 'gender', time_range, limit: '20' }).catch(() => null),
        g(abase, { access_token: tk, fields: 'spend,actions,impressions', level: 'account', breakdowns: 'publisher_platform,platform_position', time_range, limit: '40' }).catch(() => null),
        g(abase, { access_token: tk, fields: 'spend,actions,impressions', level: 'account', breakdowns: 'impression_device', time_range, limit: '20' }).catch(() => null),
        g(abase, { access_token: tk, fields: 'spend,actions,impressions', level: 'account', breakdowns: 'region', time_range, limit: '30' }).catch(() => null),
      ]);
      const norm = (d: any, key: string) => (d?.data || []).map((r: any) => ({ [key]: r[key] || '?', spend: Number(r.spend || 0), purchases: sumActions(r.actions, 'purchase'), impressions: Number(r.impressions || 0) }));
      const norm2 = (d: any) => (d?.data || []).map((r: any) => ({ platform: [r.publisher_platform, r.platform_position].filter(Boolean).join(' / ') || '?', spend: Number(r.spend || 0), purchases: sumActions(r.actions, 'purchase'), impressions: Number(r.impressions || 0) }));
      audience = { age: norm(ag, 'age'), gender: norm(gd, 'gender'), placement: norm2(pl), device: norm(dv, 'impression_device'), city: norm(ct, 'region') };
      const bestCpa = (rows: any[]) => { const w = rows.filter((r: any) => r.purchases > 0); if (!w.length) return null; return w.sort((a: any, b: any) => (a.spend / a.purchases) - (b.spend / b.purchases))[0]; };
      winners = { age: bestCpa(audience.age), gender: bestCpa(audience.gender), platform: bestCpa(audience.placement), city: bestCpa(audience.city) };
    } catch { /* audience optional */ }
    // Best performing campaign by ROAS (min 1 purchase)
    const withPur = campaigns.filter((c: any) => c.purchases > 0);
    const best = [...campaigns].sort((a: any, b: any) => (b.roas || 0) - (a.roas || 0))[0] || null;
    // Funnel + cost/revenue panels from summary
    const funnel = [
      { stage: 'View Content', value: summary.view_content },
      { stage: 'Add To Cart', value: summary.add_to_cart },
      { stage: 'Initiate Checkout', value: summary.initiate_checkout },
      { stage: 'Purchase', value: summary.purchases },
    ];
    let topAds: any[] = [];
    try {
      const ad: any = await g(base, { access_token: tk, fields: 'ad_name,campaign_name,spend,actions,impressions,clicks', level: 'ad', time_range, limit: '50' });
      topAds = (ad?.data || []).map((r: any) => {
        const sp = Number(r.spend || 0), pu = sumActions(r.actions, 'purchase');
        const imp = Number(r.impressions || 0), clk = Number(r.clicks || 0);
        return { name: r.ad_name || '', campaign: r.campaign_name || '', spend: sp, purchases: pu, cpa: pu > 0 ? sp / pu : 0, impressions: imp, clicks: clk, ctr: imp > 0 ? (clk / imp) * 100 : 0 };
      }).sort((a: any, b: any) => b.spend - a.spend).slice(0, 12);
    } catch { /* topAds optional */ }
    const freqTrend = (breakdown || []).map((d: any) => ({ date: d.date, freq: 0 }));
    res.json({ ok: true, summary, breakdown, campaigns, audience, winners, best, funnel, topAds, account: acct, range: { since, until } });
  } catch (e: any) { res.json({ ok: false, error: String(e?.message || e) }); }
});
// GET /api/admin/meta/ads?range=today — live active campaigns (port of meta_ads_live_fetch.php)
router.get('/ads', requirePermission('view_kpi_advanced'), async (req, res) => {
  try {
    const tk = await token();
    if (!tk) return res.json({ ok: false, error: 'Meta access token not configured' });
    const acct = (await accounts())[0];
    if (!acct) return res.json({ ok: false, error: 'No ad account configured' });
    const r = await fetch(`https://graph.facebook.com/${API_VER}/${acct}/campaigns?` + new URLSearchParams({ fields: 'id,name,effective_status', limit: '50', access_token: tk }));
    const j: any = await r.json();
    if (j?.error) return res.json({ ok: false, error: 'Meta API Error', details: j.error });
    const actives = (j?.data || []).filter((c: any) => String(c.effective_status || '').toUpperCase() === 'ACTIVE');
    let perf: Record<string, any> = {};
    try {
      const today = new Date().toISOString().slice(0, 10);
      const ins: any = await (await fetch('https://graph.facebook.com/' + API_VER + '/' + acct + '/insights?' + new URLSearchParams({ fields: 'campaign_id,campaign_name,spend,actions,impressions,clicks', level: 'campaign', time_range: JSON.stringify({ since: today, until: today }), limit: '50', access_token: tk }))).json();
      for (const r of (ins?.data || [])) { const sp = Number(r.spend || 0), pu = sumActions(r.actions, 'purchase'); perf[r.campaign_id] = { spend: sp, purchases: pu, cpa: pu > 0 ? sp / pu : 0, impressions: Number(r.impressions || 0), clicks: Number(r.clicks || 0) }; }
    } catch { /* live perf optional */ }
    const rows = actives.map((c: any) => ({ campaign_id: c.id, campaign: c.name, status: 'ACTIVE', ...(perf[c.id] || { spend: 0, purchases: 0, cpa: 0, impressions: 0, clicks: 0 }) }));
    res.json({ ok: true, rows, count: rows.length, account_used: acct });
  } catch (e: any) { res.json({ ok: false, error: String(e?.message || e) }); }
});
// GET /api/admin/meta/true-roas?range=last7 — Meta spend vs backend real orders (True ROAS)
router.get('/true-roas', requirePermission('view_kpi_advanced'), async (req: any, res: any) => {
  try {
    const q = req.query as Record<string, string>;
    const { since, until } = rangeOf(q.range || 'last7', q.from || '', q.to || '');
    const { dbPool } = await import('../../db');
    const [rows]: any = await dbPool.execute(
      'SELECT status, COUNT(*) n, ROUND(SUM(total_payable)) rev, ROUND(SUM(COALESCE(actual_received_amount, 0))) coll FROM bf_orders WHERE DATE(created_at) >= ? AND DATE(created_at) <= ? GROUP BY status',
      [since, until]
    );
    const by: Record<string, any> = {};
    let delivered = 0, deliveredRev = 0, collected = 0, total = 0, cancelled = 0;
    for (const r of rows) {
      by[r.status] = { count: Number(r.n), revenue: Number(r.rev || 0), collected: Number(r.coll || 0) };
      total += Number(r.n);
      if (r.status === 'delivered') { delivered = Number(r.n); deliveredRev = Number(r.rev || 0); collected = Number(r.coll || 0); }
      if (r.status === 'cancelled') cancelled = Number(r.n);
    }
    const tk = await token();
    const acct = (await accounts())[0];
    let meta: any = { spend: 0, purchases: 0 };
    if (tk && acct) {
      const j: any = await g('https://graph.facebook.com/' + API_VER + '/' + acct + '/insights', { access_token: tk, fields: 'spend,actions', level: 'account', time_range: JSON.stringify({ since, until }) });
      for (const r of (j?.data || [])) { meta.spend += Number(r.spend || 0); meta.purchases += sumActions(r.actions, 'purchase'); }
    }
    const rate = 130; // USD->BDT display rate
    const spendBdt = meta.spend * rate;
    res.json({ ok: true, range: { since, until }, meta, backend: { total, delivered, cancelled, deliveredRev, collected, byStatus: by }, true: { spendBdt: Math.round(spendBdt), gapPurch: meta.purchases - delivered, trueCpa: delivered > 0 ? spendBdt / delivered : 0, trueRoas: spendBdt > 0 ? deliveredRev / spendBdt : 0, cancelRate: total > 0 ? (cancelled / total) * 100 : 0 }, rate });
  } catch (e: any) { res.json({ ok: false, error: String(e?.message || e) }); }
});
export default router;
