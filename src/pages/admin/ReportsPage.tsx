import { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { Download } from 'lucide-react';
import { StatCard, SectionHeader, StatusPill, NameWithAvatar } from '../../components/admin/ui';


const auth = () => ({ 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` });
const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); };

export default function ReportsPage() {
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [sales, setSales] = useState<any[]>([]);
  const [courier, setCourier] = useState<any[]>([]);
  const [returns, setReturns] = useState<any>(null);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  // T5-gap (ref summary.js team-KPI): per-actor confirm/pack/ship/delivered table via existing /api/admin/team/summary — no overlap with sales charts
  const [teamDays, setTeamDays] = useState(30);
  const [team, setTeam] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, c, r, cp] = await Promise.all([
        fetch(`/api/admin/reports/sales?from=${from}&to=${to}`, { headers: auth() }).then(x => x.json()).catch(() => ({})),
        fetch(`/api/admin/reports/courier?from=${from}&to=${to}`, { headers: auth() }).then(x => x.json()).catch(() => ({})),
        fetch(`/api/admin/reports/returns?from=${from}&to=${to}`, { headers: auth() }).then(x => x.json()).catch(() => ({})),
        fetch(`/api/admin/reports/coupons?from=${from}&to=${to}`, { headers: auth() }).then(x => x.json()).catch(() => ({})),
      ]);
      setSales(s.days || []);
      setCourier(c.rows || []);
      setReturns(r.ok === false ? null : r);
      setCoupons(cp.rows || []);
      fetch('/api/admin/team/summary?days=' + teamDays, { headers: auth() }).then(x => x.json()).then(t => { if (t.ok) setTeam(t); }).catch(() => {});
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => { fetch('/api/admin/team/summary?days=' + teamDays, { headers: auth() }).then(x => x.json()).then(t => { if (t.ok) setTeam(t); }).catch(() => {}); }, [teamDays]);

  const exportCSV = () => {
    window.open(`/api/admin/reports/export?from=${from}&to=${to}&token=${localStorage.getItem('bunon_token')}`, '_blank');
  };

  const th = 'px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b';
  const td = 'px-3 py-2 text-sm border-b border-gray-100';

  return (
    <div className="space-y-6 pb-10">
      <SectionHeader title="Reports" sub="Sales, courier, return and coupon analytics" right={<>
          <label className="shrink-0 whitespace-nowrap text-xs text-gray-500">From<br /><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></label>
          <label className="shrink-0 whitespace-nowrap text-xs text-gray-500">To<br /><input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></label>
          <button onClick={load} className="shrink-0 bg-brand-primary text-white px-4 py-2 rounded-xl text-sm font-bold">Load</button>
          <button onClick={exportCSV} className="shrink-0 flex items-center gap-1 border px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50"><Download size={16} /> Export CSV</button>
        </>} />

      {loading && <div className="text-center text-gray-400 animate-pulse">Loading...</div>}

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-brand-navy mb-4">Daily Sales</h3>
        <div className="h-72 min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sales} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <RechartsTooltip contentStyle={{ borderRadius: 12, border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
              <Line type="monotone" dataKey="revenue" name="Revenue (৳)" stroke="#e2136e" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="orders" name="Orders" stroke="#3B82F6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        {sales.length > 0 && (
          <div className="h-64 mt-6">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sales} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
                <RechartsTooltip contentStyle={{ borderRadius: 12, border: 'none' }} />
                <Bar dataKey="orders" name="Orders" fill="#3B82F6" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-brand-navy mb-4">Courier Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] [&_td]:align-middle [&_th]:align-middle">
            <thead><tr><th className={th}>Courier</th><th className={th}>Orders</th><th className={th}>Delivered</th><th className={th}>Rate</th><th className={th}>Revenue</th></tr></thead>
            <tbody>
              {courier.map((r: any, i: number) => (
                <tr key={i}><td className={td}>{r.courier}</td><td className={td}>{r.orders}</td><td className={td}>{r.delivered}</td><td className={td}>{r.rate ?? '-'}</td><td className={td}>৳ {Number(r.revenue || 0).toLocaleString()}</td></tr>
              ))}
              {courier.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-6 text-sm">No data found</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-brand-navy mb-4">Return Summary</h3>
          {!returns ? <div className="text-gray-400 text-sm">No data found</div> : (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Total Returns</span><b>{returns.total ?? 0}</b></div>
              <div className="flex justify-between"><span className="text-gray-500">Return Rate</span><b>{returns.rate ?? '-'}</b></div>
              {returns.byStatus && Object.entries(returns.byStatus).map(([k, v]: any) => (
                <div key={k} className="flex justify-between items-center border-t pt-2"><StatusPill status={k} /><b>{String(v)}</b></div>
              ))}
            </div>
          )}
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-brand-navy mb-4">Coupon Performance</h3>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr><th className={th}>Code</th><th className={th}>Uses</th><th className={th}>Discount</th></tr></thead>
              <tbody>
                {coupons.map((r: any, i: number) => (
                  <tr key={i}><td className={td}>{r.code}</td><td className={td}>{r.uses ?? r.count ?? '-'}</td><td className={td}>৳ {Number(r.discount || r.total_discount || 0).toLocaleString()}</td></tr>
                ))}
                {coupons.length === 0 && <tr><td colSpan={3} className="text-center text-gray-400 py-6 text-sm">No data found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-lg font-bold text-brand-navy">Team KPI (Status Actions / Member)</h3>
          <select value={teamDays} onChange={e => { setTeamDays(Number(e.target.value)); }} className="border rounded-lg px-2 py-1.5 text-sm">
            <option value={7}>7 days</option><option value={30}>30 days</option><option value={90}>90 days</option>
          </select>
        </div>
        {!team ? <div className="text-gray-400 text-sm">No data found</div> : (<>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
            <StatCard title="Confirmed" value={team.totals?.confirmed ?? 0} tone="orders" />
            <StatCard title="Packed" value={team.totals?.packed ?? 0} tone="transit" />
            <StatCard title="Shipped" value={team.totals?.shipped ?? 0} tone="pending" />
            <StatCard title="Delivered" value={team.totals?.delivered ?? 0} tone="delivered" />
            <StatCard title="Cancelled" value={team.totals?.cancelled ?? 0} tone="cancelled" />
          </div>
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full min-w-[560px]">
              <thead><tr><th className={th}>Member</th><th className={th}>Confirmed</th><th className={th}>Packed</th><th className={th}>Shipped</th><th className={th}>Delivered</th><th className={th}>Cancelled</th></tr></thead>
              <tbody>
                {(team.per_actor || []).map((r: any, i: number) => (
                  <tr key={i}><td className={td + ' font-medium'}><NameWithAvatar name={r.actor} /></td><td className={td}>{r.confirmed}</td><td className={td}>{r.packed}</td><td className={td}>{r.shipped}</td><td className={td}>{r.delivered}</td><td className={td}>{r.cancelled}</td></tr>
                ))}
                {(!team.per_actor || team.per_actor.length === 0) && <tr><td colSpan={6} className="text-center text-gray-400 py-6 text-sm">No data found</td></tr>}
              </tbody>
            </table>
          </div>
        </>)}
      </div>
    </div>
  );
}
