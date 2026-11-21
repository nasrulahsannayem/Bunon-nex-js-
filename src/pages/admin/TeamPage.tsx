import { useEffect, useState } from 'react';
import { UsersRound } from 'lucide-react';
import { PageHeader, Button, Card, MetricCard, DataTable, Tabs, FilterBar } from '../../components/admin/ux';

const auth = () => ({ 'Authorization': 'Bearer ' + String(localStorage.getItem('bunon_token') || '') });

/**
 * Staff performance, derived from bf_order_logs status transitions.
 * Backed by /api/admin/team/summary and /api/admin/team/active.
 */
export default function TeamPage() {
  const [tab, setTab] = useState('performance');
  const [days, setDays] = useState('30');
  const [summary, setSummary] = useState<any>(null);
  const [active, setActive] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = () => {
    setLoading(true); setErr('');
    const h = auth();
    Promise.all([
      fetch(`/api/admin/team/summary?days=${encodeURIComponent(days)}`, { headers: h }).then(r => r.json()),
      fetch('/api/admin/team/active', { headers: h }).then(r => r.json()),
    ])
      .then(([s, a]) => {
        if (s.ok) setSummary(s); else setErr(s.msg || 'Could not load summary');
        if (a.ok) setActive(a.users || a.active || []);
      })
      .catch(() => setErr('Network error'))
      .finally(() => setLoading(false));
  };
  useEffect(load, [days]);

  const t = summary?.totals || {};
  const rows = summary?.per_actor || [];

  return (
    <div>
      <PageHeader
        title="Team"
        subtitle="Staff performance from order status changes"
        icon={<UsersRound size={20} />}
        actions={<Button onClick={load}>Refresh</Button>}
      />

      <Tabs
        tabs={[{ key: 'performance', label: 'Performance', count: rows.length }, { key: 'active', label: 'Active users', count: active.length }]}
        active={tab}
        onChange={setTab}
      />

      {err && <p className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-3">{err}</p>}

      {tab === 'performance' && (
        <>
          <FilterBar>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Period</label>
            <select
              value={days}
              onChange={e => setDays(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-brand-primary"
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </select>
          </FilterBar>

          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
            <MetricCard label="Confirmed" value={t.confirmed ?? 0} />
            <MetricCard label="Packed" value={t.packed ?? 0} />
            <MetricCard label="Shipped" value={t.shipped ?? 0} />
            <MetricCard label="Delivered" value={t.delivered ?? 0} tone="good" />
            <MetricCard label="Cancelled" value={t.cancelled ?? 0} tone={t.cancelled > 0 ? 'warn' : 'default'} />
          </div>

          <DataTable
            rows={rows}
            loading={loading}
            rowKey={(r: any, i: number) => `${r.actor ?? 'x'}-${i}`}
            empty="No status activity in this period"
            columns={[
              { key: 'actor', header: 'Staff', render: (r: any) => <span className="font-semibold text-slate-800">{r.actor || '—'}</span> },
              { key: 'confirmed', header: 'Confirmed', render: (r: any) => <span className="font-semibold">{r.confirmed ?? 0}</span> },
              { key: 'packed', header: 'Packed', render: (r: any) => r.packed ?? 0 },
              { key: 'shipped', header: 'Shipped', render: (r: any) => r.shipped ?? 0 },
              { key: 'delivered', header: 'Delivered', render: (r: any) => <span className="font-semibold text-emerald-600">{r.delivered ?? 0}</span> },
              { key: 'cancelled', header: 'Cancelled', render: (r: any) => <span className={r.cancelled > 0 ? 'text-amber-600 font-semibold' : ''}>{r.cancelled ?? 0}</span> },
              { key: 'total', header: 'Total changes', render: (r: any) => <span className="text-slate-500">{r.total_logs ?? 0}</span> },
            ]}
            mobile={(r: any) => (
              <div className="space-y-2">
                <p className="font-bold text-slate-800">{r.actor || '—'}</p>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div><p className="text-[10px] uppercase text-slate-400">Confirmed</p><p className="font-bold text-sm">{r.confirmed ?? 0}</p></div>
                  <div><p className="text-[10px] uppercase text-slate-400">Shipped</p><p className="font-bold text-sm">{r.shipped ?? 0}</p></div>
                  <div><p className="text-[10px] uppercase text-slate-400">Delivered</p><p className="font-bold text-sm text-emerald-600">{r.delivered ?? 0}</p></div>
                </div>
                {r.cancelled > 0 && <p className="text-xs text-amber-600">{r.cancelled} cancelled</p>}
              </div>
            )}
          />
        </>
      )}

      {tab === 'active' && (
        <Card className="p-4">
          <DataTable
            rows={active}
            loading={loading}
            rowKey={(u: any, i: number) => `${u.id ?? u.phone ?? 'u'}-${i}`}
            empty="No active users"
            columns={[
              { key: 'name', header: 'Name', render: (u: any) => <span className="font-semibold text-slate-800">{u.name || u.customer_name || '—'}</span> },
              { key: 'phone', header: 'Phone', render: (u: any) => <span className="font-mono text-xs">{u.phone || '—'}</span> },
              { key: 'role', header: 'Role', render: (u: any) => <span className="text-xs">{u.role || '—'}</span> },
              {
                key: 'login', header: 'Last login',
                render: (u: any) => <span className="text-xs text-slate-500 whitespace-nowrap">
                  {u.last_login ? new Date(u.last_login).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }) : '—'}
                </span>
              },
            ]}
            mobile={(u: any) => (
              <div>
                <p className="font-bold text-slate-800">{u.name || u.customer_name || '—'}</p>
                <p className="font-mono text-xs text-slate-500">{u.phone || '—'}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {u.last_login ? `Last login ${new Date(u.last_login).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' })}` : 'Never logged in'}
                </p>
              </div>
            )}
          />
        </Card>
      )}
    </div>
  );
}