import { useEffect, useState } from 'react';
import { StatCard, SectionHeader } from '../../components/admin/ui';
import { AlertTriangle, MousePointerClick, ScrollText, Timer, TrendingDown, Bug, Zap, Users } from 'lucide-react';

type Cache = {
  ok: boolean;
  warming?: boolean;
  message?: string;
  fetched_at?: string;
  age_minutes?: number;
  numOfDays?: number;
  metrics?: Record<string, any>;
  error?: string;
};

const tok = () => localStorage.getItem('bunon_token') || '';
const num = (v: any) => (Number(v) || 0).toLocaleString('en-US');

/** Sum a metric block defensively so an unexpected shape renders 0, not a crash. */
function total(metrics: Record<string, any> | undefined, names: string[]): number {
  if (!metrics) return 0;
  let sum = 0;
  for (const n of names) {
    const v = metrics[n];
    if (typeof v === 'number') sum += v;
    else if (Array.isArray(v)) {
      for (const row of v) {
        for (const k of Object.keys(row || {})) {
          if (/^(value|total|count|numberOf[A-Za-z]*)$/i.test(k) && typeof row[k] === 'number') sum += row[k];
        }
      }
    }
  }
  return sum;
}

function rows(metrics: Record<string, any> | undefined): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  if (!metrics) return out;
  for (const [k, v] of Object.entries(metrics)) {
    if (!Array.isArray(v)) continue;
    for (const row of v) {
      const label = row?.pageUrl || row?.url || row?.name || row?.metric || k;
      const val = row?.value ?? row?.total ?? row?.count ?? row?.numberOfSessions ?? row?.numberOfPageviews ?? 0;
      if (label && typeof val === 'number' && val > 0) out.push({ label: String(label), value: val });
    }
  }
  return out.sort((a, b) => b.value - a.value);
}

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3 text-sm">
      <div className="w-56 shrink-0 truncate text-slate-600" title={label}>{label}</div>
      <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500" style={{ width: pct + '%' }} />
      </div>
      <div className="w-20 text-right font-bold tabular-nums">{num(value)}</div>
    </div>
  );
}

export default function ClarityInsights() {
  const [data, setData] = useState<Cache | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/admin/clarity', { headers: { Authorization: 'Bearer ' + tok() } });
      const j = await r.json();
      setData(j);
      setErr(j?.ok ? '' : (j?.message || j?.error || 'Clarity returned no data yet'));
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const m = data?.metrics;
  const sessions = total(m, ['Traffic']);
  const deadClicks = total(m, ['DeadClickCount']);
  const rageClicks = total(m, ['RageClickCount']);
  const errors = total(m, ['ScriptErrorCount', 'ErrorClickCount']);
  const quickbacks = total(m, ['QuickbackClick']);
  const excScroll = total(m, ['ExcessiveScroll']);
  const scrollDepth = total(m, ['ScrollDepth']);
  const engTime = total(m, ['EngagementTime']);
  const painTotal = deadClicks + rageClicks + errors + quickbacks + excScroll;

  const cards = [
    { title: 'Sessions', value: num(sessions), icon: <Users size={18} />, tone: 'users' },
    { title: 'Avg Scroll Depth', value: sessions ? Math.round(scrollDepth / sessions) + '%' : '0%', icon: <ScrollText size={18} />, tone: 'orders' },
    { title: 'Avg Engagement', value: sessions ? Math.round(engTime / sessions) + 's' : '0s', icon: <Timer size={18} />, tone: 'sales' },
    { title: 'Dead Clicks', value: num(deadClicks), icon: <MousePointerClick size={18} />, tone: 'pending' },
    { title: 'Rage Clicks', value: num(rageClicks), icon: <AlertTriangle size={18} />, tone: 'alert' },
    { title: 'Quick Backs', value: num(quickbacks), icon: <TrendingDown size={18} />, tone: 'ret' },
    { title: 'Script Errors', value: num(errors), icon: <Bug size={18} />, tone: 'alert' },
    { title: 'Total Pain Signals', value: num(painTotal), icon: <Zap size={18} />, tone: 'cancelled' },
  ];

  const top = rows(m).slice(0, 12);
  const topMax = top.length ? top[0].value : 0;

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Clarity Insights"
        sub={`Microsoft Clarity — real visitor behaviour. Rolling ${data?.numOfDays || 3}-day window.`}
        right={
          <div className="flex items-center gap-3">
            {data?.ok && data.age_minutes != null && (
              <span className={`text-xs font-bold px-2.5 py-1 rounded-full border ${
                data.age_minutes <= 130
                  ? 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  : 'bg-amber-100 text-amber-700 border-amber-200'
              }`}>
                synced {data.age_minutes}m ago
              </span>
            )}
            <button onClick={load} disabled={loading}
              className="shrink-0 border border-slate-300 rounded px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
              {loading ? 'Loading…' : 'Refresh'}
            </button>
          </div>
        }
      />

      {err && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <strong>Clarity data not ready.</strong> {err}
          <div className="mt-1 text-xs opacity-80">
            The hourly sync job populates this. It is deliberately not fetched from the browser —
            Clarity allows only 10 requests/day, and this page must never consume them.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map(c => <StatCard key={c.title} title={c.title} value={c.value} icon={c.icon} tone={c.tone} />)}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-slate-800 tracking-tight mb-1">Top Pages by Activity</h3>
        <p className="text-xs text-slate-500 mb-4">Where visitors actually spend attention.</p>
        {top.length === 0 ? (
          <p className="text-sm text-slate-400 py-6 text-center">No page rows in the current cache.</p>
        ) : (
          <div className="space-y-2.5">{top.map((t, i) => <Bar key={i} label={t.label} value={t.value} max={topMax} />)}</div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5">
        <h3 className="font-black text-slate-800 tracking-tight mb-2">How to read this</h3>
        <ul className="text-sm text-slate-600 space-y-1.5 list-disc list-inside">
          <li><strong>Rage Click</strong> — user hammered a control that did nothing. Almost always a dead button or a broken handler.</li>
          <li><strong>Dead Click</strong> — clicked, nothing happened at all. Usually a fake link or an invisible overlay.</li>
          <li><strong>Quickback</strong> — landed and left instantly. The page promised something it did not deliver.</li>
          <li><strong>Script Error</strong> — JS threw on the page. Fix these first; they silently break checkout.</li>
        </ul>
      </div>
    </div>
  );
}