import { useEffect, useRef, useState } from 'react';
import WAChatModal from './WAChatModal';

const authH = () => ({ Authorization: `Bearer ${localStorage.getItem('bunon_token')}` } as Record<string, string>);
const normBd = (p: string) => {
  const d = String(p || '').replace(/[^0-9]/g, '');
  if (d.startsWith('880')) return d;
  if (d.length === 11 && d.startsWith('01')) return '880' + d.slice(1);
  return d;
};
const getUnread = (): string[] => { try { return JSON.parse(localStorage.getItem('wa_unread_phones') || '[]'); } catch { return []; } };
const saveUnread = (a: string[]) => { try { localStorage.setItem('wa_unread_phones', JSON.stringify(a)); } catch { /* noop */ } };

export default function WAFloatingBubble() {
  const [convs, setConvs] = useState<any[]>([]);
  const [panel, setPanel] = useState(false);
  const [sel, setSel] = useState<{ phone: string; name: string } | null>(null);
  const [q, setQ] = useState('');
  const [unread, setUnread] = useState<string[]>(getUnread());
  const [pulse, setPulse] = useState(false);
  const lastSeen = useRef<number>(0);
  const origTitle = useRef<string>(document.title);
  const titleTimer = useRef<number | null>(null);

  const stopFlash = () => {
    if (titleTimer.current) { clearInterval(titleTimer.current); titleTimer.current = null; }
    if (document.title !== origTitle.current) document.title = origTitle.current;
    setPulse(false);
  };
  const startFlash = () => {
    if (titleTimer.current) return;
    setPulse(true);
    let on = false;
    titleTimer.current = window.setInterval(() => {
      document.title = on ? origTitle.current : 'নতুন WhatsApp বার্তা!';
      on = !on;
    }, 1000);
  };

  const tick = async () => {
    try {
      const r = await fetch('/api/admin/whatsapp/conversations?limit=30', { headers: authH() });
      const d = await r.json();
      if (!d || !d.ok || !d.conversations) return;
      setConvs(d.conversations);
      let newest = 0, fresh = 0;
      const now = Date.now();
      const seen = getUnread();
      let changed = false;
      for (const c of d.conversations) {
        const ts = Date.parse(String(c.created_at || '').replace(' ', 'T')) || 0;
        if (ts > newest) newest = ts;
        if (c.direction === 'in' && ts > lastSeen.current) {
          fresh++;
          const ph = normBd(c.phone);
          if (ph && !seen.includes(ph)) { seen.push(ph); changed = true; }
        }
      }
      if (changed) { saveUnread(seen); setUnread(seen); }
      if (!lastSeen.current) { lastSeen.current = newest || now; return; }
      if (fresh > 0 && newest > lastSeen.current) {
        lastSeen.current = newest;
        startFlash();
        setPanel(true);
      } else if (newest > lastSeen.current) {
        lastSeen.current = newest;
      }
    } catch { /* silent poll */ }
  };

  useEffect(() => {
    const t = setInterval(tick, 8000);
    const first = setTimeout(tick, 3000);
    return () => { clearInterval(t); clearTimeout(first); stopFlash(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openChat = (phone: string, name: string) => {
    const ph = normBd(phone);
    setUnread(prev => { const n = prev.filter(x => x !== ph); saveUnread(n); return n; });
    stopFlash();
    setSel({ phone, name });
  };

  const ql = q.trim().toLowerCase();
  const list = convs.filter(c => !ql || (c.cname || '').toLowerCase().includes(ql) || String(c.phone || '').includes(ql));

  return (
    <>
      <button onClick={() => { setPanel(!panel); if (!panel) stopFlash(); }} title="হোয়াটসঅ্যাপ চ্যাট"
        className={`fixed right-4 bottom-4 z-[55] w-14 h-14 rounded-full overflow-hidden shadow-xl hover:scale-105 transition-transform bg-white flex items-center justify-center ${pulse ? 'animate-pulse ring-4 ring-emerald-400' : ''}`}>
        <img src="/wa_icon.png" alt="WhatsApp" className="w-full h-full object-cover" />
        {unread.length > 0 && <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">{unread.length > 9 ? '9+' : unread.length}</span>}
      </button>
      {panel && (
        <div className="fixed right-4 bottom-20 z-[55] w-[330px] max-w-[calc(100vw-2rem)] max-h-[60vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden max-sm:left-3 max-sm:right-3 max-sm:w-auto max-sm:max-w-none max-sm:bottom-24 max-sm:max-h-[70dvh]">
          <div className="bg-emerald-700 text-white px-4 py-3 text-sm font-bold flex items-center justify-between">
            <span>WhatsApp চ্যাট</span>
            <button onClick={() => setPanel(false)} className="px-2 py-0.5 bg-white/20 rounded-lg font-bold">✕</button>
          </div>
          <div className="p-2 border-b border-slate-100">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="নাম/নম্বর খুঁজুন..." className="w-full border border-slate-200 rounded-full px-4 py-2 text-sm outline-none focus:border-emerald-500" />
          </div>
          <div className="overflow-y-auto flex-1">
            {list.map((c, i) => {
              const dot = unread.includes(normBd(c.phone));
              const prev = c.msg_type === 'image' ? '📷 ছবি' : ['audio', 'voice', 'ptt'].includes(c.msg_type) ? '🎤 ভয়েস' : String(c.body || '').replace(/^\[AUTO\]\s*/, '').slice(0, 60);
              return (
                <button key={i} onClick={() => openChat(c.phone, c.cname || '')} className="w-full text-left px-4 py-3 hover:bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                  <span className="w-9 h-9 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center shrink-0">{String(c.cname || c.phone || '?').slice(0, 1)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-slate-800 truncate">{c.cname || c.phone}{dot && <span className="text-red-600"> ●</span>}</span>
                    <span className="block text-xs text-slate-500 truncate">{c.direction === 'out' ? 'আপনি: ' : ''}{prev}</span>
                  </span>
                </button>
              );
            })}
            {list.length === 0 && <div className="text-center text-xs text-slate-400 py-8">এখনো কোনো চ্যাট নেই</div>}
          </div>
        </div>
      )}
      {sel && <WAChatModal phone={sel.phone} name={sel.name} onClose={() => setSel(null)} />}
    </>
  );
}
