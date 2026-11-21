/**
 * Middle-panel additions for a Chatwoot-grade conversation header.
 *
 * The backend already exposes snooze, SLA, timeline, saved views and the
 * quick-reply library (migration 0002 + verified endpoints). None of it was
 * reachable from the UI, so the panel offered only two dropdowns.
 *
 * This component adds:
 *   - an overflow menu (snooze presets, copy, mark unread, close/reopen)
 *   - a live SLA pill with a breach state
 *   - a timeline drawer fed by /:id/timeline
 *   - a quick-reply picker fed by /library/all, inserted at the caret
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlarmClock, ChevronDown, ClipboardList, Copy, History,
  MessageSquarePlus, MoreHorizontal, Timer, X, Zap,
} from 'lucide-react';
import { adminFetch } from '../../utils/session';

/* ── SLA pill ─────────────────────────────────────────────────────────── */

export function SlaPill({ conversationId }: { conversationId: number }) {
  const [sla, setSla] = useState<any>(null);

  const load = useCallback(async () => {
    const r: any = await adminFetch(`/api/admin/omnichannel/${conversationId}/sla`);
    setSla(r?.data?.sla ?? null);
  }, [conversationId]);

  useEffect(() => { load(); }, [load]);

  if (!sla || sla.waitingMinutes == null) {
    // No clock yet — do not show a meaningless badge.
    return sla ? (
      <span title="এখনো কোনো উত্তর দেওয়ার সময় রেকর্ড হয়নি"
        className="hidden items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 md:inline-flex">
        <Timer size={10} /> SLA
      </span>
    ) : null;
  }

  const breach = sla.breached;
  const tone = breach
    ? 'bg-red-50 text-red-700 ring-1 ring-red-200'
    : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';

  return (
    <span
      title={`প্রথম উত্তরের লক্ষ্য ${sla.policyMinutes} মিনিট`}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}
    >
      <Timer size={10} />
      {sla.label}
    </span>
  );
}

/* ── overflow menu ────────────────────────────────────────────────────── */

const SNOOZE_PRESETS = [
  { label: '১৫ মিনিট', minutes: 15 },
  { label: '১ ঘণ্টা', minutes: 60 },
  { label: '৪ ঘণ্টা', minutes: 240 },
  { label: 'আগামীকাল সকাল', minutes: 60 * 12 },
];

export function ConversationMenu({
  conversationId,
  onChanged,
  onMarkUnread,
  onClose,
}: {
  conversationId: number;
  onChanged?: () => void;
  onMarkUnread?: () => void;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [snoozePanel, setSnoozePanel] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const snooze = async (minutes: number) => {
    setBusy('snooze');
    const r: any = await adminFetch(`/api/admin/omnichannel/${conversationId}/snooze`, {
      method: 'POST',
      body: JSON.stringify({ minutes }),
    });
    setBusy('');
    setOpen(false);
    setSnoozePanel(false);
    onClose?.();
    if (r?.success) onChanged?.();
  };

  const act = async (name: string, run: () => Promise<any>) => {
    setBusy(name);
    await run();
    setBusy('');
    setOpen(false);
    onChanged?.();
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="আরও অপশন"
        aria-expanded={open}
        className={`rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50 ${open ? 'bg-slate-100' : ''}`}
      >
        <MoreHorizontal size={14} />
      </button>

      {open && (
        <div className="absolute right-0 top-9 z-40 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
          {!snoozePanel ? (
            <>
              <Item
                icon={<AlarmClock size={13} />}
                onClick={() => setSnoozePanel(true)}
                busy={busy === 'snooze'}
              >
                স্নুজ…
              </Item>
              <Item
                icon={<ClipboardList size={13} />}
                onClick={() => act('unread', async () => {
                  onMarkUnread?.();
                  await adminFetch(`/api/admin/omnichannel/${conversationId}/read`, {
                    method: 'POST', body: JSON.stringify({ unread: true }),
                  });
                })}
                busy={busy === 'unread'}
              >
                অপঠিত হিসেবে চিহ্নিত করুন
              </Item>
              <Item
                icon={<Copy size={13} />}
                onClick={() => act('copy', async () => {
                  await navigator.clipboard?.writeText(String(conversationId));
                })}
                busy={busy === 'copy'}
              >
                আইডি কপি করুন
              </Item>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between px-3 py-1.5 text-[11px] font-bold text-slate-500">
                কতক্ষণ স্নুজ?
                <button onClick={() => setSnoozePanel(false)} aria-label="ফিরে যান">
                  <X size={12} />
                </button>
              </div>
              {SNOOZE_PRESETS.map((p) => (
                <Item
                  key={p.minutes}
                  icon={<Timer size={13} />}
                  onClick={() => snooze(p.minutes)}
                  busy={busy === 'snooze'}
                >
                  {p.label}
                </Item>
              ))}
              <Item icon={<Zap size={13} />} onClick={() => snooze(0)} busy={busy === 'snooze'}>
                এখনই ফেরত আনো
              </Item>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Item({
  icon, children, onClick, busy,
}: { icon: React.ReactNode; children: React.ReactNode; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
    >
      <span className="text-slate-400">{icon}</span>
      {children}
    </button>
  );
}

/* ── timeline drawer ──────────────────────────────────────────────────── */

const EVENT_BN: Record<string, string> = {
  snoozed: 'স্নুজ করা হয়েছে',
  unsnoozed: 'স্নুজ থেকে ফেরত',
  assigned: 'Assign করা হয়েছে',
  status_changed: 'অবস্থা পরিবর্তন',
  priority_changed: 'অগ্রাধিকার পরিবর্তন',
  note_added: 'নোট যোগ',
};

export function TimelineDrawer({
  conversationId, onClose,
}: { conversationId: number; onClose: () => void }) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    (async () => {
      const r: any = await adminFetch(`/api/admin/omnichannel/${conversationId}/timeline`);
      if (live) {
        setEvents(r?.data?.timeline || []);
        setLoading(false);
      }
    })();
    return () => { live = false; };
  }, [conversationId]);

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      <button
        onClick={onClose}
        aria-label="বন্ধ করুন"
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]"
      />
      <aside
        role="dialog"
        aria-label="কথোপকথনের ইতিহাস"
        className="relative flex h-full w-[min(420px,90vw)] flex-col bg-white shadow-2xl"
      >
        <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <History size={15} /> ইতিহাস
          </h2>
          <button onClick={onClose} aria-label="বন্ধ" className="rounded-lg p-1 hover:bg-slate-100">
            <X size={15} />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-3">
          {loading && <p className="py-8 text-center text-xs text-slate-400">লোড হচ্ছে…</p>}
          {!loading && !events.length && (
            <p className="py-8 text-center text-xs text-slate-400">এখনো কোনো পরিবর্তন রেকর্ড হয়নি।</p>
          )}
          <ol className="space-y-1.5">
            {events.map((e) => (
              <li key={e.id} className="rounded-lg border border-slate-100 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-800">
                    {EVENT_BN[e.type] || e.type}
                  </span>
                  <time className="shrink-0 text-[10px] text-slate-400">
                    {String(e.at || '').slice(5, 16)}
                  </time>
                </div>
                {(e.from || e.to) && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {e.from ? `${e.from} → ` : ''}{e.to}
                  </p>
                )}
                {e.actor && <p className="mt-0.5 text-[10px] text-slate-400">দিয়েছেন {e.actor}</p>}
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

/* ── quick replies ────────────────────────────────────────────────────── */

/**
 * Renders a picker button plus the insertion callback. The caller owns the
 * textarea, so this returns the chosen text rather than writing to a ref it
 * does not own.
 */
export function QuickReplies({
  channel, onPick,
}: { channel?: string; onPick: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    (async () => {
      const q = channel ? `?channel=${encodeURIComponent(channel)}` : '';
      const r: any = await adminFetch(`/api/admin/omnichannel/library/all${q}`);
      setItems([...(r?.data?.quickReplies || []), ...(r?.data?.canned || [])]);
      setLoading(false);
    })();
  }, [open, channel]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="দ্রুত উত্তর"
        title="দ্রুত উত্তর"
        className={`inline-flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 ${open ? 'bg-slate-100' : ''}`}
      >
        <MessageSquarePlus size={15} />
      </button>
      {open && (
        <>
          <button onClick={() => setOpen(false)} className="fixed inset-0 z-30 cursor-default" aria-label="বন্ধ" />
          <div className="absolute bottom-10 left-0 z-40 max-h-72 w-[min(320px,80vw)] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            <p className="px-3 py-1 text-[10px] font-bold text-slate-400">দ্রুত উত্তর</p>
            {loading && <p className="px-3 py-2 text-[11px] text-slate-400">লোড হচ্ছে…</p>}
            {!loading && !items.length && (
              <p className="px-3 py-2 text-[11px] text-slate-400">কোনো দ্রুত উত্তর নেই।</p>
            )}
            {items.map((it) => (
              <button
                key={`${it.id}-${it.title}`}
                onClick={() => { onPick(it.body); setOpen(false); }}
                className="block w-full px-3 py-1.5 text-left hover:bg-slate-50"
              >
                <span className="block text-xs font-semibold text-slate-800">{it.title}</span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500">{it.body}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/** Small helper so the header can host the history button consistently. */
export const HistoryButton = ({ onClick }: { onClick: () => void }) => (
  <button onClick={onClick} aria-label="ইতিহাস" title="ইতিহাস"
    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 p-1.5 hover:bg-slate-50">
    <History size={14} />
  </button>
);

export const Chevron = ChevronDown;