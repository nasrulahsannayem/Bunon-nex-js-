import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Truck, X, Phone, Send, Loader2 } from 'lucide-react';

export type RiderNote = {
  id: number; orderId: number | null; invoice: string; consignmentId: string;
  type: string; title: string; message: string; isRead: boolean; createdAt: string;
};

const POLL_MS = 8000;
const authHeaders = () => ({ Authorization: 'Bearer ' + (localStorage.getItem('bunon_token') || '') });
const abs = (t?: string) => (t ? String(t).slice(0, 220) : '');

/**
 * MySQL DATETIME strings arrive in Dhaka local time (server and DB are both
 * UTC+06). Passing them to toLocaleString() would reinterpret them in the
 * viewer's own timezone and shift the clock by two hours, so the wall-clock
 * parts are read directly.
 */
export function dhakaTime(v?: string) {
  const m = String(v || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return '';
  const [, y, mo, d, h, mi] = m;
  const hour = Number(h);
  return `${d} ${mo}/${y} · ${hour % 12 === 0 ? 12 : hour % 12}:${mi} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function useRiderNotes() {
  const [unread, setUnread] = useState(0);
  const [notes, setNotes] = useState<RiderNote[]>([]);
  const cursor = useRef(0);
  const primed = useRef(false);
  const onNew = useRef<((n: RiderNote) => void) | null>(null);

  const markRead = useCallback(async (ids: number[]) => {
    if (!ids.length) return;
    setUnread((u) => Math.max(0, u - ids.length));
    setNotes((ns) => ns.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n)));
    try {
      await fetch('/api/admin/notifications/read', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch { /* badge resyncs on the next poll */ }
  }, []);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      let data: any;
      try {
        // Send an id cursor only after this session has seen the first page;
        // otherwise ask the server for the last few minutes so a note written
        // moments before the tab opened still reaches the operator.
        const q = primed.current ? `since_id=${cursor.current}` : `since_sec=120`;
        const res = await fetch(`/api/admin/notifications?${q}`, { headers: authHeaders() });
        if (!res.ok) return;
        data = await res.json();
      } catch { return; }
      if (!data?.ok || !alive) return;

      setUnread(data.unread || 0);
      // Session-scoped on purpose: a cursor persisted in localStorage from an
      // earlier session silently swallowed every note that arrived since.
      cursor.current = data.maxId || cursor.current;

      const fresh: RiderNote[] = data.notifications || [];
      if (!primed.current) { primed.current = true; setNotes(fresh); return; }
      if (fresh.length === 0) return;

      setNotes(fresh);
      // A note arriving while staff work must interrupt, not quietly grow a
      // badge nobody is looking at.
      onNew.current?.(fresh[0]);
      try { void new Audio('/chat-notify.mp3').play().catch(() => {}); } catch {}
    };
    void poll();
    const t = setInterval(() => void poll(), POLL_MS);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const openOrder = useCallback((n: RiderNote, onOpenOrder?: (id: number) => void) => {
    if (!n.isRead) void markRead([n.id]);
    if (n.orderId && onOpenOrder) onOpenOrder(n.orderId);
    else if (n.invoice) window.open(`/admin/orders?search=${encodeURIComponent(n.invoice)}`, '_blank');
  }, [markRead]);

  return { unread, notes, markRead, openOrder, onNew };
}

/**
 * Steadfast rider notes inside the admin header.
 *
 * Courier events are written to bf_notifications by the webhook on the dash
 * host (dash.bunonfabrics.com), so this only reads them. The list renders
 * inside the existing pending-orders dropdown so the header keeps a single
 * bell; the popup is mounted unconditionally at header level — when it lived
 * inside the dropdown's {notifOpen && ...} block it never mounted while the
 * dropdown was closed, so no notification ever appeared.
 */
export function RiderNoteList({ onOpenOrder }: { onOpenOrder?: (orderId: number) => void }) {
  const { notes, unread, markRead, openOrder } = useRiderNotes();
  return (
    <div className="border-b border-gray-100">
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">
          Steadfast Courier {unread > 0 && <span className="text-brand-primary">({unread})</span>}
        </span>
        {unread > 0 && (
          <button
            onClick={() => void markRead(notes.filter((n) => !n.isRead).map((n) => n.id))}
            className="text-[11px] font-semibold text-brand-primary hover:underline"
          >
            সব পড়া হয়েছে
          </button>
        )}
      </div>
      {notes.length === 0 ? (
        <div className="px-4 py-5 text-center text-xs text-gray-400">কোনো রাইডার নোট নেই</div>
      ) : (
        <div className="max-h-56 overflow-y-auto divide-y divide-gray-50">
          {notes.slice(0, 8).map((n) => (
            <button key={n.id} onClick={() => openOrder(n, onOpenOrder)}
              className={`w-full text-left px-4 py-2.5 hover:bg-gray-50 transition-colors ${n.isRead ? '' : 'bg-red-50/40'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono font-bold text-[11px] text-slate-800">{n.invoice || `#${n.id}`}</span>
                <span className="text-[10px] text-gray-400 shrink-0 font-mono">{dhakaTime(n.createdAt)}</span>
              </div>
              <p className="text-[12px] text-gray-700 mt-0.5 leading-relaxed line-clamp-2">{n.message}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function RiderNotePopup({ onOpenOrder }: { onOpenOrder?: (orderId: number) => void }) {
  const { markRead, openOrder, onNew } = useRiderNotes();
  const [popup, setPopup] = useState<RiderNote | null>(null);
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    onNew.current = (n) => {
      // Only rider notes should interrupt with a popup. System courier
      // events (tracking updates) must never trigger it.
      if (n.type === 'rider_note' || n.message?.includes('Rider Note:')) {
        setPopup(n);
        setReply('');
      }
    };
  }, [onNew]);

  const dismiss = () => {
    if (popup && !popup.isRead) void markRead([popup.id]);
    setPopup(null);
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || !popup) return;
    setSending(true);
    try {
      const res = await fetch('/api/admin/notifications/reply', {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ consignment_id: popup.consignmentId, invoice: popup.invoice, note: text }),
      });
      const j: any = await res.json().catch(() => ({}));
      if (j?.ok) { setReply(''); setPopup(null); }
      else window.alert('❌ ' + (j?.msg || 'মেসেজ পাঠানো যায়নি'));
    } catch { window.alert('❌ সার্ভার এরর'); }
    finally { setSending(false); }
  };

  if (!popup) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/55 backdrop-blur-sm" onClick={dismiss}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 bg-brand-primary px-5 py-3.5">
          <span className="text-lg leading-none">🚨</span>
          <span className="font-extrabold text-white uppercase tracking-wide text-sm">Rider Update</span>
          <button onClick={dismiss} className="ml-auto text-white/85 hover:text-white" aria-label="Close"><X size={18} /></button>
        </div>

        <div className="p-5 space-y-3">
          <p className="font-mono text-xs text-gray-400">{popup.invoice || `#${popup.id}`}</p>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
            <p className="text-[14.5px] leading-relaxed text-amber-900">{abs(popup.message)}</p>
          </div>

          <div className="flex items-center justify-between gap-2 text-[11px] text-gray-400">
            {popup.consignmentId
              ? <span>Consignment: <span className="font-mono">{popup.consignmentId}</span></span>
              : <span />}
            <span className="font-mono">{dhakaTime(popup.createdAt)}</span>
          </div>

          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={3}
            placeholder="রাইডারকে কিছু লিখে পাঠান…"
            className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-brand-primary focus:bg-white focus:ring-4 focus:ring-brand-primary/10 transition resize-none"
          />

          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { dismiss(); openOrder(popup, onOpenOrder); }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.97] transition">
              <Phone size={15} /> Call
            </button>
            <button onClick={() => void sendReply()} disabled={sending || !reply.trim()}
              className="flex items-center justify-center gap-1.5 rounded-xl bg-brand-primary py-2.5 text-[13px] font-bold text-white hover:opacity-90 active:scale-[0.97] transition disabled:opacity-40">
              {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} Rider-কে
            </button>
            <button onClick={() => { dismiss(); openOrder(popup, onOpenOrder); }}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-[0.97] transition">
              <Truck size={15} /> অর্ডার
            </button>
          </div>

          <button onClick={dismiss} className="w-full py-2 text-[12px] font-medium text-gray-400 hover:text-gray-600 transition">
            Close / Ignore
          </button>
        </div>
      </div>
    </div>
  );
}