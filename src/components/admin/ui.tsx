// Shared Bunon Admin UI kit — single design language for all admin tabs.
// Meaning → color (locked): sales green / orders blue / alert red / users purple /
// pending amber / transit indigo / delivered emerald / cancelled rose / return orange.
import { useEffect, useState } from 'react';

export const MEANING: Record<string, string> = {
  sales: 'bg-gradient-to-br from-green-400 to-green-600 text-white shadow-green-200',
  orders: 'bg-gradient-to-br from-blue-400 to-blue-600 text-white shadow-blue-200',
  revenue: 'bg-gradient-to-br from-brand-primary/80 to-brand-primary text-white shadow-pink-200',
  alert: 'bg-gradient-to-br from-red-400 to-red-600 text-white shadow-red-200',
  users: 'bg-gradient-to-br from-purple-500 to-indigo-600 text-white shadow-indigo-200',
  pending: 'bg-gradient-to-br from-amber-400 to-amber-600 text-white shadow-amber-200',
  transit: 'bg-gradient-to-br from-indigo-400 to-indigo-600 text-white shadow-indigo-200',
  delivered: 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-emerald-200',
  cancelled: 'bg-gradient-to-br from-rose-400 to-rose-600 text-white shadow-rose-200',
  ret: 'bg-gradient-to-br from-orange-400 to-orange-500 text-white shadow-orange-200',
};

export function StatCard({ title, value, icon, tone }: { title: string; value: any; icon?: any; tone: keyof typeof MEANING | string }) {
  const cls = (MEANING as any)[tone] || MEANING.orders;
  return (
    <div className={`rounded-2xl p-4 shadow-md flex items-center gap-3 ${cls}`}>
      {icon ? <div className="bg-white/20 rounded-xl p-2.5 shrink-0">{icon}</div> : null}
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider opacity-90">{title}</div>
        <div className="text-xl font-black tabular-nums truncate">{value}</div>
      </div>
    </div>
  );
}

export function SectionHeader({ title, sub, right }: { title: string; sub?: string; right?: any }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
      <div>
        <h2 className="text-lg font-black text-brand-navy">{title}</h2>
        {sub ? <p className="text-xs text-slate-500 mt-0.5">{sub}</p> : null}
      </div>
      {right ? <div className="flex items-center gap-2 flex-wrap">{right}</div> : null}
    </div>
  );
}

export function StatusPill({ status }: { status: any }) {
  const s = String(status || '').toLowerCase();
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700 border-amber-200',
    confirmed: 'bg-blue-100 text-blue-700 border-blue-200',
    on_hold: 'bg-orange-100 text-orange-700 border-orange-200',
    ready: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    in_transit: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    delivered: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
    cancell: 'bg-rose-100 text-rose-700 border-rose-200',
    return: 'bg-orange-100 text-orange-700 border-orange-200',
    returned: 'bg-orange-100 text-orange-700 border-orange-200',
    partial_returned: 'bg-orange-100 text-orange-700 border-orange-200',
    incomplete: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  const cls = map[s] || 'bg-slate-100 text-slate-600 border-slate-200';
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${cls}`}>{String(status || '-').toUpperCase()}</span>;
}

// ---- Avatars: photo wherever a username shows ----
export function photoMap(): Record<string, string> {
  try {
    const w = (window as any).USER_PHOTO_MAP || {};
    const s = JSON.parse(localStorage.getItem('bunon_user_photos') || '{}');
    return { ...s, ...w };
  } catch { return ((window as any).USER_PHOTO_MAP || {}) as Record<string, string>; }
}

export function userPhoto(name: any): string {
  if (!name) return '';
  const m = photoMap();
  const k = String(name).trim();
  return m[k] || m[k.toLowerCase()] || '';
}

export function UserAvatar({ name, size = 32, src: srcProp }: { name: any; size?: number; src?: string }) {
  const src = srcProp || userPhoto(name);
  const label = String(name || '?').trim();
  const initial = label ? label[0].toUpperCase() : '?';
  const [err, setErr] = useState(false);
  useEffect(() => setErr(false), [src]);
  if (src && !err) {
    return <img src={src} alt={label} title={label} width={size} height={size}
      style={{ width: size, height: size }} className="rounded-full object-cover shrink-0 border border-slate-200 bg-slate-100"
      onError={() => setErr(true)} />;
  }
  return <span title={label} style={{ width: size, height: size }}
    className="rounded-full shrink-0 inline-flex items-center justify-center font-black text-white bg-gradient-to-br from-blue-500 to-indigo-600"
  >{initial}</span>;
}

export function NameWithAvatar({ name, size = 24 }: { name: any; size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <UserAvatar name={name} size={size} />
      <span className="truncate">{String(name || '-')}</span>
    </span>
  );
}
