import { useEffect, useState } from 'react';
import { StatCard, SectionHeader, StatusPill } from '../../components/admin/ui';

type Summary = { spend: number; purchases: number; impressions: number; clicks: number; reach: number; revenue: number; view_content: number; add_to_cart: number; initiate_checkout: number; roas: number; cpa: number; cpc: number; cpm: number; frequency: number };
type Camp = { name: string; spend: number; purchases: number; cpa: number; roas: number; impressions: number; clicks: number; ctr: number };
type DayRow = { date: string; spend: number; purchases: number; revenue: number; roas: number; cpa: number };
const money = (v: number) => '$' + (Number(v) || 0).toFixed(2);
const num = (v: number) => (Number(v) || 0).toLocaleString();
const RANGES = ['today', 'yesterday', 'last7', 'last30', 'this_month', 'this_week', 'this_year', 'lifetime'];
async function jget(url: string) { const r = await fetch(url, { headers: { Authorization: 'Bearer ' + (localStorage.getItem('bunon_token') || '') } }); return r.json(); }
function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="w-32 shrink-0 truncate text-slate-600">{label}</div>
      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: pct + '%', background: color }} /></div>
      <div className="w-20 text-right font-bold tabular-nums">{num(value)}</div>
    </div>
  );
}
export default function MetaKpi() {
  const [range, setRange] = useState('today');
  const [loading, setLoading] = useState(false);
  const [sum, setSum] = useState<Summary | null>(null);
  const [camps, setCamps] = useState<Camp[]>([]);
  const [funnel, setFunnel] = useState<{ stage: string; value: number }[]>([]);
  const [aud, setAud] = useState<{ age: any[]; gender: any[] }>({ age: [], gender: [] });
  const [best, setBest] = useState<any>(null);
  const [days, setDays] = useState<DayRow[]>([]);
  const [winners, setWinners] = useState<any>(null);
  const [live, setLive] = useState<any[]>([]);
  const [topAds, setTopAds] = useState<any[]>([]);
  const [trueR, setTrueR] = useState<any>(null);
  const [yday, setYday] = useState<Summary | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [accts, setAccts] = useState<any[]>([]);
  const [acct, setAcct] = useState('');
  const [err, setErr] = useState('');
  const [updated, setUpdated] = useState('');
  const load = async (rg?: string, ac?: string) => {
    setLoading(true); setErr('');
    try {
      const d = await jget('/api/admin/meta/kpi?range=' + encodeURIComponent(rg ?? range) + ((ac ?? acct) ? '&account_id=' + encodeURIComponent(ac ?? acct) : ''));
      if (!d.ok) { setErr(d.error || 'Failed to load'); }
      else {
        setSum(d.summary); setCamps(d.campaigns || []); setFunnel(d.funnel || []);
        setAud(d.audience || { age: [], gender: [] }); setBest(d.best || null);
        setDays(d.breakdown || []); setWinners(d.winners || null); setUpdated(new Date().toLocaleString('en-GB'));
        setTopAds(d.topAds || []);
        jget('/api/admin/meta/ads').then((a) => { if (a?.ok) setLive(a.rows || []); }).catch(() => {});
        jget('/api/admin/meta/true-roas?range=' + encodeURIComponent(rg ?? range)).then((t) => { if (t?.ok) setTrueR(t); }).catch(() => {});
        jget('/api/admin/meta/kpi?range=yesterday' + ((ac ?? acct) ? '&account_id=' + encodeURIComponent(ac ?? acct) : '')).then((y) => { if (y?.ok) setYday(y.summary); }).catch(() => {});
      }
    } catch (e: any) { setErr(String(e?.message || e)); }
    setLoading(false);
  };
  useEffect(() => {
    jget('/api/admin/meta/status').then(setStatus).catch(() => {});
    jget('/api/admin/meta/accounts').then((d) => { if (d?.ok) { setAccts(d.accounts || []); setAcct(d.active_id || ''); load('today', d.active_id || ''); } }).catch(() => {});
  }, []);
  useEffect(() => { if (acct !== '') load(); }, [range]);
  const funnelMax = Math.max(1, ...funnel.map((f) => f.value));
  const colors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981'];
  return (
    <div className="space-y-6 pb-10">
      <SectionHeader title="Meta KPI" sub={updated ? 'Live · updated ' + updated : 'Read-only live Meta performance'} right={<div className="flex gap-2 flex-wrap items-center">
        <select value={range} onChange={(e) => setRange(e.target.value)} className="shrink-0 border rounded px-2 py-1 text-sm">
          {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        {accts.length > 0 && (
          <select value={acct} onChange={async (e) => { setAcct(e.target.value); try { await fetch('/api/admin/meta/account', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (localStorage.getItem('bunon_token') || '') }, body: JSON.stringify({ account_id: e.target.value }) }); } catch {} load(range, e.target.value); }} className="shrink-0 border rounded px-2 py-1 text-sm">
            {accts.map((a: any) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
          </select>
        )}
        <button onClick={() => load()} disabled={loading} className="shrink-0 px-3 py-1.5 rounded bg-black text-white text-sm disabled:opacity-50">{loading ? 'Loading…' : 'Reload'}</button>
        {status && <StatusPill status={status.connected ? 'Connected' : 'Cancelled'} />}
      </div>} />
      {err && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded p-2">{err}</div>}
      {sum && yday && range === 'today' && (() => {
        const dSp = sum.spend - yday.spend, dPu = sum.purchases - yday.purchases;
        const dR = sum.roas - yday.roas;
        const chip = (label: string, v: string, good: boolean) => (
          <span className="text-xs px-2 py-1 rounded-full border" style={{ background: good ? '#ecfdf5' : '#fef2f2', borderColor: good ? '#a7f3d0' : '#fecaca' }}>{label}: <b>{v}</b></span>
        );
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-3 flex flex-wrap items-center gap-2" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
            <span className="font-extrabold text-sm">Today vs Yesterday</span>
            {chip('Spend', (dSp >= 0 ? '+' : '') + money(dSp), dSp <= 0)}
            {chip('Purchases', (dPu >= 0 ? '+' : '') + dPu, dPu >= 0)}
            {chip('ROAS', (dR >= 0 ? '+' : '') + dR.toFixed(2) + 'x', dR >= 0)}
            <span className="text-[11px] text-gray-400">Yesterday: {money(yday.spend)} · {yday.purchases} purch · {yday.roas.toFixed(2)}x</span>
          </div>
        );
      })()}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {sum && (<>
          <StatCard title="Spend" value={money(sum.spend)} tone="alert" />
          <StatCard title="Purchases" value={num(sum.purchases)} tone="sales" />
          <StatCard title="CPA" value={money(sum.cpa)} tone="pending" />
          <StatCard title="ROAS" value={sum.roas.toFixed(2) + 'x'} tone="revenue" />
          <StatCard title="Revenue" value={money(sum.revenue)} tone="delivered" />
          <StatCard title="Frequency" value={sum.frequency.toFixed(2)} tone="transit" />
          <StatCard title="Impressions" value={num(sum.impressions)} tone="orders" />
          <StatCard title="Clicks" value={num(sum.clicks)} tone="users" />
          <StatCard title="CPC" value={money(sum.cpc)} tone="pending" />
          <StatCard title="CPM" value={money(sum.cpm)} tone="orders" />
          <StatCard title="Reach" value={num(sum.reach)} tone="transit" />
          <StatCard title="CTR" value={(sum.impressions > 0 ? (sum.clicks / sum.impressions) * 100 : 0).toFixed(2) + '%'} tone="sales" />
        </>)}
      </div>
      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-1" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
          <div className="font-extrabold text-sm">Frequency & Fatigue</div>
          {sum ? (<>
            <div className="flex items-baseline gap-2"><span className="text-2xl font-extrabold tabular-nums">{sum.frequency.toFixed(2)}</span><span className="text-xs text-gray-500">avg frequency</span></div>
            <div className="text-xs font-bold">{sum.frequency > 3 ? '⚠️ FATIGUED — refresh creative' : sum.frequency > 2 ? '👀 WATCH — add 1 new creative' : '✅ FRESH — no fatigue'}</div>
          </>) : <div className="text-sm text-gray-400">—</div>}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-1" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
          <div className="font-extrabold text-sm">Performance Benchmark</div>
          {sum ? (<>
            <div className="text-xs text-gray-500">Account CPA vs best campaign</div>
            <div className="flex items-baseline gap-2"><span className="text-2xl font-extrabold tabular-nums">{money(sum.cpa)}</span><span className="text-xs text-gray-500">account avg</span></div>
            <div className="text-xs">Best: <span className="font-bold">{best ? best.name.slice(0, 28) : '—'}</span> {best ? `(${money(best.spend / Math.max(1, best.purchases))})` : ''}</div>
          </>) : <div className="text-sm text-gray-400">—</div>}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-1" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
          <div className="font-extrabold text-sm">Funnel Health</div>
          {sum ? (<>
            <div className="text-xs text-gray-500">Click → Purchase</div>
            <div className="flex items-baseline gap-2"><span className="text-2xl font-extrabold tabular-nums">{(sum.clicks > 0 ? (sum.purchases / sum.clicks) * 100 : 0).toFixed(2)}%</span></div>
            <div className="text-xs">ATC: <span className="font-bold">{num(sum.add_to_cart)}</span> · IC: <span className="font-bold">{num(sum.initiate_checkout)}</span> {sum.add_to_cart > 0 && sum.initiate_checkout > sum.add_to_cart * 1.5 ? '⚠️ ATC under-fires' : '✅ normal'}</div>
          </>) : <div className="text-sm text-gray-400">—</div>}
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
        <div className="px-3 py-2 font-extrabold text-sm border-b">Creative Performance ({topAds.length})</div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 text-xs"><th className="px-3 py-2">Ad</th><th className="px-3 py-2">Campaign</th><th className="px-3 py-2 text-right">Spend</th><th className="px-3 py-2 text-right">Purch</th><th className="px-3 py-2 text-right">CPA</th><th className="px-3 py-2 text-right">CTR</th></tr></thead>
          <tbody>{topAds.map((a: any, i: number) => (
            <tr key={i} className="border-t"><td className="px-3 py-1.5 max-w-[200px] truncate" title={a.name}>{a.name}</td><td className="px-3 py-1.5 max-w-[160px] truncate text-gray-500" title={a.campaign}>{a.campaign}</td><td className="px-3 py-1.5 text-right">{money(a.spend)}</td><td className="px-3 py-1.5 text-right font-bold">{a.purchases}</td><td className="px-3 py-1.5 text-right">{money(a.cpa)}</td><td className="px-3 py-1.5 text-right">{Number(a.ctr || 0).toFixed(2)}%</td></tr>
          ))}
          {topAds.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">No ad data</td></tr>}</tbody>
        </table></div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
        <div className="font-extrabold text-sm">True ROAS <span className="text-xs font-normal text-gray-500">(Meta spend vs real delivered orders)</span></div>
        {trueR ? (<>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="border rounded-xl p-2"><div className="text-gray-500 text-xs">Meta Purch</div><div className="font-extrabold text-lg tabular-nums">{trueR.meta.purchases}</div><div className="text-[11px] text-gray-500">${Number(trueR.meta.spend).toFixed(2)} spend</div></div>
            <div className="border rounded-xl p-2"><div className="text-gray-500 text-xs">Delivered</div><div className="font-extrabold text-lg tabular-nums">{trueR.backend.delivered}</div><div className="text-[11px] text-gray-500">৳{num(trueR.backend.deliveredRev)}</div></div>
            <div className="border rounded-xl p-2"><div className="text-gray-500 text-xs">True ROAS</div><div className="font-extrabold text-lg tabular-nums">{Number(trueR.true.trueRoas).toFixed(2)}x</div><div className="text-[11px] text-gray-500">True CPA ৳{num(Math.round(trueR.true.trueCpa))}</div></div>
          </div>
          <div className="text-xs text-gray-600">Gap (Meta − delivered): <span className="font-bold">{trueR.true.gapPurch}</span> · Cancel rate: <span className="font-bold">{Number(trueR.true.cancelRate).toFixed(1)}%</span> · Collected: <span className="font-bold">৳{num(trueR.backend.collected)}</span> <span className="text-gray-400">(rate $1=৳{trueR.rate})</span></div>
        </>) : <div className="text-sm text-gray-400">Loading order match…</div>}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
          <div className="font-extrabold text-sm">Data Driven Winners <span className="text-xs font-normal text-gray-500">(auto detected, lowest CPA)</span></div>
          {winners ? (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {[['Top Age', winners.age?.age], ['Best Gender', winners.gender?.gender], ['Top Platform', winners.platform?.platform], ['Top Region', winners.city?.region]].map(([label, v]: any, i: number) => (
                <div key={i} className="border rounded-xl p-2"><div className="text-gray-500 text-xs">{label}</div><div className="font-extrabold truncate" title={String(v || '—')}>{String(v || '—')}</div></div>
              ))}
            </div>
          ) : <div className="text-sm text-gray-400">Calculating…</div>}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
          <div className="font-extrabold text-sm">Live Campaign Performance <span className="text-xs font-normal text-gray-500">(today)</span></div>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 text-xs"><th className="py-1">Campaign</th><th className="py-1 text-right">Spend</th><th className="py-1 text-right">Purch</th><th className="py-1 text-right">CPA</th></tr></thead>
            <tbody>{live.map((c: any, i: number) => (
              <tr key={i} className="border-t"><td className="py-1 max-w-[180px] truncate" title={c.campaign}>{c.campaign}</td><td className="py-1 text-right">{money(c.spend)}</td><td className="py-1 text-right font-bold">{c.purchases}</td><td className="py-1 text-right">{money(c.cpa)}</td></tr>
            ))}
            {live.length === 0 && <tr><td colSpan={4} className="py-3 text-center text-gray-400">No active campaigns</td></tr>}</tbody>
          </table></div>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
          <div className="font-extrabold text-sm">Conversion Funnel</div>
          {funnel.map((f, i) => <Bar key={f.stage} label={f.stage} value={f.value} max={funnelMax} color={colors[i % colors.length]} />)}
          {funnel.length === 0 && <div className="text-sm text-gray-400">No funnel data</div>}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-3 space-y-2" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
          <div className="font-extrabold text-sm">Best Campaign</div>
          {best ? (<>
            <div className="text-sm font-bold truncate" title={best.name}>{best.name}</div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div><div className="text-gray-500 text-xs">Spend</div><div className="font-bold">{money(best.spend)}</div></div>
              <div><div className="text-gray-500 text-xs">Purch</div><div className="font-bold">{best.purchases}</div></div>
              <div><div className="text-gray-500 text-xs">ROAS</div><div className="font-bold">{Number(best.roas || 0).toFixed(2)}x</div></div>
            </div>
          </>) : <div className="text-sm text-gray-400">No purchase yet in range</div>}
          <div className="font-extrabold text-sm pt-2">Audience</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div><div className="text-gray-500 mb-1">Age (spend / purch)</div>{(aud.age || []).map((a: any, i: number) => <div key={i} className="flex justify-between py-0.5 border-t"><span>{a.age}</span><span className="font-bold">{money(a.spend)} / {a.purchases}</span></div>)}{(aud.age || []).length === 0 && <div className="text-gray-400">—</div>}</div>
            <div><div className="text-gray-500 mb-1">Gender (spend / purch)</div>{(aud.gender || []).map((a: any, i: number) => <div key={i} className="flex justify-between py-0.5 border-t"><span>{a.gender}</span><span className="font-bold">{money(a.spend)} / {a.purchases}</span></div>)}{(aud.gender || []).length === 0 && <div className="text-gray-400">—</div>}</div>
            <div><div className="text-gray-500 mb-1">Placement (spend / purch)</div>{((aud as any).placement || []).slice(0, 6).map((a: any, i: number) => <div key={i} className="flex justify-between py-0.5 border-t"><span className="truncate max-w-[110px]" title={a.platform}>{a.platform}</span><span className="font-bold shrink-0">{money(a.spend)} / {a.purchases}</span></div>)}{(((aud as any).placement || []).length === 0) && <div className="text-gray-400">—</div>}</div>
            <div><div className="text-gray-500 mb-1">Device (spend / purch)</div>{((aud as any).device || []).map((a: any, i: number) => <div key={i} className="flex justify-between py-0.5 border-t"><span>{a.impression_device}</span><span className="font-bold">{money(a.spend)} / {a.purchases}</span></div>)}{(((aud as any).device || []).length === 0) && <div className="text-gray-400">—</div>}</div>
          </div>
        </div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
        <div className="px-3 py-2 font-extrabold text-sm border-b flex items-center gap-2"><span style={{ width: '.3rem', height: '1.2rem', borderRadius: 999, background: 'linear-gradient(to bottom,#3b82f6,#6366f1)', display: 'inline-block' }} />Campaigns ({camps.length})</div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 text-xs"><th className="px-3 py-2">Name</th><th className="px-3 py-2 text-right">Spend</th><th className="px-3 py-2 text-right">Purch</th><th className="px-3 py-2 text-right">CPA</th><th className="px-3 py-2 text-right">ROAS</th><th className="px-3 py-2 text-right">CTR</th></tr></thead>
          <tbody>{camps.map((c, i) => (
            <tr key={i} className="border-t"><td className="px-3 py-1.5 max-w-[220px] truncate" title={c.name}>{c.name}</td><td className="px-3 py-1.5 text-right">{money(c.spend)}</td><td className="px-3 py-1.5 text-right font-bold">{c.purchases}</td><td className="px-3 py-1.5 text-right">{money(c.cpa)}</td><td className="px-3 py-1.5 text-right">{c.roas.toFixed(2)}x</td><td className="px-3 py-1.5 text-right">{c.ctr.toFixed(2)}%</td></tr>
          ))}
          {camps.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">No campaigns</td></tr>}</tbody>
        </table></div>
      </div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 3px rgba(15,23,42,.06)' }}>
        <div className="px-3 py-2 font-extrabold text-sm border-b">Daily Spend & Purchases ({days.length})</div>
        {days.length > 1 && (() => {
          const maxSp = Math.max(1, ...days.map((d) => d.spend));
          const maxPu = Math.max(1, ...days.map((d) => d.purchases));
          return (
            <div className="px-3 pt-3 flex items-end gap-1 overflow-x-auto" style={{ height: '9rem' }}>
              {days.map((d, i) => (
                <div key={i} className="flex-1 min-w-[14px] flex flex-col items-center justify-end gap-1 h-full" title={d.date + ' · $' + d.spend.toFixed(2) + ' · ' + d.purchases + ' purch'}>
                  <div className="w-full rounded-t" style={{ height: Math.max(3, (d.purchases / maxPu) * 60) + 'px', background: '#10b981' }} />
                  <div className="w-full rounded-t" style={{ height: Math.max(3, (d.spend / maxSp) * 90) + 'px', background: 'linear-gradient(to top,#3b82f6,#6366f1)' }} />
                  <div className="text-[9px] text-gray-400 truncate w-full text-center">{d.date.slice(5)}</div>
                </div>
              ))}
            </div>
          );
        })()}
        <div className="px-3 py-1 flex gap-4 text-[11px] text-gray-500"><span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#3b82f6' }} />Spend</span><span><span className="inline-block w-2 h-2 rounded-full mr-1" style={{ background: '#10b981' }} />Purchases</span></div>
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 text-xs"><th className="px-3 py-2">Date</th><th className="px-3 py-2 text-right">Spend</th><th className="px-3 py-2 text-right">Purch</th><th className="px-3 py-2 text-right">Revenue</th><th className="px-3 py-2 text-right">CPA</th><th className="px-3 py-2 text-right">ROAS</th></tr></thead>
          <tbody>{days.map((d, i) => (
            <tr key={i} className="border-t"><td className="px-3 py-1.5">{d.date}</td><td className="px-3 py-1.5 text-right">{money(d.spend)}</td><td className="px-3 py-1.5 text-right font-bold">{d.purchases}</td><td className="px-3 py-1.5 text-right">{money(d.revenue)}</td><td className="px-3 py-1.5 text-right">{money(d.cpa)}</td><td className="px-3 py-1.5 text-right">{Number(d.roas || 0).toFixed(2)}x</td></tr>
          ))}
          {days.length === 0 && <tr><td colSpan={6} className="px-3 py-4 text-center text-gray-400">No daily data</td></tr>}</tbody>
        </table></div>
      </div>
      <div className="text-xs text-gray-500">Source: Meta Graph API live read · Sync: {status?.mode || 'live-read-only'} · Webhook: <code>/api/meta/webhook</code> · OAuth: <code>/api/meta/oauth/start</code></div>
    </div>
  );
}
