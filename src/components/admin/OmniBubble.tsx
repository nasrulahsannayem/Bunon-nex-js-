/**
 * components/admin/OmniBubble.tsx
 *
 * Omnichannel Inbox floating panel — Facebook + Instagram + WhatsApp,
 * comments and posts included.
 *
 * 2026-10-04 redesign. What actually changed and why:
 *   - Avatars. The API exposes `avatar_url` (Messenger delivers profile_pic
 *     inline and the bridge persists it), but the old row only ever showed
 *     the first letter of a name. An agent scanning a list cannot match a
 *     face to a customer, so a real photo is now the primary identity, with
 *     initials as fallback when Meta has not given one.
 *   - The platform id is now visible. When the display name is missing —
 *     common for Facebook commenters — the agent previously saw an empty row
 *     labelled "unknown customer". The id is the only handle that always
 *     exists.
 *   - Live/unread treatment. The panel refreshes on a timer, so a genuinely
 *     new message must be visible at a glance without reading text.
 *   - Search. With 750+ conversations a filter row alone is not enough.
 *
 * No new dependencies: lucide-react and the channel SVGs were already used
 * here, so the panel keeps inheriting the admin theme exactly.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, RefreshCw } from 'lucide-react';
import { adminFetch } from '../../utils/session';
import { InboxIcon, FacebookIcon, InstagramIcon, WhatsAppIcon } from './InboxIcons';

/** Channel glyphs are inline SVG, not emoji: emoji rendered differently on
 *  every platform and did not match the outline icons in the inbox. */
const CH: Record<string, {
  Icon: (p: { size?: number; className?: string }) => React.ReactNode;
  label: string; tint: string; dot: string;
}> = {
  whatsapp:  { Icon: WhatsAppIcon,  label: 'WhatsApp',  tint: 'bg-emerald-50 text-emerald-700', dot: 'bg-emerald-500' },
};

const PLATFORMS = ['all', 'whatsapp'];

/**
 * Renders a channel's SVG mark plus its label.
 *
 * Two reasons this exists rather than inlining `<CH[p].Icon />`:
 *   - JSX reads a dotted member expression as a tag name, so
 *     <CH[p].Icon /> is a syntax error; the component must be resolved to a
 *     local first.
 *   - the same markup is needed by both the tab strip and the row capsule.
 */
function ChannelMark({ id, size = 12 }: { id: string; size?: number }) {
  if (id === 'all') {
    return (
      <span className="inline-flex items-center gap-1">
        <InboxIcon size={size} />সব
      </span>
    );
  }
  const cap = CH[id];
  if (!cap) return <span>{id}</span>;
  const Cap = cap.Icon;
  return (
    <span className="inline-flex items-center gap-1">
      <Cap size={size} />{cap.label}
    </span>
  );
}

const timeAgo = (v: any) => {
  if (!v) return '';
  const t = Date.parse(String(v).replace(' ', 'T')) || 0;
  if (!t) return '';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'এইমাত্র';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
};

const initials = (v: any) => String(v || '?').trim().slice(0, 1).toUpperCase();

/**
 * Avatar with a graceful fallback.
 *
 * Facebook hands out expiring CDN URLs, so an <img> can 403 long after ingest.
 * Dropping to initials keeps the row readable instead of showing a broken
 * image glyph.
 */
function Avatar({ url, name, tint }: { url?: string | null; name?: string | null; tint: string }) {
  const [failed, setFailed] = useState(false);
  if (url && !failed) {
    return (
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-slate-200"
      />
    );
  }
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold ${tint}`}>
      {initials(name)}
    </span>
  );
}

export default function OmniBubble() {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [counts, setCounts] = useState<any>({});
  const [channels, setChannels] = useState<any[]>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [freshIds, setFreshIds] = useState<number[]>([]);
  const lastTop = useRef<string>('');

  const tick = useCallback(async () => {
    try {
      const d = await adminFetch('/api/admin/omnichannel/stats');
      setCounts(d?.counts || {});
      setChannels(d?.channels || []);
      setErr('');
    } catch {
      setErr('সার্ভারের সাথে যোগাযোগ ব্যর্থ');
    }
    const qs = new URLSearchParams({ limit: '20' });
    if (filter !== 'all') qs.set('platform', filter);
    if (q.trim()) qs.set('q', q.trim());
    try {
      const ld = await adminFetch('/api/admin/omnichannel?' + qs.toString());
      setRecent(ld?.conversations || []);
    } catch {
      /* stats already surfaced the failure; keep the last good list */
    } finally {
      setLoading(false);
    }
  }, [filter, q]);

  useEffect(() => { tick(); }, [tick]);

  useEffect(() => {
    const t = window.setInterval(tick, 15000);
    return () => window.clearInterval(t);
  }, [tick]);

  // Flash rows that changed since the previous poll, so a live arrival is
  // obvious even when the agent is reading further down the list.
  useEffect(() => {
    const top = recent[0] ? `${recent[0].id}:${recent[0].last_message_at}` : '';
    if (!top) return;
    const moved = recent[0]?.last_message_at !== lastTop.current.split(':')[1];
    const hadPrev = Boolean(lastTop.current);
    lastTop.current = top;
    if (!hadPrev || !moved) return;
    const id = Number(recent[0]?.id);
    setFreshIds((s) => [id, ...s.filter((x) => x !== id)].slice(0, 8));
    const t = window.setTimeout(() => {
      setFreshIds((s) => s.filter((x) => x !== id));
    }, 8000);
    return () => window.clearTimeout(t);
  }, [recent]);

  const go = (id: number) => {
    setOpen(false);
    nav(`/admin/inbox?c=${id}`);
  };

  const total = Object.values(CH).reduce(
    (a, k) => a + Number(channels.find((c) => c.platform === k)?.conversations || 0),
    0,
  );

  const unreadFor = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of channels) m[c.platform] = Number(c.unread || 0);
    return m;
  }, [channels]);

  return (
    <>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="অমনিচ্যানেল ইনবক্স"
        className="fixed bottom-6 right-6 z-[56] flex h-14 w-14 items-center justify-center rounded-full bg-slate-800 text-white shadow-xl transition hover:bg-slate-900 focus:outline-none focus:ring-4 focus:ring-slate-300"
      >
        <span aria-hidden className="leading-none">
          <InboxIcon size={24} className="text-white" />
        </span>
        {total > 0 && (
          <>
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white ring-2 ring-white">
              {total > 99 ? '99+' : total}
            </span>
            {/* Quiet pulse while any channel is actively receiving traffic. */}
            <span className="absolute inset-0 -z-10 animate-ping rounded-full bg-slate-400 opacity-20" aria-hidden />
          </>
        )}
      </button>

      {open && (
        <div className="fixed bottom-24 right-6 z-[55] flex max-h-[78dvh] w-[400px] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl max-sm:bottom-28 max-sm:left-3 max-sm:right-3 max-sm:w-auto">
          {/* header */}
          <div className="flex items-center justify-between bg-gradient-to-r from-slate-800 to-slate-700 px-4 py-3 text-white">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">Omnichannel Inbox</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-semibold">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                LIVE
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={tick}
                title="রিফ্রেশ"
                aria-label="রিফ্রেশ"
                className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25"
              >
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
              </button>
              <button
                onClick={() => { setOpen(false); nav('/admin/inbox'); }}
                title="পূর্ণ ইনবক্স খুলুন"
                className="rounded-lg bg-white/15 px-2 py-1 text-xs font-medium hover:bg-white/25"
              >
                সব দেখুন →
              </button>
              <button onClick={() => setOpen(false)} aria-label="বন্ধ করুন"
                className="rounded-lg bg-white/15 p-1.5 hover:bg-white/25">
                <X size={14} />
              </button>
            </div>
          </div>

          {/* search */}
          <div className="relative border-b border-slate-100 px-3 py-2">
            <Search size={14} className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="নাম, আইডি বা মেসেজ খুঁজুন…"
              aria-label="ইনবক্সে খুঁজুন"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-3 text-xs outline-none focus:border-slate-400 focus:bg-white"
            />
          </div>

          {/* channel tabs, with live unread counts */}
          <div className="flex gap-1 overflow-x-auto border-b border-slate-100 px-2 py-1.5">
            {PLATFORMS.map((p) => {
              const n = p === 'all' ? total : unreadFor[p] || 0;
              return (
                <button key={p} onClick={() => setFilter(p)} aria-pressed={filter === p}
                  className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                    filter === p ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}>
                  <ChannelMark id={p} />
                  {n > 0 && (
                    <span className={`rounded-full px-1 text-[10px] ${
                      filter === p ? 'bg-white/25' : 'bg-red-100 text-red-700'
                    }`}>{n}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* stats */}
          <div className="grid grid-cols-4 gap-px border-b border-slate-100 bg-slate-100 text-center">
            <Stat label="অপঠিত" value={counts.unread} tone="text-red-600" />
            <Stat label="আমার" value={counts.assigned_to_me} tone="text-blue-600" />
            <Stat label="অনিয়োজিত" value={counts.unassigned} tone="text-amber-600" />
            <Stat label="মোট" value={counts.total} tone="text-slate-800" />
          </div>

          {err && (
            <div className="bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {err} <button onClick={tick} className="underline">আবার চেষ্টা</button>
            </div>
          )}

          {/* rows */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading ? (
              <div className="space-y-2 p-3" aria-busy="true">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100" />
                ))}
              </div>
            ) : !recent.length ? (
              <div className="p-10 text-center text-xs text-slate-400">
                {err ? 'লোড করা যায়নি' : 'এই চ্যানেলে কোনো কথোপকথন নেই'}
              </div>
            ) : (
              recent.map((c) => {
                const ch = CH[c.platform] || {
                  Icon: InboxIcon, label: c.platform,
                  tint: 'bg-slate-100 text-slate-600', dot: 'bg-slate-400',
                };
                const unread = Number(c.unread_count) > 0;
                const fresh = freshIds.includes(Number(c.id));
                const name = c.display_name || c.external_username || 'অজানা ক্রেতা';
                // The platform id is the only handle guaranteed to exist —
                // Facebook commenters often arrive with a name we never got.
                const pid = c.channel_identities
                  ? String(c.channel_identities).split(',')[0]
                  : '';
                return (
                  <button key={c.id} onClick={() => go(c.id)}
                    className={`flex w-full items-start gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition ${
                      fresh ? 'bg-emerald-50/70' : unread ? 'bg-blue-50/40 hover:bg-blue-50/70' : 'hover:bg-slate-50'
                    }`}>
                    <span className="relative">
                      <Avatar url={c.avatar_url} name={name} tint={ch.tint} />
                      <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${ch.dot}`} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        <span className={`truncate text-sm ${unread ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                          {name}
                        </span>
                        {fresh && (
                          <span className="shrink-0 rounded bg-emerald-600 px-1 text-[9px] font-bold text-white">নতুন</span>
                        )}
                        <span className="ml-auto shrink-0 text-[10px] text-slate-400">{timeAgo(c.last_message_at)}</span>
                      </span>

                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${ch.dot}`} />
                        <span className="truncate text-xs text-slate-500">
                          {c.last_message_preview || 'কোনো বার্তা নেই'}
                        </span>
                      </span>

                      <span className="mt-0.5 flex items-center gap-2 text-[10px] text-slate-400">
                        <span className="shrink-0">{ch.label}</span>
                        {pid && <span className="truncate font-mono">ID {pid}</span>}
                        {unread && (
                          <span className="ml-auto shrink-0 rounded-full bg-red-600 px-1.5 font-bold text-white">
                            {c.unread_count}
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, tone = 'text-slate-800' }: { label: string; value: any; tone?: string }) {
  return (
    <div className="bg-white px-1 py-2">
      <div className={`text-sm font-bold ${tone}`}>{Number(value ?? 0)}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}