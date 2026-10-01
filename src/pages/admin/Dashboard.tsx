import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, ShoppingBag, Users, Activity, ShoppingCart, TrendingUp, Monitor, Globe, RefreshCw, Megaphone } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area
} from 'recharts';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function weekAgoStr() { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); }
function authH() { return { 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` }; }


// KPI section visibility — same source as RequirePerm (bunon_user.permissions, super_admin bypass).
// No perms array (legacy) => show all (route-level role gate still applies).
const KPI_PERM = { sales: 'view_kpi_sales', orders: 'view_kpi_orders', carts: 'view_kpi_carts', users: 'view_kpi_users', products: 'view_kpi_products', live: 'view_kpi_live', advanced: 'view_kpi_advanced' } as const;
function hasKpi(p: string): boolean {
  try {
    const u = JSON.parse(localStorage.getItem('bunon_user') || '{}');
    if (u.role === 'super_admin') return true;
    const perms: string[] = Array.isArray(u.permissions) ? u.permissions : [];
    if (perms.length > 0) return perms.includes(p);
    return true;
  } catch { return true; }
}
function Kpi({ p, children }: { p: string; children: any }) {
  return hasKpi(p) ? <>{children}</> : null;
}
const cardPerms = [KPI_PERM.sales, KPI_PERM.orders, KPI_PERM.sales, KPI_PERM.carts, KPI_PERM.carts, KPI_PERM.users];

// Visual system ported from the legacy orders dashboard: gradient metric cards
// (blue / emerald / indigo / rose) with glow shadows, status palette tints,
// chart-card styling, and accent-bar section headers. Class/style only.
const DASH_STYLE = `
:root {
  --tw-shadow-glow-blue: 0 8px 24px rgba(59, 130, 246, 0.35);
  --tw-shadow-glow-emerald: 0 8px 24px rgba(16, 185, 129, 0.35);
  --tw-shadow-glow-indigo: 0 8px 24px rgba(99, 102, 241, 0.35);
  --tw-shadow-glow-rose: 0 8px 24px rgba(244, 63, 94, 0.35);
  --tw-shadow-glow-orange: 0 8px 24px rgba(249, 115, 22, 0.35);
  --tw-shadow-glow-pink: 0 8px 24px rgba(236, 72, 153, 0.35);
}
.color-card-1 { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: #ffffff; box-shadow: var(--tw-shadow-glow-blue); border: none; }
.color-card-2 { background: linear-gradient(135deg, #10b981, #047857); color: #ffffff; box-shadow: var(--tw-shadow-glow-emerald); border: none; }
.color-card-3 { background: linear-gradient(135deg, #6366f1, #4338ca); color: #ffffff; box-shadow: var(--tw-shadow-glow-indigo); border: none; }
.color-card-4 { background: linear-gradient(135deg, #f43f5e, #be123c); color: #ffffff; box-shadow: var(--tw-shadow-glow-rose); border: none; }
.color-card-5 { background: linear-gradient(135deg, #fb923c, #ea580c); color: #ffffff; box-shadow: var(--tw-shadow-glow-orange); border: none; }
.color-card-6 { background: linear-gradient(135deg, #ec4899, #db2777); color: #ffffff; box-shadow: var(--tw-shadow-glow-pink); border: none; }
.metric-card { padding: 1.5rem; border-radius: 1.25rem; display: flex; flex-direction: column; justify-content: space-between; }
.metric-label { font-size: 0.875rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(255,255,255,0.8); }
.metric-value { font-size: 2.25rem; font-weight: 900; margin-top: 0.5rem; line-height: 1; color: #ffffff; }
.metric-sub { font-size: 0.75rem; margin-top: 0.5rem; font-weight: 500; color: rgba(255,255,255,0.7); }
.metric-icon { width: 3rem; height: 3rem; border-radius: 0.75rem; display: flex; align-items: center; justify-content: center; background: rgba(255, 255, 255, 0.2); color: #ffffff; }
.chart-card { border-radius: 1.25rem; border: 1px solid #e2e8f0; background: #ffffff; box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06); }
.dash-section-title { display: flex; align-items: center; gap: 0.5rem; font-size: 1.125rem; font-weight: 800; line-height: 1.25; color: #0f2a5c; }
.dash-section-title::before { content: ''; width: 0.3rem; height: 1.4rem; border-radius: 999px; background: linear-gradient(to bottom, #3b82f6, #6366f1); flex-shrink: 0; }
.status-card--pending { background-color: #fffbeb; border-color: #fde68a; color: #b45309; }
.status-card--pending .status-card-count { color: #d97706; }
.status-card--confirmed { background-color: #eff6ff; border-color: #bfdbfe; color: #1d4ed8; }
.status-card--confirmed .status-card-count { color: #2563eb; }
.status-card--on_hold { background-color: #fff7ed; border-color: #ffedd5; color: #c2410c; }
.status-card--on_hold .status-card-count { color: #ea580c; }
.status-card--ready_to_ship { background-color: #eef2ff; border-color: #c7d2fe; color: #4338ca; }
.status-card--ready_to_ship .status-card-count { color: #4f46e5; }
.status-card--in_transit { background-color: #f3e8ff; border-color: #ddd6fe; color: #6d28d9; }
.status-card--in_transit .status-card-count { color: #7c3aed; }
.status-card--delivered { background-color: #ecfdf5; border-color: #a7f3d0; color: #047857; }
.status-card--delivered .status-card-count { color: #10b981; }
.status-card--cancelled { background-color: #fff1f2; border-color: #fecdd3; color: #be123c; }
.status-card--cancelled .status-card-count { color: #e11d48; }
.status-tint-card { padding: 1rem; border-radius: 1rem; border: 1px solid transparent; transition: transform 0.2s; }
.status-tint-card:hover { transform: translateY(-3px); }
.bar-bg { width: 100%; height: 8px; border-radius: 999px; background-color: #e2e8f0; overflow: hidden; }
.bar-fill { height: 100%; border-radius: inherit; transition: width 0.5s ease; }
`;
function Empty({ t = 'No data' }: { t?: string }) {
  return <div className="text-gray-400 text-sm py-6 text-center">{t}</div>;
}
function Sec({ title, sub, children }: any) {
  return (
    <div className="chart-card min-w-0 overflow-hidden p-4 sm:p-6">
      <SectionHeader title={title} sub={sub} />
      {/* sub rendered by SectionHeader */}
      <div className="mt-4">{children}</div>
    </div>
  );
}
function BarRow({ label, value, max, color = 'linear-gradient(135deg, #3b82f6, #60a5fa)' }: any) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm min-w-0">
      <span className="w-24 sm:w-32 shrink-0 truncate text-gray-600">{label}</span>
      <div className="bar-bg flex-1 min-w-0">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <b className="w-14 sm:w-16 shrink-0 text-right tabular-nums text-brand-navy">{Number(value).toLocaleString()}</b>
    </div>
  );
}

import ProductImage, { bestProductImage } from '../../components/ProductImage';
import { StatCard, SectionHeader } from '../../components/admin/ui';
export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  // Single global filter: preset key. 'custom' => use from/to pickers.
  const [gFilter, setGFilter] = useState('today');
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [adv, setAdv] = useState<any>(null);
  const [live, setLive] = useState<any>(null);
  const [sfunnel, setSfunnel] = useState<any>(null);
  // days value sent to overview/sales/funnel APIs. -1 = custom range.
  const FILTER_DAYS: Record<string, number> = {
    today: 1, yesterday: 0, last7: 7, last15: 15, last30: 30,
    last90: 90, last180: 180, year: -2, last366: 366, lifetime: 3650, custom: -1,
  };
  const FILTER_LABEL: Record<string, string> = {
    today: "Today's", yesterday: "Yesterday's", last7: 'Last 7d', last15: 'Last 15d',
    last30: 'Last 30d', last90: 'Last 3 months', last180: 'Last 6 months',
    year: 'This Year', last366: 'Last 366d', lifetime: 'Lifetime', custom: 'Custom',
  };
  const isoDay = (x: Date) => x.toISOString().slice(0, 10);
  const rangeFor = (key: string): { from: string; to: string } => {
    const d = new Date();
    if (key === 'today') { const s = isoDay(d); return { from: s, to: s }; }
    if (key === 'yesterday') { const y = new Date(); y.setDate(y.getDate() - 1); const s = isoDay(y); return { from: s, to: s }; }
    if (key === 'year') { return { from: isoDay(d).slice(0, 8) + '01-01', to: isoDay(d) }; }
    if (key === 'custom') return { from, to };
    const n = FILTER_DAYS[key] ?? 1;
    const s = new Date(); s.setDate(s.getDate() - (n - 1));
    return { from: isoDay(s), to: isoDay(d) };
  };
  const loadSfunnel = (key?: string) => {
    const k = key ?? gFilter;
    const days = FILTER_DAYS[k] ?? 1;
    const q = days === -1 || days === -2
      ? `days=${days}&from=${rangeFor(k).from}&to=${rangeFor(k).to}`
      : `days=${days}`;
    fetch(`/api/admin/stats/funnel?${q}`, { headers: authH() })
      .then(r => r.json()).then(x => { if (x.ok) setSfunnel(x); }).catch(() => {});
  };
  const [gDays, setGDays] = useState(1);
  const [sales, setSales] = useState<any>(null);
  const loadSales = (key?: string) => {
    const k = key ?? gFilter;
    const days = FILTER_DAYS[k] ?? 1;
    const q = days === -1 || days === -2
      ? `days=${days}&from=${rangeFor(k).from}&to=${rangeFor(k).to}`
      : `days=${days}`;
    fetch(`/api/admin/stats/sales?${q}`, { headers: authH() })
      .then(r => r.json()).then(x => { if (x.ok) setSales(x); }).catch(() => {});
  };
  const setGlobalFilter = (key: string) => {
    setGFilter(key);
    const days = FILTER_DAYS[key] ?? 1;
    setGDays(days);
    loadSfunnel(key); loadSales(key); loadOverview(key); loadAdvKey(key);
  };
  useEffect(() => { loadSfunnel('today'); }, []);
  useEffect(() => { loadSales('today'); }, []);
  const [snaps, setSnaps] = useState<any>(null);
  useEffect(() => {
    fetch('/api/admin/stats/snapshots', { headers: authH() })
      .then(r => r.json()).then(x => { if (x.ok) setSnaps(x.snapshots); }).catch(() => {});
  }, []);
  const loadLive = () => {
    fetch('/api/admin/stats/live', { headers: authH() })
      .then(r => r.json()).then(d => { if (d.ok) setLive(d); }).catch(() => {});
  };
  useEffect(() => { loadLive(); const t = setInterval(loadLive, 15000); return () => clearInterval(t); }, []);
  const [advLoading, setAdvLoading] = useState(false);

  const loadOverview = (key?: string) => {
    const k = typeof key === 'string' ? key : gFilter;
    const days = FILTER_DAYS[k] ?? 1;
    const q = days === -1 || days === -2
      ? `days=${days}&from=${rangeFor(k).from}&to=${rangeFor(k).to}`
      : `days=${days}`;
    return fetch(`/api/admin/stats/overview?${q}`, { headers: authH() })
      .then(res => res.json())
      .then(data => { if (data.ok) setStats(data.stats); })
      .catch(() => {});
  };
  useEffect(() => { loadOverview('today').finally(() => setLoading(false)); }, []);

  const loadAdvKey = (key?: string) => {
    const k = key ?? gFilter;
    const r = rangeFor(k);
    setAdvLoading(true);
    const q = new URLSearchParams({ from: r.from, to: r.to }).toString();
    fetch(`/api/admin/kpi/advanced?${q}`, { headers: authH() })
      .then(res => res.json())
      .then(data => { if (data.ok) setAdv(data.data ?? data); else setAdv(null); })
      .catch(() => setAdv(null))
      .finally(() => setAdvLoading(false));
  };
  const loadAdv = () => loadAdvKey();
  useEffect(() => { loadAdvKey('today'); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps

  if (loading) return (
    <div className="flex flex-col items-center justify-center h-[70vh] gap-4">
      <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin"></div>
      <p className="text-gray-500 font-medium">Dashboard data Loading...</p>
    </div>
  );

  if (!stats) return <div className="text-center py-20 text-red-500 font-bold">Failed to load data!</div>;

  const periodLabel = FILTER_LABEL[gFilter] ?? "Today's";
  const statCards = [
    { title: `${periodLabel} Sales`, value: `৳ ${Number(stats.todayRevenue ?? 0).toLocaleString()}`, icon: <TrendingUp size={24} />, tone: "sales" },
    { title: `${periodLabel} Orders`, value: stats.todayOrders ?? 0, icon: <ShoppingBag size={24} />, tone: "orders" },
    { title: 'Total Sales', value: `৳ ${Number(stats.totalRevenue ?? 0).toLocaleString()}`, icon: <DollarSign size={24} />, tone: "revenue" },
    { title: 'Abandoned Carts', value: stats.totalAbandoned ?? 0, icon: <ShoppingCart size={24} />, tone: "alert" },
    { title: 'Recovered Orders', value: stats.recoveredCarts ?? 0, icon: <Activity size={24} />, tone: "ret" },
    { title: 'Total Users', value: stats.totalUsers ?? 0, icon: <Users size={24} />, tone: "users" },
  ];
  const pieColors = ['#3B82F6', '#10B981', '#6366F1', '#F43F5E', '#F59E0B', '#8B5CF6', '#EF4444'];

  // Backend-shape normalization (kpi_advanced verified): align frontend to backend keys.
  const funnelRaw = adv?.funnel;
  const funnel = funnelRaw && !Array.isArray(funnelRaw.stages) ? {
    stages: [
      { stage: 'pending', count: funnelRaw.pending ?? 0 },
      { stage: 'confirmed', count: funnelRaw.confirmed ?? 0 },
      { stage: 'ready', count: funnelRaw.ready ?? 0 },
      { stage: 'in_transit', count: funnelRaw.in_transit ?? 0 },
      { stage: 'delivered', count: funnelRaw.delivered ?? 0 },
    ],
    conversion_pct: funnelRaw.conversion_pct ?? 0,
    avg_delay_hours: funnelRaw.avg_delay_hours ?? 0,
  } : funnelRaw;
  const velocityRaw = adv?.velocity;
  const velocity = velocityRaw ? { hourly: velocityRaw.hourly ?? velocityRaw.points ?? [], peak_hour: velocityRaw.peak_hour ?? null } : velocityRaw;
  const repeatRaw = adv?.repeat;
  const repeat = repeatRaw ? {
    new: repeatRaw.new ?? repeatRaw.new_customers ?? 0,
    returning: repeatRaw.returning ?? repeatRaw.repeat_customers ?? 0,
    rate_pct: repeatRaw.rate_pct ?? repeatRaw.repeat_rate_pct ?? 0,
    aov: repeatRaw.aov ?? repeatRaw.repeat_aov ?? 0,
  } : repeatRaw;
  const cancel = adv?.cancellation; // backend {total, reasons:[{label,count}]}
  const courierRaw: any = adv?.courier;
  const courier = Array.isArray(courierRaw) ? courierRaw.map((c: any) => ({
    name: c.name ?? c.courier, orders: c.orders ?? c.count ?? c.delivered ?? 0,
    avg_days: c.avg_days ?? c.avg_delivery_days ?? 0, return_pct: c.return_pct ?? c.return_rate_pct ?? 0,
  })) : courierRaw;
  const codRaw = adv?.cod;
  const cod = codRaw ? {
    outstanding: codRaw.outstanding ?? codRaw.outstanding_total ?? 0,
    expected: codRaw.expected ?? codRaw.expected_today ?? 0,
    delayed: codRaw.delayed ?? codRaw.delayed_amount ?? 0,
    by_courier: Array.isArray(codRaw.by_courier)
      ? codRaw.by_courier
      : Object.entries(codRaw.by_courier ?? {}).map(([name, amount]) => ({ name, amount })),
  } : codRaw;
  const products = adv?.products ?? adv?.top_products;
  const refundsRaw = adv?.refunds;
  const refunds = refundsRaw ? {
    count: refundsRaw.count ?? refundsRaw.total ?? 0,
    amount: refundsRaw.amount ?? (Array.isArray(refundsRaw.reasons) ? refundsRaw.reasons.reduce((a: number, r: any) => a + Number(r.amount ?? 0), 0) : 0),
    rate_pct: refundsRaw.rate_pct ?? 0,
  } : refundsRaw;
  const refundsReasons = Array.isArray(refundsRaw?.reasons) ? refundsRaw.reasons.map((r: any) => ({ reason: r.reason ?? r.label, count: r.count })) : [];
  const clvRaw = adv?.clv;
  const clv = Array.isArray(clvRaw) ? clvRaw : (Array.isArray(clvRaw?.customers) ? clvRaw.customers.map((c: any) => ({
    customer: c.customer ?? c.name ?? c.phone, orders: c.orders ?? 0,
    spent: c.spent ?? c.ltv ?? c.total ?? 0, last_order: c.last_order ?? '-',
  })) : clvRaw);
  const slaRaw = adv?.sla;
  const sla = slaRaw ? {
    stages: Array.isArray(slaRaw.stages) && slaRaw.stages.length > 0 && typeof slaRaw.stages[0] === 'object' ? slaRaw.stages : [
      { stage: 'pending > 6h', avg_hours: 6, breached: Number(slaRaw.pending_over_6h ?? 0) > 0, count: slaRaw.pending_over_6h ?? 0 },
      { stage: 'unshipped > 24h', avg_hours: 24, breached: Number(slaRaw.unshipped_over_24h ?? 0) > 0, count: slaRaw.unshipped_over_24h ?? 0 },
    ],
    alerts_6h: slaRaw.alerts_6h ?? slaRaw.pending_over_6h ?? 0,
    alerts_24h: slaRaw.alerts_24h ?? slaRaw.unshipped_over_24h ?? 0,
  } : slaRaw;
  const districts = adv?.districts; // [{district, orders, revenue}]
  const profit = adv?.profit; // {revenue, discounts, delivery, returns_loss, net}
  const segEx = adv?.segments_ex; // {new_vs_returning: {new, returning}, high_value}
  const team = adv?.team; // [{actor, confirmed, packed, shipped, total}]
  const thumbOf = (v: any): string => typeof v === 'string' ? v : (v?.src ?? '');

  const cancelRows = (Array.isArray(cancel) ? cancel : (cancel?.reasons ?? [])).map((r: any) => ({ reason: r.reason ?? r.label ?? r.name, count: r.count ?? 0 }));
  const funnelStages = funnel?.stages ?? [];
  const funnelMax = Math.max(1, ...funnelStages.map((s: any) => Number(s.count ?? 0)));
  const hourlyData = velocity?.hourly ?? [];
  const cancelMax = Math.max(1, ...cancelRows.map((r: any) => Number(r.count ?? 0)));
  const districtMax = Math.max(1, ...(Array.isArray(districts) ? districts.map((d: any) => Number(d.orders ?? 0)) : [1]));

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
    <div className="min-w-0 max-w-full space-y-4 sm:space-y-6 pb-10 overflow-x-clip">
      <style>{DASH_STYLE}</style>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <SectionHeader title="KPI Dashboard" sub="See your business status at a glance" />

        </div>
        <div className="flex items-center gap-2 bg-white/70 border border-slate-200/60 rounded-2xl p-1.5 backdrop-blur-xl shadow-sm flex-wrap">
          <span className="text-[11px] font-bold text-slate-500 pl-2">📅</span>
          <select value={gFilter} onChange={e => setGlobalFilter(e.target.value)}
            className="bg-transparent text-xs font-black text-slate-800 outline-none cursor-pointer pr-1">
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last7">Last 7 days</option>
            <option value="last15">Last 15 days</option>
            <option value="last30">Last 30 days</option>
            <option value="last90">Last 3 months</option>
            <option value="last180">Last 6 months</option>
            <option value="year">This Year</option>
            <option value="last366">Last 366 days</option>
            <option value="lifetime">Lifetime</option>
            <option value="custom">Custom</option>
          </select>
          {gFilter === 'custom' && (
            <>
              <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none border border-slate-200 rounded-lg px-1.5 py-1" />
              <span className="text-[11px] font-bold text-slate-400">→</span>
              <input type="date" value={to} onChange={e => setTo(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 outline-none border border-slate-200 rounded-lg px-1.5 py-1" />
              <button onClick={() => setGlobalFilter('custom')}
                className="text-[11px] font-black bg-brand-primary text-white rounded-lg px-2.5 py-1">Apply</button>
            </>
          )}
        </div>
      </div>

      {/* KPI Cards (existing, kept) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6 items-stretch">
        {statCards.filter((_: any, idx: number) => hasKpi(cardPerms[idx] ?? KPI_PERM.sales)).map((card: any, idx: number) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1, duration: 0.5 }}
            key={idx}
          >
            <StatCard title={card.title} value={card.value} icon={card.icon} tone={card.tone} />
          </motion.div>
        ))}
      </div>

      <Kpi p={KPI_PERM.orders}>
      {/* Order Status cards (global filter, from funnel byStatus) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 items-stretch">
        {[
          { title: 'Confirmed', value: sfunnel ? (sfunnel.byStatus?.confirmed ?? sfunnel.confirmed ?? 0) : '…', icon: '✅', tone: 'orders' },
          { title: 'On Hold', value: sfunnel ? (sfunnel.byStatus?.on_hold ?? 0) : '…', icon: '⏸️', tone: 'alert' },
          { title: 'In Transit', value: sfunnel ? (sfunnel.byStatus?.in_transit ?? 0) : '…', icon: '🚚', tone: 'ret' },
          { title: 'Cancelled', value: sfunnel ? (sfunnel.cancelled ?? 0) : '…', icon: '❌', tone: 'sales' },
        ].map((card: any, idx: number) => (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1, duration: 0.5 }}
            key={'st-' + idx}
          >
            <StatCard title={card.title} value={card.value} icon={card.icon} tone={card.tone} />
          </motion.div>
        ))}
      </div>
      </Kpi>

      <Kpi p={KPI_PERM.sales}>
      {/* Sales KPI (data-driven, global filter) */}
      <div className="bg-white/70 border border-slate-200/60 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100/50"><DollarSign className="w-5 h-5" /></div>
          <div>
            <h3 className="font-black text-slate-800 tracking-tight">Sales — {FILTER_LABEL[gFilter] ?? 'Today'}</h3>
            <p className="text-[11px] text-slate-500 font-medium">রেভিনিউ • অর্ডার • AOV • ক্যানসেল (MySQL-direct)</p>
          </div>
        </div>
        {sales ? (<>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
            {[['💰 রেভিনিউ', '৳' + Number(sales.revenue || 0).toLocaleString()], ['🧾 অর্ডার', sales.orders], ['🧮 AOV', '৳' + sales.aov], ['❌ ক্যানসেল', sales.cancelPct + '%']].map(([t, v]: any, i: number) => (
              <div key={i} className="bg-slate-50/80 border border-slate-100 rounded-2xl px-3 py-2.5">
                <div className="text-[11px] text-slate-500 font-bold">{t}</div>
                <div className="text-lg font-black text-slate-800">{v}</div>
              </div>
            ))}
          </div>
          <div className="flex items-end gap-1 h-16">
            {(sales.byDay || []).map((b: any, i: number) => {
              const mx = Math.max(1, ...(sales.byDay || []).map((x: any) => Number(x.revenue || 0)));
              return <div key={i} className="flex-1 bg-emerald-500/80 rounded-t-md" style={{ height: Math.max(4, Math.round(Number(b.revenue || 0) * 100 / mx)) + '%' }} title={b.d + ': ৳' + Number(b.revenue || 0).toLocaleString()} />;
            })}
          </div>
        </>) : <p className="text-xs text-slate-400 animate-pulse">সেলস লোড হচ্ছে...</p>}
      </div>
      </Kpi>
      <Kpi p={KPI_PERM.live}>
      {/* Live Analytics (glass style, 100% real data) */}
      <div className="bg-white/70 border border-slate-200/60 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="relative">
            <Activity className="w-6 h-6 text-blue-600 animate-pulse relative z-10" />
            <div className="absolute inset-0 bg-blue-400 blur-lg opacity-40 animate-pulse"></div>
          </div>
          <div>
            <h3 className="font-black text-slate-800 tracking-tight">Live Analytics</h3>
            <p className="text-[11px] text-slate-500 font-medium">রিয়েল-টাইম (ফিল্টারের বাইরে) • {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={loadLive} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 transition text-slate-600" title="Refresh"><RefreshCw className="w-4 h-4" /></button>
            <div className="flex items-center gap-2 bg-blue-50 px-3 py-2 rounded-xl border border-blue-100">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500"></span>
              </span>
              <span className="text-blue-700 text-xs font-black tracking-wide">LIVE</span>
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-5 relative overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="absolute -right-14 -top-14 w-44 h-44 bg-gradient-to-br from-blue-100 to-transparent rounded-full opacity-60 group-hover:scale-110 transition-transform duration-700"></div>
            <div className="relative">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100/50"><Users className="w-5 h-5" /></div>
                <h4 className="text-sm font-bold text-slate-600">এখন সাইটে</h4>
              </div>
              <div key={live?.count ?? 'x'} className="text-6xl font-black text-slate-800 tracking-tighter tabular-nums animate-[pop_.4s_ease]">{live?.count ?? '—'}</div>
              <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wide mt-1">concurrent visitors</div>
              <div className="mt-3 space-y-1 max-h-28 overflow-y-auto">
                {(live?.visitors || []).slice(0, 6).map((v: any, i: number) => (
                  <div key={i} className="flex justify-between text-[11px] bg-slate-50 rounded-lg px-2 py-1">
                    <span className="font-mono truncate mr-2 text-slate-600">{v.path}</span>
                    <span className="text-slate-400 shrink-0">{v.secs_ago < 5 ? 'এখনই' : v.secs_ago + 's'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-5 relative overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="absolute -left-14 -bottom-14 w-44 h-44 bg-gradient-to-tr from-purple-100 to-transparent rounded-full opacity-60 group-hover:scale-110 transition-transform duration-700"></div>
            <div className="relative">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl border border-purple-100/50"><Monitor className="w-5 h-5" /></div>
                <h4 className="text-sm font-bold text-slate-600">Top Active Pages</h4>
              </div>
              <div className="space-y-3">
                {(live?.topPages || []).slice(0, 5).map((t: any) => {
                  const max = Math.max(1, ...((live?.topPages || []).map((x: any) => x.n)));
                  return (
                  <div key={t.path}>
                    <div className="flex justify-between text-xs mb-1"><span className="font-mono font-semibold text-slate-600 truncate pr-2">{t.path}</span><span className="font-mono text-slate-400">{t.n}</span></div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-500" style={{ width: Math.max(6, Math.round(t.n * 100 / max)) + '%' }} /></div>
                  </div>);
                })}
                {!(live?.topPages?.length) && <p className="text-[11px] text-slate-400">এখন কেউ নেই</p>}
              </div>
            </div>
          </div>
          <div className="bg-white/80 border border-slate-200/60 rounded-2xl p-5 relative overflow-hidden group hover:shadow-lg hover:-translate-y-0.5 transition-all">
            <div className="absolute right-0 top-1/3 w-44 h-44 bg-gradient-to-l from-emerald-100 to-transparent rounded-full opacity-60 group-hover:scale-110 transition-transform duration-700"></div>
            <div className="relative">
              <div className="flex items-center gap-2.5 mb-4">
                <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl border border-emerald-100/50"><Globe className="w-5 h-5" /></div>
                <h4 className="text-sm font-bold text-slate-600">Top Locations</h4>
              </div>
              <div className="space-y-1.5">
                {(live?.topCountries || []).map((c: any) => (
                  <div key={c.cc} className="flex items-center justify-between p-2 rounded-xl hover:bg-slate-50 transition border border-transparent hover:border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-[11px] font-black text-slate-500">{c.cc}</div>
                      <span className="text-xs font-semibold text-slate-600">{c.cc === 'BD' ? 'বাংলাদেশ' : c.cc}</span>
                    </div>
                    <span className="font-mono text-xs text-slate-500">{c.n}</span>
                  </div>
                ))}
                {!(live?.topCountries?.length) && <p className="text-[11px] text-slate-400">লোকেশন আসছে...</p>}
              </div>
            </div>
          </div>
        </div>
        {(live?.hourly?.length ?? 0) > 0 && (
          <div className="mt-4 bg-white/80 border border-slate-200/60 rounded-2xl p-5">
            <h4 className="text-sm font-bold text-slate-600 mb-3">Traffic — গত ২৪ ঘণ্টা</h4>
            <div className="h-[220px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={live.hourly} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lvVi" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="h" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} dy={8} interval={3} />
                  <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ backgroundColor: 'rgba(255,255,255,.95)', borderRadius: '1rem', borderColor: '#e2e8f0' }} />
                  <Area type="monotone" dataKey="n" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#lvVi)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
        <style>{`@keyframes pop { 0% { transform: scale(.7); opacity:.4 } 100% { transform: scale(1); opacity:1 } }`}</style>
      </div>
      </Kpi>
      <Kpi p={KPI_PERM.orders}>
      {/* Sales Funnel KPI (data-driven) */}
      <div className="bg-white/70 border border-slate-200/60 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl border border-amber-100/50"><ShoppingCart className="w-5 h-5" /></div>
          <div>
            <h3 className="font-black text-slate-800 tracking-tight">Sales Funnel</h3>
            <p className="text-[11px] text-slate-500 font-medium">ভিজিটর → অর্ডার → ডেলিভারি</p>
          </div>
          <div className="ml-auto text-[11px] font-bold text-slate-400 bg-slate-100 px-3 py-1.5 rounded-xl">
            {FILTER_LABEL[gFilter] ?? 'Today'} • global ↓
          </div>
        </div>
        {sfunnel ? (<>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            {[
              ['👁️ ভিজিটর', sfunnel.visitors.toLocaleString(), 'text-slate-800'],
              ['🧾 অর্ডার', sfunnel.orders, sfunnel.conv + '% কনভার্সন'],
              ['✅ কনফার্মড', sfunnel.confirmed, sfunnel.orders - sfunnel.confirmed + ' বাদ'],
              ['📦 ডেলিভার্ড', sfunnel.delivered, sfunnel.deliveryPct + '% রেট'],
            ].map(([l, v, sub]: any, i: number) => (
              <div key={i} className="bg-white border border-slate-200/60 rounded-2xl p-4">
                <div className="text-[11px] text-slate-500 font-semibold">{l}</div>
                <div className="text-2xl font-black text-slate-800 tabular-nums">{v}</div>
                <div className="text-[11px] text-slate-400">{sub}</div>
              </div>
            ))}
          </div>
          <div className="flex h-4 rounded-full overflow-hidden bg-slate-100 mb-2">
            {(() => {
              const t = Math.max(1, sfunnel.orders);
              const dW = Math.round(sfunnel.delivered * 100 / Math.max(1, sfunnel.visitors)) || 0;
              const cW = Math.round(sfunnel.confirmed * 100 / Math.max(1, sfunnel.visitors)) || 0;
              const oW = Math.max(2, Math.round(sfunnel.orders * 100 / Math.max(1, sfunnel.visitors)));
              return (<>
                <div className="bg-blue-500 transition-all" style={{ width: Math.min(100, oW) + '%' }} title={'অর্ডার ' + sfunnel.conv + '%'} />
                <div className="bg-emerald-500 transition-all" style={{ width: Math.min(100 - Math.min(100, oW), cW) + '%' }} title="কনফার্মড" />
              </>);
            })()}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 mb-3">
            <span><span className="inline-block w-2.5 h-2.5 bg-blue-500 rounded-full mr-1" />অর্ডার {sfunnel.conv}%</span>
            <span><span className="inline-block w-2.5 h-2.5 bg-emerald-500 rounded-full mr-1" />কনফার্মড</span>
            <span className="text-slate-400">ধূসর = ঝরে-পড়া ভিজিটর</span>
          </div>
          {sfunnel.cancelPct >= 20 && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-2.5 text-xs font-bold">
              ⚠️ ক্যানসেল {sfunnel.cancelPct}% — অনেক বেশি! অটো-WA কনফার্ম চালু করলে কমবে।
            </div>
          )}
          {(sfunnel.abandoned?.pending ?? 0) > 0 && (
            <div className="mt-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-2.5 text-xs font-bold">
              🛒 {sfunnel.abandoned.pending}টা অসম্পূর্ণ কার্ট পড়ে আছে — <a href="/admin/abandoned" className="underline">রিকভার করুন</a>
            </div>
          )}
        </>) : <p className="text-xs text-slate-400 animate-pulse">ফানেল লোড হচ্ছে...</p>}
      </div>
      </Kpi>
      <Kpi p={KPI_PERM.advanced}>
      {/* Traffic (GA4 snapshot) + Ads (Meta snapshot) */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-6 min-w-0 items-stretch">
        <div className="bg-white/70 border border-slate-200/60 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl border border-indigo-100/50"><Globe className="w-5 h-5" /></div>
            <div>
              <h3 className="font-black text-slate-800 tracking-tight">Traffic — GA4 (স্ন্যাপশট)</h3>
              <p className="text-[11px] text-slate-500 font-medium">দেশ • শহর • সোর্স {snaps?.ga4_traffic?.updated_at ? '• ' + String(snaps.ga4_traffic.updated_at).slice(0, 16).replace('T', ' ') : ''}</p>
            </div>
          </div>
          {snaps?.ga4_traffic ? (<>
            <div className="text-[11px] font-bold text-slate-500 mb-1">TOP শহর</div>
            {(snaps.ga4_traffic.data.byCountryCity || []).slice(0, 4).map((r: any, i: number) => (
              <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-100">
                <span className="font-bold text-slate-700">{r.city}, {r.country}</span>
                <span className="text-slate-500">{Number(r.users).toLocaleString()} user</span>
              </div>
            ))}
            <div className="text-[11px] font-bold text-slate-500 mt-3 mb-1">TOP সোর্স</div>
            {(snaps.ga4_traffic.data.bySource || []).slice(0, 4).map((r: any, i: number) => (
              <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-100">
                <span className="font-bold text-slate-700">{r.source}/{r.medium} → {r.country}</span>
                <span className="text-slate-500">{Number(r.sessions).toLocaleString()} ses</span>
              </div>
            ))}
          </>) : <p className="text-xs text-slate-400 animate-pulse">GA4 স্ন্যাপশট লোড হচ্ছে...</p>}
        </div>
        <div className="bg-white/70 border border-slate-200/60 rounded-3xl p-5 sm:p-6 backdrop-blur-xl shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 bg-blue-50 text-blue-600 rounded-xl border border-blue-100/50"><Megaphone className="w-5 h-5" /></div>
            <div>
              <h3 className="font-black text-slate-800 tracking-tight">Ads — Meta (স্ন্যাপশট)</h3>
              <p className="text-[11px] text-slate-500 font-medium">ক্যাম্পেইন • রিজিয়ন • জেন্ডার {snaps?.meta_ads?.updated_at ? '• ' + String(snaps.meta_ads.updated_at).slice(0, 16).replace('T', ' ') : ''}</p>
            </div>
          </div>
          {snaps?.meta_ads ? (<>
            {(snaps.meta_ads.data.byCountry || []).slice(0, 5).map((r: any, i: number) => (
              <div key={i} className="flex justify-between text-xs py-1 border-b border-slate-100">
                <span className="font-bold text-slate-700">{r.campaign} <span className="text-slate-400">({r.country})</span></span>
                <span className="text-slate-500">${r.spend}</span>
              </div>
            ))}
            <div className="mt-3 text-[11px] text-slate-500 font-medium">
              👥 {(snaps.meta_ads.data.byGender || []).map((g: any) => g.gender + ' ' + g.share).join(' • ')}
              {' '}• 🎯 {(snaps.meta_ads.data.byAge || []).map((a: any) => a.age).join(', ')}
            </div>
            <div className="mt-1 text-[11px] font-bold text-emerald-600">✅ Advantage OFF ×4 • recent-লিক বন্ধ</div>
          </>) : <p className="text-xs text-slate-400 animate-pulse">Meta স্ন্যাপশট লোড হচ্ছে...</p>}
        </div>
      </div>
      </Kpi>
      {/* Charts Section (existing, kept) */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 sm:gap-6 min-w-0 items-stretch">
        <Kpi p={KPI_PERM.sales}><motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 }}
          className="chart-card min-w-0 overflow-hidden p-4 sm:p-6 xl:col-span-2">
          <SectionHeader title={`${FILTER_LABEL[gFilter] ?? "Today"} Sales (Revenue)`} />
          <div className="h-60 sm:h-72 xl:h-80 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.salesChartData || []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashSalesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="100%" stopColor="#60a5fa" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12 }} />
                <RechartsTooltip cursor={{ fill: '#f9fafb' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                <Bar dataKey="sales" name="Revenue (৳)" fill="url(#dashSalesGrad)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
        </Kpi>
        <Kpi p={KPI_PERM.orders}><motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 }}
          className="chart-card min-w-0 overflow-hidden p-4 sm:p-6">
          <SectionHeader title="Orders Status" />
          <div className="h-60 sm:h-72 xl:h-80 w-full min-w-0 flex items-center justify-center">
            {stats.orderStatusData && stats.orderStatusData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.orderStatusData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={5} dataKey="value" stroke="none">
                    {stats.orderStatusData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={entry.color || pieColors[index % pieColors.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                  <Legend verticalAlign="bottom" height={36} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            ) : (<div className="text-gray-400 text-sm">No data</div>)}
          </div>
        </motion.div>
        </Kpi>
      </div>

      <Kpi p={KPI_PERM.products}>
      {(Array.isArray(stats.topProducts) ? stats.topProducts : stats.top_products ?? []).length > 0 && (
        <div className="chart-card min-w-0 overflow-hidden p-4 sm:p-6">
          <SectionHeader title="Top Products" />
          <div className="space-y-2">
            {(Array.isArray(stats.topProducts) ? stats.topProducts : stats.top_products ?? []).slice(0, 5).map((tp: any, i: number) => (
              <div key={i} className="flex justify-between items-center gap-3 text-sm border-b border-gray-50 pb-2 min-w-0">
                <span className="min-w-0 flex-1 truncate text-gray-700">{tp.name || tp.product_name}</span>
                <b>{tp.qty ?? tp.sold ?? tp.count ?? ''} x | ৳ {Number(tp.revenue ?? tp.total ?? 0).toLocaleString()}</b>
              </div>
            ))}
          </div>
        </div>
      )}
      </Kpi>
      <Kpi p={KPI_PERM.orders}>
      {((Array.isArray(stats.courierToday) ? stats.courierToday.length > 0 : stats.courierToday != null) || stats.pendingReturns != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 items-stretch">
          {stats.courierToday != null && (
            <div className="status-tint-card status-card--ready_to_ship min-w-0 overflow-hidden">
              <p className="text-sm font-semibold">Today's Courier</p>
              {Array.isArray(stats.courierToday) ? (
                <div className="mt-1 space-y-1 text-sm">
                  {stats.courierToday.map((c: any, i: number) => (
                    <div key={i} className="flex justify-between gap-3 border-b border-white/20 pb-1 last:border-0">
                      <span className="truncate">{c.courier ?? c.name}</span><b className="tabular-nums">{c.orders ?? 0}</b>
                    </div>
                  ))}
                </div>
              ) : (
                <h3 className="status-card-count text-2xl font-black">{String(stats.courierToday)}</h3>
              )}
            </div>
          )}
          {stats.pendingReturns != null && (
            <div className="status-tint-card status-card--pending min-w-0 overflow-hidden">
              <p className="text-sm font-semibold">Pending Return</p>
              <h3 className="status-card-count text-2xl font-black">{String(stats.pendingReturns)}</h3>
            </div>
          )}
        </div>
      )}
      </Kpi>

      <Kpi p={KPI_PERM.advanced}>
      {/* ===== Advanced KPI (driven by the single global filter above) ===== */}
      <div className="chart-card min-w-0 overflow-hidden p-4 sm:p-6">
        <SectionHeader title={`Advanced KPI — ${FILTER_LABEL[gFilter] ?? 'Today'}`} />
      </div>

      {advLoading && <div className="text-center text-gray-500 text-sm">Advanced KPI Loading...</div>}

      {/* Funnel */}
      {funnelStages.length > 0 && (
        <Sec title="Order Funnel" sub={`Conversion: ${funnel?.conversion_pct ?? 0}% • Avg Delay: ${funnel?.avg_delay_hours ?? 0} hrs`}>
          <div className="space-y-3">
            {funnelStages.map((s: any, i: number) => (
              <BarRow key={i} label={s.stage ?? s.name} value={s.count} max={funnelMax} />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4 text-sm">
            <span>Conversion Rate: <b>{funnel?.conversion_pct ?? 0}%</b></span>
            <span>Avg Delay: <b>{funnel?.avg_delay_hours ?? 0} hrs</b></span>
          </div>
        </Sec>
      )}

      {/* Velocity */}
      {hourlyData.length > 0 && (
        <Sec title="Order Velocity" sub={velocity?.peak_hour != null ? `Peak Hour: ${velocity.peak_hour}` : undefined}>
          <div className="h-48 sm:h-56 xl:h-64 w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashVelocityGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#a5b4fc" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="hour" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                <RechartsTooltip contentStyle={{ borderRadius: '12px', border: 'none' }} />
                <Bar dataKey="count" name="Orders" fill="url(#dashVelocityGrad)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Sec>
      )}

      {/* Repeat */}
      {repeat && (repeat.new != null || repeat.returning != null) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 sm:gap-6 items-stretch">
          {[
            { t: 'New Customer', v: repeat.new ?? 0, s: 'status-card--confirmed' },
            { t: 'Returning Customers', v: repeat.returning ?? 0, s: 'status-card--delivered' },
            { t: 'Repeat Rate', v: `${repeat.rate_pct ?? 0}%`, s: 'status-card--in_transit' },
            { t: 'Avg Order Value (AOV)', v: `৳ ${Number(repeat.aov ?? 0).toLocaleString()}`, s: 'status-card--pending' },
          ].map((c, i) => (
            <div key={i} className={`status-tint-card ${c.s} min-w-0 overflow-hidden min-h-[104px] flex flex-col justify-center`}>
              <p className="text-xs sm:text-sm font-semibold">{c.t}</p>
              <h3 className="status-card-count text-xl sm:text-2xl font-black mt-1 break-words tabular-nums">{c.v}</h3>
            </div>
          ))}
        </div>
      )}

      {/* Cancellation */}
      {cancelRows.length > 0 && (
        <Sec title="Cancellation Reasons">
          <div className="space-y-3">
            {cancelRows.map((r: any, i: number) => (
              <BarRow key={i} label={r.reason ?? r.name} value={r.count} max={cancelMax} color="linear-gradient(135deg, #f43f5e, #fb7185)" />
            ))}
          </div>
        </Sec>
      )}

      {/* Courier */}
      {Array.isArray(courier) && courier.length > 0 && (
        <Sec title="Courier Performance">
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[560px] text-sm tabular-nums [&_td]:align-middle [&_th]:align-middle">
              <thead className="sticky top-0 z-10 bg-white"><tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4">Courier</th><th className="py-2 pr-4">Orders</th>
                <th className="py-2 pr-4">Avg Days</th><th className="py-2">Return %</th>
              </tr></thead>
              <tbody>
                {courier.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 pr-4">{c.name ?? c.courier}</td>
                    <td className="py-2 pr-4">{c.orders ?? c.count ?? 0}</td>
                    <td className="py-2 pr-4">{c.avg_days ?? 0}</td>
                    <td className="py-2">{c.return_pct ?? 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>
      )}

      {/* COD */}
      {cod && (cod.outstanding != null || cod.expected != null) && (
        <Sec title="COD Summary">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 text-sm mb-4 items-stretch">
            <div className="status-tint-card status-card--pending min-h-[92px] flex flex-col justify-center"><p className="font-semibold">Outstanding</p><b className="status-card-count text-lg tabular-nums break-words">৳ {Number(cod.outstanding ?? 0).toLocaleString()}</b></div>
            <div className="status-tint-card status-card--confirmed min-h-[92px] flex flex-col justify-center"><p className="font-semibold">Expected</p><b className="status-card-count text-lg tabular-nums break-words">৳ {Number(cod.expected ?? 0).toLocaleString()}</b></div>
            <div className="status-tint-card status-card--cancelled min-h-[92px] flex flex-col justify-center"><p className="font-semibold">Delayed</p><b className="status-card-count text-lg tabular-nums break-words">৳ {Number(cod.delayed ?? 0).toLocaleString()}</b></div>
          </div>
          {Array.isArray(cod.by_courier) && cod.by_courier.length > 0 ? (
            <div className="space-y-2">
              {cod.by_courier.map((c: any, i: number) => (
                <div key={i} className="flex justify-between gap-3 text-sm border-b border-gray-50 pb-2">
                  <span className="min-w-0 flex-1 truncate text-gray-700">{c.name ?? c.courier}</span><b>৳ {Number(c.amount ?? 0).toLocaleString()}</b>
                </div>
              ))}
            </div>
          ) : <Empty />}
        </Sec>
      )}

      {/* Top products (advanced) */}
      {Array.isArray(products) && products.length > 0 && (
        <Sec title="Top Products (Detailed)">
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[560px] text-sm tabular-nums">
              <thead><tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4 w-14">Image</th><th className="py-2 pr-4">Product</th><th className="py-2 pr-4">Orders</th>
                <th className="py-2 pr-4">Sales</th><th className="py-2 pr-4">Cancelled</th><th className="py-2">Return %</th>
              </tr></thead>
              <tbody>
                {products.map((p: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 pr-4"><ProductImage src={bestProductImage(p)} className="w-11 h-11 rounded-lg object-cover" alt="" loading="lazy" /></td>
                    <td className="py-2 pr-4">{p.name ?? p.product_name}</td>
                    <td className="py-2 pr-4">{p.orders ?? p.qty ?? p.count ?? 0}</td>
                    <td className="py-2 pr-4">৳ {Number(p.sales ?? p.revenue ?? 0).toLocaleString()}</td>
                    <td className="py-2 pr-4">{p.cancel ?? p.cancelled ?? (p.cancelled_pct != null ? `${p.cancelled_pct}%` : 0)}</td>
                    <td className="py-2">{p.return_pct ?? 0}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>
      )}

      {/* Refunds */}
      {refunds && (refunds.count != null || refunds.amount != null) && (
        <Sec title="Refund Summary">
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm tabular-nums">
            <span>Count: <b>{refunds.count ?? 0}</b></span>
            <span>Amount: <b>৳ {Number(refunds.amount ?? 0).toLocaleString()}</b></span>
            <span>Rate: <b>{refunds.rate_pct ?? 0}%</b></span>
          </div>
          {refundsReasons.length > 0 && (
            <div className="space-y-2 mt-3">
              {refundsReasons.map((r: any, i: number) => (
                <div key={i} className="flex justify-between gap-3 text-sm border-b border-gray-50 pb-2">
                  <span className="min-w-0 flex-1 truncate text-gray-700">{r.reason}</span><b>{r.count}</b>
                </div>
              ))}
            </div>
          )}
        </Sec>
      )}

      {/* CLV */}
      {Array.isArray(clv) && clv.length > 0 && (
        <Sec title="Customer Lifetime Value (CLV)">
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[560px] text-sm tabular-nums">
              <thead><tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4">Customer</th><th className="py-2 pr-4">Orders</th>
                <th className="py-2 pr-4">Total Spent</th><th className="py-2">Last Order</th>
              </tr></thead>
              <tbody>
                {clv.map((c: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 pr-4">{c.customer ?? c.name ?? c.phone}</td>
                    <td className="py-2 pr-4">{c.orders ?? 0}</td>
                    <td className="py-2 pr-4">৳ {Number(c.spent ?? c.total ?? 0).toLocaleString()}</td>
                    <td className="py-2">{c.last_order ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>
      )}

      {/* SLA */}
      {sla && (Array.isArray(sla.stages) ? sla.stages.length > 0 : false) && (
        <Sec title="SLA Monitoring">
          <div className="space-y-2 text-sm mb-4">
            {sla.stages.map((s: any, i: number) => (
              <div key={i} className={`flex justify-between border-b border-gray-50 pb-2 ${s.breached ? 'text-red-600 font-bold' : 'text-gray-700'}`}>
                <span>{s.stage}{s.count != null ? ` (${s.count})` : ''}</span><span>Avg {s.avg_hours ?? 0} hrs {s.breached ? '⚠️' : ''}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            <span className="text-orange-600 font-bold">Stuck 6h+: {sla.alerts_6h ?? 0}</span>
            <span className="text-red-600 font-bold">Stuck 24h+: {sla.alerts_24h ?? 0}</span>
          </div>
        </Sec>
      )}

      {/* Profit */}
      {profit && (
        <Sec title="Profit Summary" sub="Revenue − Discount − Delivery − Return Loss">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 text-sm items-stretch">
            {[
              { t: 'Total Revenue', v: profit.revenue ?? 0, s: 'status-card--delivered' },
              { t: 'Discount', v: profit.discounts ?? 0, s: 'status-card--pending' },
              { t: 'Delivery Cost', v: profit.delivery ?? 0, s: 'status-card--in_transit' },
              { t: 'Return Loss', v: profit.returns_loss ?? 0, s: 'status-card--cancelled' },
              { t: 'Net Profit', v: profit.net ?? 0, s: 'status-card--confirmed' },
            ].map((c, i) => (
              <div key={i} className={`status-tint-card ${c.s} min-h-[92px] flex flex-col justify-center`}>
                <p className="font-semibold">{c.t}</p>
                <b className="status-card-count text-lg tabular-nums break-words">৳ {Number(c.v).toLocaleString()}</b>
              </div>
            ))}
          </div>
        </Sec>
      )}

      {/* Segments */}
      {segEx && (
        <Sec title="Customer Segments" sub="New vs Returning + High-Value (৳2000+)">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm items-stretch">
            <div className="status-tint-card status-card--confirmed"><p className="font-semibold">New Customer</p><b className="status-card-count text-lg tabular-nums">{segEx.new_vs_returning?.new?.orders ?? 0} customers</b><p className="text-xs opacity-70">৳ {Number(segEx.new_vs_returning?.new?.revenue ?? 0).toLocaleString()}</p></div>
            <div className="status-tint-card status-card--delivered"><p className="font-semibold">Returning Customers</p><b className="status-card-count text-lg tabular-nums">{segEx.new_vs_returning?.returning?.orders ?? 0} customers</b><p className="text-xs opacity-70">৳ {Number(segEx.new_vs_returning?.returning?.revenue ?? 0).toLocaleString()}</p></div>
            <div className="status-tint-card status-card--pending"><p className="font-semibold">High-Value Orders</p><b className="status-card-count text-lg tabular-nums">{segEx.high_value?.orders ?? 0} orders</b><p className="text-xs opacity-70">৳ {Number(segEx.high_value?.revenue ?? 0).toLocaleString()}</p></div>
          </div>
        </Sec>
      )}

      {/* Team */}
      {Array.isArray(team) && team.length > 0 && (
        <Sec title="Team Performance" sub="From order logs: Confirm / Pack / Ship">
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full min-w-[560px] text-sm tabular-nums">
              <thead><tr className="text-left text-gray-500 border-b">
                <th className="py-2 pr-4">Member</th><th className="py-2 pr-4">Confirmed</th><th className="py-2 pr-4">Packed</th><th className="py-2 pr-4">Shipped</th><th className="py-2">Total Actions</th>
              </tr></thead>
              <tbody>
                {team.map((m: any, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 pr-4 font-medium">{m.actor}</td>
                    <td className="py-2 pr-4">{m.confirmed ?? 0}</td>
                    <td className="py-2 pr-4">{m.packed ?? 0}</td>
                    <td className="py-2 pr-4">{m.shipped ?? 0}</td>
                    <td className="py-2">{m.total ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Sec>
      )}

      {/* Districts */}
      {Array.isArray(districts) && districts.length > 0 && (
        <Sec title="Top 10 Districts">
          <div className="space-y-3">
            {districts.slice(0, 10).map((d: any, i: number) => (
              <div key={i}>
                <BarRow label={d.district ?? d.name} value={d.orders ?? 0} max={districtMax} color="linear-gradient(135deg, #10b981, #34d399)" />
                {d.revenue != null && <p className="text-xs text-gray-400 ml-[7rem] sm:ml-[8.5rem]">৳ {Number(d.revenue).toLocaleString()}</p>}
              </div>
            ))}
          </div>
        </Sec>
      )}
      </Kpi>
    </div>
    </div>
  );
}
