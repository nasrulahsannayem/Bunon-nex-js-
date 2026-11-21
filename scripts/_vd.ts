/**
 * Simulate exactly what the Dashboard does on mount, through adminFetch,
 * and prove `stats` ends up populated. This is the check that would have
 * caught "Failed to load data!" — the API was always 200, the client chain
 * was throwing.
 */
const BASE = 'https://bunonfabrics.com';
const dotenv = (await import('dotenv')).default;
dotenv.config({ override: true, quiet: true as any });
const { default: jwt } = await import('jsonwebtoken');
const { productDbPool } = await import('../server/db');

const [u]: any = await productDbPool.query(
  "SELECT id, phone, role, permissions FROM bunon_users WHERE role='super_admin' LIMIT 1");
let p: any = u[0].permissions;
if (typeof p === 'string') { try { p = JSON.parse(p); } catch { p = []; } }
const token = jwt.sign({ id: u[0].id, phone: u[0].phone, role: u[0].role, permissions: p },
  String(process.env.JWT_SECRET), { expiresIn: '30d' });

// a faithful copy of adminFetch's behaviour
async function adminFetch(input: string, init: RequestInit = {}) {
  const t = token;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(BASE + input, { ...init, headers });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { ok: false, msg: text }; }
}

let fail = 0;
const ck = (l: string, ok: boolean, x = '') => {
  if (!ok) fail++;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + l + (x ? '  — ' + x : ''));
};

// ── the Dashboard mount path ──────────────────────────────────────────
let stats: any = null;
const loadOverview = adminFetch('/api/admin/stats/overview?days=1')
  .then((data: any) => { if (data?.ok) stats = data.stats; })
  .catch((e: any) => console.log('  (threw: ' + e.message + ')'));

await loadOverview;
ck('Dashboard loadOverview populates stats', !!stats,
  stats ? 'keys=' + Object.keys(stats).slice(0, 6).join(',') : 'stats is still null');
ck('stats has the fields the cards render',
  !!stats && 'todayRevenue' in stats && 'todayOrders' in stats,
  `todayRevenue=${stats?.todayRevenue} todayOrders=${stats?.todayOrders}`);

// ── the live poller (the other place I changed) ────────────────────────
let live: any = null;
const loadLive = async () => {
  const d = await adminFetch('/api/admin/stats/live');
  if (d && d.ok) live = d;
  return d;
};
const r1 = await loadLive();
ck('loadLive returns the parsed body', !!r1 && r1.ok === true);
ck('loadLive sets live state', !!live, 'visitors=' + live?.visitors);

// a second tick must not throw (this runs every 15s)
const r2 = await loadLive();
ck('second loadLive tick also succeeds', !!r2 && r2.ok === true);

let adv: any = null;
await adminFetch('/api/admin/kpi/advanced?from=2026-10-01&to=2026-10-03')
  .then((d: any) => { adv = d?.ok ? (d.data ?? d) : null; });
ck('kpi/advanced populates', !!adv, adv ? 'keys=' + Object.keys(adv).slice(0, 5).join(',') : 'null');

// ── the inbox itself must still be fine ───────────────────────────────
const list: any = await adminFetch('/api/admin/omnichannel?limit=5');
ck('inbox list still returns conversations',
  !!list?.success && (list?.data?.conversations || []).length > 0,
  (list?.data?.conversations || []).length + ' rows');

console.log(fail === 0 ? '\nALL PASS' : '\n' + fail + ' FAILURE(S)');
process.exit(fail === 0 ? 0 : 1);