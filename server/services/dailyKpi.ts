/**
 * server/services/dailyKpi.ts — Daily CEO KPI Telegram report.
 * Orders (bf_orders, dash DB) for a given Asia/Dhaka date + Meta ads
 * same-day spend/purchases/ROAS/funnel/best-worst. Bengali HTML output.
 * Idempotent via bf_kpi_sent(report_date, mode). Fail-open everywhere:
 * Meta/Telegram/DB hiccups degrade to partial report, never throw checkout.
 * CLI: REPORT_DATE=YYYY-MM-DD npx tsx server/services/dailyKpi.ts mode=dry|send-test|send
 *   dry       -> print report, no send, no idempotency write
 *   send-test -> send to TELEGRAM_KPI_TEST_CHAT_ID only
 *   send      -> send to TELEGRAM_KPI_CHAT_ID (fallback order/recruitment chat)
 * No pm2 reload, no cron here — scheduler is wired separately.
 */
import { dbPool } from '../db';
import { getSecret } from '../utils/secrets';

const API_VER = process.env.META_API_VERSION || 'v19.0';
const USD_BDT = 130; // display rate, mirrors admin/meta.ts true-roas
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const MAIN_CHAT =
  process.env.TELEGRAM_KPI_CHAT_ID ||
  process.env.TELEGRAM_ORDER_CHAT_ID ||
  process.env.TELEGRAM_RECRUITMENT_CHANNEL_ID || '';
const TEST_CHAT = process.env.TELEGRAM_KPI_TEST_CHAT_ID || '';
const GRAPH_TIMEOUT_MS = 20000;

/* ---------- date helpers (Asia/Dhaka) ---------- */
export function dhakaToday(offsetDays = 0): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86400000));
  return parts; // YYYY-MM-DD
}
/** Dhaka wall-clock bounds for a Dhaka calendar date.
 *  DB datetimes are server-local (Asia/Dhaka, MySQL SYSTEM) — NO UTC shift.
 *  (UTC-shifting here silently drops 18:00-23:59 orders.) */
export function dayBoundsUTC(dateStr: string): { start: string; end: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) throw new Error('bad dateStr: ' + dateStr);
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const e = new Date(d.getTime() + 86400000);
  const f = (x: Date) => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0') + ' ' + String(x.getHours()).padStart(2, '0') + ':' + String(x.getMinutes()).padStart(2, '0') + ':' + String(x.getSeconds()).padStart(2, '0');
  return { start: dateStr + ' 00:00:00', end: f(e) };
}

/* ---------- orders ---------- */
export interface OrderStats {
  date: string;
  total: number;
  revenue: number;
  aov: number;
  byStatus: { status: string; count: number; revenue: number }[];
  courier: { code: string; count: number; revenue: number }[];
  dispatched: number;
  dispatchedBy: { code: string; count: number }[];
  inTransitVal: number;
  dispToday: number;
  dispTodayGMV: number;
  topProducts: { name: string; qty: number; amount: number }[];
  repeatRate: number;
  repeatOrders: number;
  peakHour: string;
  peakHourCount: number;
}
export async function fetchOrderStats(dateStr: string): Promise<OrderStats> {
  const { start, end } = dayBoundsUTC(dateStr);
  const empty: OrderStats = {
    date: dateStr, total: 0, revenue: 0, aov: 0, byStatus: [], courier: [],
    dispatched: 0, dispatchedBy: [], inTransitVal: 0, dispToday: 0, dispTodayGMV: 0,
    topProducts: [], repeatRate: 0, repeatOrders: 0, peakHour: '—', peakHourCount: 0,
  };
  try {
    const [sRows]: any = await dbPool.execute(
      "SELECT status, COUNT(*) n, COALESCE(SUM(total_payable),0) rev FROM bf_orders WHERE created_at >= ? AND created_at < ? AND NOT (phone = '01799553323' AND customer_name LIKE '%test%') GROUP BY status",
      [start, end]);
    let total = 0, revenue = 0;
    const byStatus = (sRows || []).map((r: any) => {
      const count = Number(r.n || 0), rev = Number(r.rev || 0);
      total += count; revenue += rev;
      return { status: String(r.status), count, revenue: Math.round(rev) };
    });
    byStatus.sort((a: any, b: any) => b.count - a.count);
    let courier: OrderStats['courier'] = [];
    try {
      const [cRows]: any = await dbPool.execute(
        "SELECT COALESCE(NULLIF(LOWER(courier_code),''),'manual') c, COUNT(*) n, COALESCE(SUM(total_payable),0) rev FROM bf_orders WHERE created_at >= ? AND created_at < ? AND NOT (phone = '01799553323' AND customer_name LIKE '%test%') GROUP BY 1 ORDER BY n DESC",
        [start, end]);
      courier = (cRows || []).map((r: any) => ({ code: String(r.c), count: Number(r.n || 0), revenue: Math.round(Number(r.rev || 0)) }));
    } catch { /* courier optional */ }
    let dispatched = 0;
    let dispatchedBy: OrderStats['dispatchedBy'] = [];
    try {
      const [dcRows]: any = await dbPool.execute(
        "SELECT COALESCE(NULLIF(LOWER(courier_code),''),'unassigned') c, COUNT(*) n FROM bf_orders WHERE status='in_transit' GROUP BY 1 ORDER BY n DESC");
      dispatchedBy = (dcRows || []).map((r) => ({ code: String(r.c), count: Number(r.n || 0) }));
      dispatched = dispatchedBy.reduce((t, c) => t + c.count, 0);
    } catch { /* dispatch optional */ }
    let topProducts: OrderStats['topProducts'] = [];
    try {
      const [pRows]: any = await dbPool.execute(
        "SELECT i.product_name name, SUM(i.qty) q, COALESCE(SUM(i.line_total),0) amt FROM bf_order_items i JOIN bf_orders o ON o.id = i.order_id WHERE o.created_at >= ? AND o.created_at < ? AND NOT (o.phone = '01799553323' AND o.customer_name LIKE '%test%') GROUP BY i.product_name ORDER BY q DESC LIMIT 3",
        [start, end]);
      topProducts = (pRows || []).map((r: any) => ({ name: String(r.name || '—'), qty: Number(r.q || 0), amount: Math.round(Number(r.amt || 0)) }));
    } catch { /* items optional */ }
    let repeatRate = 0, repeatOrders = 0;
    try {
      const [rRows]: any = await dbPool.execute(
        "SELECT COUNT(*) n, COUNT(DISTINCT phone) u FROM bf_orders WHERE created_at >= ? AND created_at < ? AND NOT (phone = '01799553323' AND customer_name LIKE '%test%') AND phone IS NOT NULL AND phone <> \'\'",
        [start, end]);
      const dayPhones = Number(rRows?.[0]?.n || 0);
      if (dayPhones > 0) {
        const [rep]: any = await dbPool.execute(
          "SELECT COUNT(*) n FROM bf_orders d WHERE d.created_at >= ? AND d.created_at < ? AND NOT (d.phone = '01799553323' AND d.customer_name LIKE '%test%') AND d.phone IS NOT NULL AND d.phone <> \'\' AND EXISTS (SELECT 1 FROM bf_orders p WHERE p.phone = d.phone AND p.created_at < ? AND NOT (p.phone = '01799553323' AND p.customer_name LIKE '%test%'))",
          [start, end, start]);
        repeatOrders = Number(rep?.[0]?.n || 0);
        repeatRate = total > 0 ? +((repeatOrders * 100) / total).toFixed(1) : 0;
      }
    } catch { /* repeat optional */ }
    let peakHour = '—', peakHourCount = 0;
    try {
      const [hRows]: any = await dbPool.execute(
        "SELECT HOUR(created_at) h, COUNT(*) n FROM bf_orders WHERE created_at >= ? AND created_at < ? AND NOT (phone = '01799553323' AND customer_name LIKE '%test%') GROUP BY 1 ORDER BY n DESC LIMIT 1",
        [start, end]);
      if (hRows?.[0] != null) {
        peakHour = String(hRows[0].h).padStart(2, '0') + ':00 ঢাকা';
        peakHourCount = Number(hRows[0].n || 0);
      }
    } catch { /* hourly optional */ }
    try {
      const [ivRows]: any = await dbPool.execute(
        "SELECT COALESCE(SUM(total_payable),0) v FROM bf_orders WHERE status = 'in_transit'",
        []);
      var inTransitVal = Math.round(Number(ivRows?.[0]?.v || 0));
    } catch { var inTransitVal = 0; }
    try {
      const yymmdd = dateStr.slice(2).replace(/-/g, '');
      const [dtRows]: any = await dbPool.execute(
        "SELECT COUNT(DISTINCT t.order_id) n, COALESCE(SUM(o.total_payable),0) g FROM (" +
        "SELECT order_id FROM bf_order_logs WHERE DATE(created_at) = ? AND (log_type = 'courier_booked' OR message LIKE '%to in_transit%')" +
        " UNION SELECT id FROM bf_orders WHERE courier_tracking_code LIKE ?) t " +
        "JOIN bf_orders o ON o.id = t.order_id WHERE NOT (o.phone = '01799553323' AND o.customer_name LIKE '%test%')",
        [dateStr, 'SFR' + yymmdd + '%']);
      var dispToday = Number(dtRows?.[0]?.n || 0);
      var dispTodayGMV = Math.round(Number(dtRows?.[0]?.g || 0));
    } catch { var dispToday = 0; var dispTodayGMV = 0; }
    return { date: dateStr, total, revenue: Math.round(revenue), aov: total > 0 ? Math.round(revenue / total) : 0, byStatus, courier, dispatched, dispatchedBy, inTransitVal, dispToday, dispTodayGMV, topProducts, repeatRate, repeatOrders, peakHour, peakHourCount };
  } catch {
    return empty;
  }
}

/* ---------- meta ---------- */
export interface MetaStats {
  spendUsd: number; spendBdt: number; purchases: number; revenue: number;
  roas: number; cpa: number; cpaBdt: number;
  funnel: { stage: string; value: number }[];
  best: string | null; worst: string | null;
  bestAudience: string | null;
  error?: string;
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
/** Purchase count without double-count: first non-zero in dedupe priority. */
function sumPurchase(actions: any[]): number {
  const pri = ['omni_purchase', 'purchase', 'offsite_conversion.purchase', 'website_purchase', 'offsite_conversion.fb_pixel_purchase'];
  const byType: Record<string, number> = {};
  for (const a of actions || []) byType[String(a?.action_type || '')] = (byType[String(a?.action_type || '')] || 0) + Number(a?.value || 0);
  for (const t of pri) if ((byType[t] || 0) > 0) return byType[t];
  return 0;
}
async function g(url: string, params: Record<string, string>): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), GRAPH_TIMEOUT_MS);
  try {
    const r = await fetch(url + '?' + new URLSearchParams(params).toString(), { signal: ctl.signal as any });
    return await r.json().catch(() => null);
  } catch { return null; } finally { clearTimeout(t); }
}
export async function fetchMetaStats(dateStr: string, untilStr?: string): Promise<MetaStats> {
  const fail = (error: string): MetaStats => ({
    spendUsd: 0, spendBdt: 0, purchases: 0, revenue: 0, roas: 0, cpa: 0, cpaBdt: 0,
    funnel: [], best: null, worst: null, bestAudience: null, error,
  });
  try {
    const tk = await getSecret('meta_access_token', ['META_ACCESS_TOKEN']);
    if (!tk) return fail('token_missing');
    const multi = ((await getSecret('meta_ad_account_ids', ['META_AD_ACCOUNT_IDS'])) || '').split(',').map((s: string) => s.trim()).filter(Boolean);
    const single = (await getSecret('meta_ad_account_id', ['META_AD_ACCOUNT_ID'])) || '';
    const accts = [...new Set([...multi, ...(single ? [single] : [])].map((a: string) => (a.startsWith('act_') ? a : 'act_' + a.replace(/\D/g, ''))))];
    if (!accts.length) return fail('account_missing');
    const acct = accts[0];
    const time_range = JSON.stringify({ since: dateStr, until: untilStr || dateStr });
    const base = 'https://graph.facebook.com/' + API_VER + '/' + acct + '/insights';
    const main: any = await g(base, { access_token: tk, fields: 'spend,actions,website_purchase_roas', level: 'account', time_range });
    if (!main || main.error) return fail('graph_error');
    let spend = 0, purch = 0, rev = 0, vc = 0, atc = 0, ic = 0;
    for (const row of main.data || []) {
      const sp = Number(row.spend || 0);
      const roas = Number(row?.website_purchase_roas?.[0]?.value || 0);
      spend += sp; rev += sp * roas;
      purch += sumPurchase(row.actions);
      vc += sumActions(row.actions, 'view_content');
      atc += sumActions(row.actions, 'add_to_cart');
      ic += sumActions(row.actions, 'initiate_checkout');
    }
    let best: string | null = null, worst: string | null = null;
    try {
      const camp: any = await g(base, { access_token: tk, level: 'campaign', fields: 'campaign_name,spend,actions,website_purchase_roas', time_range, limit: '50' });
      const rows = (camp?.data || []).map((c: any) => ({
        name: c.campaign_name || '?', spend: Number(c.spend || 0),
        purch: sumPurchase(c.actions),
        roas: Number(c?.website_purchase_roas?.[0]?.value || 0),
      })).filter((c: any) => c.spend > 0);
      const withP = rows.filter((c: any) => c.purch > 0).sort((a: any, b: any) => b.roas - a.roas);
      if (withP.length) best = withP[0].name + ' (ROAS ' + withP[0].roas.toFixed(2) + ')';
      const ranked = [...rows].sort((a: any, b: any) => a.roas - b.roas);
      if (ranked.length > 1 || (ranked.length === 1 && !best)) {
        const w = ranked[0].purch > 0 && ranked[0].name === withP[0]?.name && ranked.length > 1 ? ranked[1] : ranked[0];
        worst = w.name + ' (ROAS ' + w.roas.toFixed(2) + ', ৳' + Math.round(w.spend * 130).toLocaleString('en-US') + ')';
        if (best && w.name === withP[0].name) worst = null;
      }
    } catch { /* campaigns optional */ }
    let bestAudience: string | null = null;
    try {
      const [ag, gd]: any = await Promise.all([
        g(base, { access_token: tk, fields: 'spend,actions', level: 'account', breakdowns: 'age', time_range, limit: '20' }),
        g(base, { access_token: tk, fields: 'spend,actions', level: 'account', breakdowns: 'gender', time_range, limit: '20' }),
      ]);
      const cand: any[] = [];
      for (const r of ag?.data || []) { const p = sumPurchase(r.actions); if (p > 0) cand.push({ label: 'বয়স ' + (r.age || '?'), cpa: Number(r.spend || 0) / p }); }
      for (const r of gd?.data || []) { const p = sumPurchase(r.actions); if (p > 0) cand.push({ label: (r.gender === 'male' ? 'পুরুষ' : r.gender === 'female' ? 'নারী' : r.gender || '?'), cpa: Number(r.spend || 0) / p }); }
      cand.sort((a, b) => a.cpa - b.cpa);
      if (cand.length) bestAudience = cand[0].label + ' (CPA $' + cand[0].cpa.toFixed(2) + ')';
    } catch { /* audience optional */ }
    const spendBdt = Math.round(spend * USD_BDT);
    return {
      spendUsd: +spend.toFixed(2), spendBdt, purchases: purch, revenue: Math.round(rev),
      roas: spend > 0 ? +(rev / spend).toFixed(2) : 0,
      cpa: purch > 0 ? +(spend / purch).toFixed(2) : 0,
      cpaBdt: purch > 0 ? Math.round(spendBdt / purch) : 0,
      funnel: [
        { stage: 'ViewContent', value: vc }, { stage: 'AddToCart', value: atc },
        { stage: 'Checkout', value: ic }, { stage: 'Purchase', value: purch },
      ],
      best, worst, bestAudience,
    };
  } catch { return fail('exception'); }
}

/* ---------- formatter ---------- */
function esc(t: any): string {
  return String(t ?? '—').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
const tk = (n: number) => '৳' + Number(n || 0).toLocaleString('en-US');
const BN_D = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];
const BN_M = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const BN_N = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const bnNum = (v: string | number) => String(v).replace(/[0-9]/g, (d) => BN_N[Number(d)]);
function bnDate(dateStr: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  if (!m) return dateStr;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return BN_D[dt.getUTCDay()] + ', ' + bnNum(Number(m[3])) + ' ' + BN_M[Number(m[2]) - 1] + ' ' + bnNum(m[1]);
}
export function formatKpiMessage(dateStr: string, o: OrderStats, m: MetaStats): string {
  const div = '━━━━━━━━━━━━';
  const L: string[] = ['📊 <b>CEO DAILY KPI</b>', '🗓️ ' + bnDate(dateStr), div, '🎯 <b>CORE KPI</b>'];
  const st = (k: string) => o.byStatus.find((x) => x.status === k);
  const pct = (c: number) => o.total > 0 ? ' | ' + Math.round((c * 100) / o.total) + '%' : '';
  L.push('🛍️ অর্ডার: <b>' + o.total + '</b>');
  L.push('🚚 আজ ডিসপ্যাচ: <b>' + o.dispToday + '</b>' + (o.total > 0 ? ' (' + Math.round((o.dispToday * 100) / o.total) + '%)' : ' (N/A)'));
  L.push('💰 ডিসপ্যাচ GMV: <b>' + tk(o.dispTodayGMV) + '</b>' + (o.dispToday > 0 ? ' | AOV ' + tk(Math.round(o.dispTodayGMV / o.dispToday)) : ''));
  const cpd = o.dispToday > 0 && !m.error && m.spendBdt > 0 ? tk(Math.round(m.spendBdt / o.dispToday)) : 'N/A';
  L.push('🎯 Ad Cost/Dispatch: <b>' + cpd + '</b>');
  L.push('', '💰 <b>BUSINESS</b>');
  L.push('রেভিনিউ: <b>' + tk(o.revenue) + '</b> | AOV ' + (o.total > 0 ? tk(o.aov) : 'N/A'));
  for (const k of ['delivered', 'in_transit', 'confirmed', 'pending', 'on_hold', 'cancelled']) {
    const r = st(k);
    if (r) L.push('• ' + esc(k) + ': ' + r.count + pct(r.count) + ' | ' + tk(r.revenue));
  }
  L.push('', '🚚 <b>COURIER SNAPSHOT</b>');
  {
    const name = (c: string) => c === 'manual' ? 'এসাইন বাকি' : c === 'unassigned' ? 'কুরিয়ার বসানো হয়নি' : c === 'steadfast' ? 'Steadfast' : c === 'pathao' ? 'Pathao' : c === 'redx' ? 'RedX' : c;
    L.push('এখন কুরিয়ারে: <b>' + o.dispatched + '</b> | ' + tk(o.inTransitVal) + (o.dispatchedBy.length ? ' (' + o.dispatchedBy.map((c) => name(c.code) + ' ' + c.count).join(' · ') + ')' : ''));
  }
  if (o.topProducts.length) {
    L.push('', '🏆 <b>TOP PRODUCTS</b>');
    const medals = ['🥇', '🥈', '🥉'];
    o.topProducts.forEach((pd, i) => {
      const nm = pd.name.length > 40 ? pd.name.slice(0, 40) + '…' : pd.name;
      const sh = o.revenue > 0 ? ' | ' + ((pd.amount * 100) / o.revenue).toFixed(1) + '%' : '';
      L.push((medals[i] || '•') + ' ' + esc(nm) + ' — ' + pd.qty + ' পিস | ' + tk(pd.amount) + sh);
    });
  }
  L.push('', '📢 <b>META ADS</b>');
  if (m.error) {
    L.push('Meta ডেটা পাওয়া যায়নি (' + esc(m.error) + ')');
  } else {
    L.push('খরচ: <b>' + tk(m.spendBdt) + '</b> ($' + m.spendUsd + ') | Sale ' + m.purchases + ' | CPA ' + (m.purchases > 0 ? tk(m.cpaBdt) : 'N/A') + ' | ROAS <b>' + m.roas.toFixed(2) + 'x</b>');
    if (m.best) L.push('🏆 বেস্ট: ' + esc(m.best));
    if (m.worst) L.push('⚠️ ওয়ার্স্ট: ' + esc(m.worst));
    if (m.bestAudience) L.push('👥 বেস্ট অডিয়েন্স: ' + esc(m.bestAudience));
    if (m.funnel.length) {
      const fv = (k: string) => m.funnel.find((f) => f.stage === k)?.value ?? 0;
      L.push('🪜 ফানেল: VC ' + fv('ViewContent') + ' → ATC ' + fv('AddToCart') + ' → Checkout ' + fv('Checkout') + ' → Sale ' + fv('Purchase'));
      if (fv('Checkout') > fv('AddToCart') && fv('Checkout') > 0) L.push('⚠️ Tracking anomaly: Checkout (' + fv('Checkout') + ') > AddToCart (' + fv('AddToCart') + ')');
    }
  }
  L.push('', '🔁 রিপিট: <b>' + o.repeatRate + '%</b> (' + o.repeatOrders + '/' + o.total + ') | ⏰ পিক: ' + esc(o.peakHour) + ' (' + o.peakHourCount + ')');
  L.push('', div);
  const sig = buildSignals(o, m);
  L.push('🧠 <b>CEO SIGNAL</b>');
  L.push('🟢 WIN: ' + esc(sig.win));
  L.push('🔴 RISK: ' + esc(sig.risk));
  L.push('🟡 WATCH: ' + esc(sig.watch));
  L.push('⚡ ACTION: ' + esc(sig.action));
  L.push(div);
  return L.join('\n');
}
function buildSignals(o: OrderStats, m: MetaStats): { win: string; risk: string; watch: string; action: string } {
  const st = (k: string) => o.byStatus.find((x) => x.status === k);
  const canc = st('cancelled');
  const cancRate = o.total > 0 && canc ? (canc.count * 100) / o.total : 0;
  const fv = (k: string) => (m.funnel.find((f) => f.stage === k)?.value ?? 0);
  const anomaly = !m.error && fv('Checkout') > fv('AddToCart') && fv('Checkout') > 0;
  let win = o.total === 0 ? 'আজ অর্ডার নেই।' : 'স্থিতিশীল দিন — বড় উইন নেই।';
  if (!m.error && m.purchases > 0 && m.best) win = m.best + ' — আজকের প্রধান driver।';
  else if (o.topProducts.length) win = o.topProducts[0].name.slice(0, 30) + ' — ' + o.topProducts[0].qty + ' পিস বিক্রি।';
  else if (o.repeatRate >= 25 && o.total > 0) win = 'রিপিট রেট ' + o.repeatRate + '% — loyal customer base।';
  let risk = 'বড় ঝুঁকি নেই ✅';
  if (o.total > 0 && o.dispToday === 0) risk = 'ডিসপ্যাচ শূন্য — ops টিম চেক করুন।';
  else if (cancRate >= 20) risk = 'ক্যানসেল ' + cancRate.toFixed(0) + '% (' + (canc?.count ?? 0) + '/' + o.total + ') — confirmation call বাড়ান।';
  else if (!m.error && m.spendBdt > 0 && m.roas > 0 && m.roas < 1.5) risk = 'Meta ROAS ' + m.roas.toFixed(2) + 'x — ad cost alarm।';
  else if (anomaly) risk = 'Tracking anomaly (Checkout > Cart) — Pixel/CAPI mapping চেক করুন।';
  let watch = 'নজরে রাখার মতো বিশেষ কিছু নেই।';
  if (!m.error && m.worst) watch = m.worst + ' — waste নজরে রাখুন।';
  else if (o.dispatched > 10) watch = 'কুরিয়ারে ' + o.dispatched + ' আটকে — delivery follow-up দিন।';
  else if (anomaly) watch = 'Funnel data-quality — event mapping audit বাকি।';
  let action = 'পিক আওয়ারে (' + o.peakHour + ') ফলো-আপ বজায় রাখুন।';
  if (o.total === 0) action = 'অর্ডার শূন্য — সাইট/পিক্সেল ও ক্যাম্পেইন স্ট্যাটাস চেক করুন।';
  else if (o.dispToday === 0) action = 'আজকের confirmed order courier-এ তুলুন — ডিসপ্যাচ শূন্য।';
  else if (cancRate >= 20) action = 'Cancellation audit করুন — ' + o.total + ' অর্ডারের ' + (canc?.count ?? 0) + 'টি cancelled (' + cancRate.toFixed(0) + '%)।';
  else if (anomaly) action = 'Pixel/CAPI event mapping audit করুন — Checkout > AddToCart অসম্ভব।';
  else if (!m.error && m.worst && /0\.00\)|\(ROAS 0/.test(m.worst)) action = m.worst.split(' (')[0] + ' pause review করুন — খরচে sale শূন্য।';
  else if (!m.error && m.roas >= 3) action = 'Winning campaign scale review করুন — ROAS ' + m.roas.toFixed(2) + 'x।';
  return { win, risk, watch, action };
}

/* ---------- weekly / monthly aggregation ---------- */
export interface RangeStats {
  since: string; until: string; days: number;
  orders: number; revenue: number; aov: number;
  dispatched: number; dispGMV: number; delivered: number; cancelled: number;
  cancelRate: number; topProducts: { name: string; qty: number; amount: number }[];
  repeatRate: number;
}
function addDays(dateStr: string, n: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr || '');
  const d = new Date(Number(m![1]), Number(m![2]) - 1, Number(m![3]));
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function eachDay(since: string, until: string): string[] {
  const out: string[] = []; let d = since, guard = 0;
  while (d <= until && guard++ < 400) { out.push(d); d = addDays(d, 1); }
  return out;
}
export async function fetchRangeStats(since: string, until: string): Promise<{ agg: RangeStats; meta: MetaStats }> {
  const days = eachDay(since, until);
  const per = await Promise.all(days.map((d) => fetchOrderStats(d)));
  const agg: RangeStats = {
    since, until, days: days.length, orders: 0, revenue: 0, aov: 0,
    dispatched: 0, dispGMV: 0, delivered: 0, cancelled: 0, cancelRate: 0,
    topProducts: [], repeatRate: 0,
  };
  const prod: Record<string, { qty: number; amount: number }> = {};
  let repO = 0;
  for (const o of per) {
    agg.orders += o.total; agg.revenue += o.revenue;
    agg.dispatched += o.dispToday; agg.dispGMV += o.dispTodayGMV;
    repO += o.repeatOrders;
    for (const b of o.byStatus) {
      if (b.status === 'delivered') agg.delivered += b.count;
      if (['cancelled', 'return', 'partial_return', 'returned', 'partial_returned'].includes(b.status)) agg.cancelled += b.count;
    }
    for (const p of o.topProducts) {
      prod[p.name] = prod[p.name] || { qty: 0, amount: 0 };
      prod[p.name].qty += p.qty; prod[p.name].amount += p.amount;
    }
  }
  agg.revenue = Math.round(agg.revenue);
  agg.aov = agg.orders > 0 ? Math.round(agg.revenue / agg.orders) : 0;
  agg.cancelRate = agg.orders > 0 ? +((agg.cancelled * 100) / agg.orders).toFixed(1) : 0;
  agg.repeatRate = agg.orders > 0 ? +((repO * 100) / agg.orders).toFixed(1) : 0;
  agg.topProducts = Object.entries(prod).map(([name, v]) => ({ name, qty: v.qty, amount: Math.round(v.amount) }))
    .sort((a, b) => b.qty - a.qty).slice(0, 10);
  const meta = await fetchMetaStats(since, until);
  return { agg, meta };
}
const pc = (cur: number, prev: number) => prev > 0 ? ((cur - prev) * 100 / prev).toFixed(1) + '%' : 'N/A';
export function formatWeeklyMessage(since: string, until: string, a: RangeStats, m: MetaStats, p: RangeStats | null): string {
  const div = '━━━━━━━━━━━━';
  const L: string[] = ['📊 <b>WEEKLY BUSINESS REVIEW</b>', '🗓️ ' + bnDate(since) + ' → ' + bnDate(until), div];
  L.push('🛍️ Orders: <b>' + a.orders + '</b>' + (p ? ' (' + pc(a.orders, p.orders) + ')' : ''));
  L.push('🚚 Dispatched: <b>' + a.dispatched + '</b>' + (p ? ' (' + pc(a.dispatched, p.dispatched) + ')' : ''));
  L.push('💰 Disp GMV: <b>' + tk(a.dispGMV) + '</b> | Revenue ' + tk(a.revenue) + (p ? ' (' + pc(a.revenue, p.revenue) + ')' : '') + ' | AOV ' + tk(a.aov));
  L.push('📦 Delivered: <b>' + a.delivered + '</b> | ❌ Cancelled: <b>' + a.cancelled + '</b> (' + a.cancelRate + '%)' + (p ? ' [' + (a.cancelRate - p.cancelRate >= 0 ? '+' : '') + (a.cancelRate - p.cancelRate).toFixed(1) + 'pp]' : ''));
  L.push('', '📢 <b>META</b>');
  if (m.error) L.push('Meta ডেটা পাওয়া যায়নি (' + esc(m.error) + ')');
  else {
    L.push('খরচ: <b>' + tk(m.spendBdt) + '</b> | Sale ' + m.purchases + ' | CPA ' + (m.purchases > 0 ? tk(m.cpaBdt) : 'N/A') + ' | ROAS <b>' + m.roas.toFixed(2) + 'x</b> | Cost/Disp ' + (a.dispatched > 0 && m.spendBdt > 0 ? tk(Math.round(m.spendBdt / a.dispatched)) : 'N/A'));
    if (m.best) L.push('🏆 বেস্ট: ' + esc(m.best));
    if (m.worst) L.push('⚠️ ওয়ার্স্ট: ' + esc(m.worst));
  }
  if (a.topProducts.length) {
    L.push('', '🏆 <b>TOP PRODUCTS</b>');
    const medals = ['🥇', '🥈', '🥉'];
    a.topProducts.slice(0, 5).forEach((pd, i) => L.push((medals[i] || '•') + ' ' + esc(pd.name.length > 38 ? pd.name.slice(0, 38) + '…' : pd.name) + ' — ' + pd.qty + ' পিস | ' + tk(pd.amount)));
  }
  L.push('', '🔁 রিপিট: <b>' + a.repeatRate + '%</b>', div);
  const win = a.revenue >= (p?.revenue ?? 0) && a.orders > 0 ? 'রেভিনিউ WoW ' + (p ? pc(a.revenue, p.revenue) : '—') + '।' : 'অর্ডার ' + a.orders + ' (' + a.days + ' দিন)।';
  const risk = a.cancelRate >= 20 ? 'ক্যানসেল ' + a.cancelRate + '% — confirmation call বাড়ান।' : (!m.error && m.roas > 0 && m.roas < 1.5 ? 'Meta ROAS ' + m.roas.toFixed(2) + 'x — ad alarm।' : 'বড় ঝুঁকি নেই ✅');
  L.push('🧠 <b>SIGNAL</b>', '🟢 WIN: ' + esc(win), '🔴 RISK: ' + esc(risk));
  L.push('⚡ TAKEAWAY: ' + esc(a.dispatched === 0 ? 'ডিসপ্যাচ শূন্য সপ্তাহ — ops bottleneck audit করুন।' : 'Cost/Dispatch ট্র্যাকে রাখুন — scale সিদ্ধান্ত এখান থেকে।'));
  L.push(div);
  return L.join('\n');
}
export function formatMonthlyMessage(since: string, until: string, a: RangeStats, m: MetaStats, p: RangeStats | null): string {
  return formatWeeklyMessage(since, until, a, m, p)
    .replace('📊 <b>WEEKLY BUSINESS REVIEW</b>', '📊 <b>MONTHLY BUSINESS REVIEW</b>')
    .replace('⚡ TAKEAWAY:', '⚡ CEO TAKEAWAY:');
}
export async function runRangeKpi(since: string, until: string, mode: string): Promise<{ html: string; sent: boolean; skipped: string | null }> {
  const { agg, meta } = await fetchRangeStats(since, until);
  const prevDays = agg.days;
  const pSince = addDays(since, -prevDays);
  const pUntil = addDays(since, -1);
  let prev: RangeStats | null = null;
  try { prev = (await fetchRangeStats(pSince, pUntil)).agg; } catch { /* prev optional */ }
  const isMonthly = mode.includes('monthly');
  const html = isMonthly ? formatMonthlyMessage(since, until, agg, meta, prev) : formatWeeklyMessage(since, until, agg, meta, prev);
  if (mode.startsWith('dry')) return { html, sent: false, skipped: null };
  const chatId = mode.includes('test') ? TEST_CHAT : MAIN_CHAT;
  if (!chatId) return { html, sent: false, skipped: 'no_chat_configured' };
  await ensureSentTable();
  const periodKey = since + '_' + until;
  if (await alreadySent(periodKey, mode)) return { html, sent: false, skipped: 'already_sent' };
  const ok = await tgSend(chatId, html);
  if (ok) await markSent(periodKey, mode, chatId);
  return { html, sent: ok, skipped: ok ? null : 'send_failed' };
}

/* ---------- telegram + idempotency ---------- */
async function tgSend(chatId: string | number, text: string): Promise<boolean> {
  if (!BOT_TOKEN || chatId === '') return false;
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += 3900) chunks.push(text.slice(i, i + 3900));
  try {
    for (const c of chunks) {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 15000);
      try {
        const res = await fetch('https://api.telegram.org/bot' + BOT_TOKEN + '/sendMessage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: c, parse_mode: 'HTML', disable_web_page_preview: true }),
          signal: ctl.signal as any,
        });
        if (!res.ok) return false;
      } finally { clearTimeout(timer); }
    }
    return true;
  } catch (e: any) { console.error('[dailyKpi] send failed:', e?.message || e); return false; }
}
export const SENT_DDL =
  'CREATE TABLE IF NOT EXISTS bf_kpi_sent (' +
  'report_date DATE NOT NULL, mode VARCHAR(16) NOT NULL DEFAULT \'send\', ' +
  'sent_at DATETIME DEFAULT CURRENT_TIMESTAMP, chat_id VARCHAR(64) NULL, ' +
  'PRIMARY KEY (report_date, mode))';
export async function ensureSentTable(): Promise<void> {
  try { await dbPool.execute(SENT_DDL); } catch { /* fail-open */ }
}
export async function alreadySent(dateStr: string, mode: string): Promise<boolean> {
  try {
    const [rows]: any = await dbPool.execute('SELECT 1 FROM bf_kpi_sent WHERE report_date = ? AND mode = ? LIMIT 1', [dateStr, mode]);
    return (rows || []).length > 0;
  } catch { return false; }
}
export async function markSent(dateStr: string, mode: string, chatId: string): Promise<void> {
  try { await dbPool.execute('INSERT IGNORE INTO bf_kpi_sent (report_date, mode, chat_id) VALUES (?,?,?)', [dateStr, mode, String(chatId)]); } catch { /* fail-open */ }
}

/* ---------- CLI ---------- */
export type KpiMode = 'dry' | 'send-test' | 'send' | 'dry-weekly' | 'send-weekly' | 'dry-monthly' | 'send-monthly';
export async function runDailyKpi(dateStr: string, mode: KpiMode): Promise<{ html: string; sent: boolean; skipped: string | null }> {
  const [orders, meta] = await Promise.all([fetchOrderStats(dateStr), fetchMetaStats(dateStr)]);
  const html = formatKpiMessage(dateStr, orders, meta);
  if (mode === 'dry') return { html, sent: false, skipped: null };
  const chatId = mode === 'send-test' ? TEST_CHAT : MAIN_CHAT;
  if (!chatId) return { html, sent: false, skipped: 'no_chat_configured' };
  await ensureSentTable();
  if (await alreadySent(dateStr, mode)) return { html, sent: false, skipped: 'already_sent' };
  const ok = await tgSend(chatId, html);
  if (ok) await markSent(dateStr, mode, chatId);
  return { html, sent: ok, skipped: ok ? null : 'send_failed' };
}
const isCLI = (process.argv[1] || '').replace(/\\/g, '/').endsWith('dailyKpi.ts');
if (isCLI) {
  const args = process.argv.slice(2);
  const pick = (k: string): string => {
    const a = args.find((x) => x.startsWith(k + '='));
    if (a) return a.slice(k.length + 1);
    return '';
  };
  const dateStr = process.env.REPORT_DATE || pick('date') || dhakaToday(-1);
  const mode = (process.env.MODE || pick('mode') || 'dry') as KpiMode;
  const since = process.env.SINCE || pick('since');
  const until = process.env.UNTIL || pick('until') || dateStr;
  const runner = mode.includes('weekly') || mode.includes('monthly')
    ? runRangeKpi(since || addDays(until, mode.includes('monthly') ? -29 : -6), until, mode)
    : runDailyKpi(dateStr, mode);
  runner.then((r) => {
    console.log(r.html);
    console.log('\n[KPI_META] ' + JSON.stringify({ date: dateStr, mode, sent: r.sent, skipped: r.skipped }));
    process.exit(0);
  }).catch((e) => { console.error('[dailyKpi] fatal:', e?.message || e); process.exit(1); });
}
