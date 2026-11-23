import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { X, Eye, MousePointerClick, AlertTriangle, TrendingDown, Bug, Zap, Users, ScrollText, Timer, RefreshCw } from 'lucide-react';

type Cache = { ok: boolean; message?: string; age_minutes?: number; numOfDays?: number; metrics?: any; error?: string };
const tok = () => localStorage.getItem('bunon_token') || '';
const num = (v: any) => (Number(v) || 0).toLocaleString('en-US');

/**
 * Each Clarity metric block names its own fields -- there is no shared schema:
 *   Traffic           -> information[0].totalSessionCount
 *   ScrollDepth       -> information[0].averageScrollDepth
 *   EngagementTime    -> information[0].totalTime / activeTime
 *   RageClickCount    -> information[0].sessionsCount
 *   DeadClickCount    -> information[0].sessionsCount
 *   QuickbackClick    -> information[0].sessionsCount
 *   ScriptErrorCount  -> information[0].sessionsCount
 *   ErrorClickCount   -> information[0].sessionsCount
 *   ExcessiveScroll   -> information[0].sessionsCount
 * So each metric is read by its OWN key list. Reading them all with one generic
 * field silently returns 0 for most metrics.
 */
const FIELDS: Record<string, string[]> = {
  Traffic: ['totalSessionCount'],
  ScrollDepth: ['averageScrollDepth'],
  EngagementTime: ['activeTime', 'totalTime'],
  DeadClickCount: ['sessionsCount'],
  RageClickCount: ['sessionsCount'],
  QuickbackClick: ['sessionsCount'],
  ScriptErrorCount: ['sessionsCount'],
  ErrorClickCount: ['sessionsCount'],
  ExcessiveScroll: ['sessionsCount'],
};

function blocks(metrics: any): any[] { return Array.isArray(metrics) ? metrics : []; }

function pick(metrics: any, name: string): number {
  const b = blocks(metrics).find(x => x?.metricName === name);
  if (!b) return 0;
  const fields = FIELDS[name] || ['sessionsCount'];
  let sum = 0;
  for (const row of b.information || []) {
    for (const f of fields) {
      if (typeof row?.[f] === 'number') { sum = row[f]; break; }
    }
  }
  return sum;
}

function pageRows(metrics: any): { label: string; value: number }[] {
  const merged = new Map<string, number>();
  for (const b of blocks(metrics)) {
    for (const row of b?.information || []) {
      const url = row?.pageUrl || row?.url || row?.name;
      if (!url) continue;
      const v = row?.pageViews ?? row?.sessionsCount ?? row?.subTotal ?? 0;
      if (typeof v === 'number' && v > 0) merged.set(url, Math.max(merged.get(url) || 0, v));
    }
  }
  return [...merged.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

export default function ClarityModal({ onClose }: { onClose: () => void }) {
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
    } catch (e: any) { setErr(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', h); document.body.style.overflow = prev; };
  }, [onClose]);

  const m = data?.metrics;
  const sessions = pick(m, 'Traffic');
  const deadClicks = pick(m, 'DeadClickCount');
  const rageClicks = pick(m, 'RageClickCount');
  const errors = pick(m, 'ScriptErrorCount') + pick(m, 'ErrorClickCount');
  const quickbacks = pick(m, 'QuickbackClick');
  const excScroll = pick(m, 'ExcessiveScroll');
  const scrollDepth = pick(m, 'ScrollDepth');
  const engTime = pick(m, 'EngagementTime');
  const painTotal = deadClicks + rageClicks + errors + quickbacks + excScroll;

  const cards = [
    { title: 'Sessions', value: num(sessions), icon: <Users className="w-4 h-4" />, cls: 'from-purple-500 to-indigo-600 shadow-indigo-200' },
    { title: 'Avg Scroll', value: sessions ? Math.round(scrollDepth) + '%' : '0%', icon: <ScrollText className="w-4 h-4" />, cls: 'from-blue-400 to-blue-600 shadow-blue-200' },
    { title: 'Avg Engage', value: engTime ? Math.round(engTime) + 's' : '0s', icon: <Timer className="w-4 h-4" />, cls: 'from-emerald-400 to-emerald-600 shadow-emerald-200' },
    { title: 'Dead Clicks', value: num(deadClicks), icon: <MousePointerClick className="w-4 h-4" />, cls: 'from-amber-400 to-amber-600 shadow-amber-200' },
    { title: 'Rage Clicks', value: num(rageClicks), icon: <AlertTriangle className="w-4 h-4" />, cls: 'from-red-400 to-red-600 shadow-red-200' },
    { title: 'Quick Backs', value: num(quickbacks), icon: <TrendingDown className="w-4 h-4" />, cls: 'from-orange-400 to-orange-500 shadow-orange-200' },
    { title: 'Script Errors', value: num(errors), icon: <Bug className="w-4 h-4" />, cls: 'from-rose-400 to-rose-600 shadow-rose-200' },
    { title: 'Pain Signals', value: num(painTotal), icon: <Zap className="w-4 h-4" />, cls: 'from-fuchsia-500 to-pink-600 shadow-pink-200' },
  ];

  const top = pageRows(m).slice(0, 10);
  const topMax = top.length ? top[0].value : 0;
  const allZero = sessions === 0 && painTotal === 0;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-2 overflow-y-auto" onClick={onClose}>
      <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }}
        transition={{ type: 'tween', duration: 0.2 }} onClick={e => e.stopPropagation()}
        className="bg-white rounded-3xl shadow-2xl w-full max-w-[90%] max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-indigo-600 to-purple-700 text-white px-4 py-3 flex items-center gap-2">
          <div className="p-2 bg-white/20 rounded-xl"><Eye className="w-4 h-4" /></div>
          <div className="min-w-0">
            <h2 className="font-bold tracking-tight">{'Microsoft Clarity'}</h2>
            <p className="text-[10px] opacity-80 font-medium">{'রিয়েল ভিজিটর ব্যবহার — rage click, dead click, scroll, script error'}</p>
          </div>
          <div className="ml-auto flex items-center gap-1">
            {data?.ok && data.age_minutes != null && (
              <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${data.age_minutes <= 130 ? 'bg-emerald-400/25 text-emerald-50' : 'bg-amber-400/25 text-amber-50'}`}>
                {'synced ' + data.age_minutes + 'm ago'}
              </span>
            )}
            <button onClick={load} disabled={loading} className="p-2 bg-white/20 rounded-xl hover:bg-white/30 disabled:opacity-50" title="Refresh cache">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={onClose} className="p-2 bg-white/20 rounded-xl hover:bg-white/30" title="Close"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="p-4 overflow-y-auto">
          {err && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 mb-3">
              <strong>{'Clarity ডেটা এখনো নেই।'}</strong> {err}
              <div className="mt-1 opacity-80 text-[9px]">{'ঘণ্টায়-একবার sync হয় (Clarity দিনে মাত্র ১০টি request দেয়)।'}</div>
            </div>
          )}

          {allZero && !loading && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 mb-3">
              <strong>{'Clarity এখনো কোনো ভিজিটর session সংগ্রহ করেনি।'}</strong>
              <div className="mt-1 opacity-80 text-[9px]">
                {'এটি ত্রুটি নয় — শুধু ট্রাফিক এখনো এত কম যে ৩ দিনের উইন্ডোতে রেকর্ড পড়ে না।'}
                <br />
                {['কিছুদিন ট্রাফিক চললে এখানে সত্যি সংখ্যা দেখা যাবে।']}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {cards.map(c => (
              <div key={c.title} className={`bg-gradient-to-br ${c.cls} text-white rounded-2xl p-3 shadow-md flex items-center gap-2`}>
                <div className="p-2 bg-white/20 rounded-xl shrink-0">{c.icon}</div>
                <div className="min-w-0">
                  <div className="text-[9px] font-bold uppercase tracking-wider opacity-90 truncate">{c.title}</div>
                  <div className="text-sm font-black tabular-nums">{c.value}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 bg-slate-50 border border-slate-200 rounded-2xl p-3">
            <h3 className="text-sm font-bold text-slate-700 mb-2">{'Top Pages — কোথায় মানুষ সময় দিচ্ছে'}</h3>
            {top.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">{loading ? 'লোড হচ্ছে...' : 'এখনো কোনো পেজ ডেটা নেই'}</p>
            ) : (
              <div className="space-y-1">
                {top.map((t, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    <div className="w-40 shrink-0 truncate font-mono text-slate-600" title={t.label}>{t.label}</div>
                    <div className="flex-1 h-1.5 bg-white rounded-full overflow-hidden border border-slate-100">
                      <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-indigo-500" style={{ width: (topMax > 0 ? (t.value * 100 / topMax) : 0) + '%' }} />
                    </div>
                    <div className="w-12 text-right font-black tabular-nums text-slate-500">{num(t.value)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 bg-white border border-slate-200 rounded-2xl p-3">
            <h3 className="text-sm font-bold text-slate-700 mb-1">{'কী বুঝবেন'}</h3>
            <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
              <li><strong>Rage Click</strong> — বারবার ক্লিক করেছে কিন্তু কিছু হয়নি। মানে মরা বাটন বা ভাঙা handler।</li>
              <li><strong>Dead Click</strong> — ক্লিক করেছে, একদম কিছু হয়নি। সাধারণত ভুল লিংক বা গোপন overlay।</li>
              <li><strong>Quickback</strong> — ঢুকে সাথে সাথে বেরিয়ে এসেছে। পেজ প্রতিশ্রুতি দিয়েছে, ডেলিভারি করেনি।</li>
              <li><strong>Script Error</strong> — পেজে JS ভেঙেছে। এগুলো আগে ঠিক করুন — checkout নিজে থেকে নষ্ট হয়।</li>
            </ul>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}