import { useEffect, useRef, useState } from 'react';

const authJson = () => ({ Authorization: `Bearer ${localStorage.getItem('bunon_token')}`, 'Content-Type': 'application/json' } as Record<string, string>);

interface Props { phone: string; name?: string; invoice?: string; amount?: number | string; onClose: () => void; }

export default function WAChatModal({ phone, name, invoice, amount, onClose }: Props) {
  const [msgs, setMsgs] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [tpls, setTpls] = useState<any[]>([]);
  const [showTpl, setShowTpl] = useState(false);
  const [busy, setBusy] = useState(false);
  const [conn, setConn] = useState<boolean | null>(null);
  const [mode, setMode] = useState<'chat' | 'broadcast'>('chat');
  const [bulkPhones, setBulkPhones] = useState(phone);
  const [rec, setRec] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mrRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const fill = (b: string) => String(b || '').replace('{name}', name || '').replace('{invoice}', invoice || '').replace('{amount}', String(amount ?? ''));

  const load = async () => {
    try {
      const r = await fetch(`/api/admin/whatsapp/history?phone=${encodeURIComponent(phone)}&limit=100`, { headers: { Authorization: `Bearer ${localStorage.getItem('bunon_token')}` } });
      const d = await r.json();
      if (d.ok) setMsgs(d.messages || []);
    } catch { /* silent poll */ }
  };

  useEffect(() => {
    load();
    fetch('/api/admin/whatsapp/status', { headers: { Authorization: `Bearer ${localStorage.getItem('bunon_token')}` } }).then(r => r.json()).then(d => setConn(!!d.connected)).catch(() => setConn(false));
    fetch('/api/admin/whatsapp/templates', { headers: { Authorization: `Bearer ${localStorage.getItem('bunon_token')}` } }).then(r => r.json()).then(d => { if (d.ok) setTpls(d.templates || []); }).catch(() => {});
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phone]);

  useEffect(() => { boxRef.current?.scrollTo(0, boxRef.current.scrollHeight); }, [msgs]);

  useEffect(() => { setBulkPhones(phone); setInput(''); }, [phone]);

  const sendText = async (text: string) => {
    const t = (text || '').trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/whatsapp/send-text', { method: 'POST', headers: authJson(), body: JSON.stringify({ phone, text: t }) });
      const d = await r.json().catch(() => ({} as any));
      if (!r.ok || (d && (d as any).ok === false)) { alert((d as any).msg || 'Send failed!'); return; }
      setInput('');
      await load();
    } catch { alert('Send failed!'); } finally { setBusy(false); }
  };

  const sendBulk = async () => {
    const list = bulkPhones.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    const t = input.trim();
    if (!list.length || !t || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/whatsapp/send-bulk', { method: 'POST', headers: authJson(), body: JSON.stringify({ phones: list, text: t }) });
      const d = await r.json().catch(() => ({} as any));
      if (!r.ok || (d && (d as any).ok === false)) { alert((d as any).msg || 'Broadcast failed!'); return; }
      setInput('');
      alert('Broadcast sent');
    } finally { setBusy(false); }
  };

  const onFile = async (f: File | undefined) => {
    if (!f || busy) return;
    const isImg = f.type.startsWith('image/');
    const isVid = f.type.startsWith('video/');
    if (!isImg && !isVid) { alert('শুধু ছবি/ভিডিও (ছবি ৫MB, ভিডিও ১৬MB)'); return; }
    if (isImg && f.size > 5 * 1024 * 1024) { alert('ছবি ৫MB এর বেশি'); return; }
    if (isVid && f.size > 16 * 1024 * 1024) { alert('ভিডিও ১৬MB এর বেশি'); return; }
    setBusy(true);
    try {
      const b64 = await new Promise<string>((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.onerror = rej; fr.readAsDataURL(f); });
      const r = await fetch('/api/admin/whatsapp/send-media', { method: 'POST', headers: authJson(), body: JSON.stringify({ phone, caption: input, mime: f.type, data_b64: b64 }) });
      const d = await r.json().catch(() => ({} as any));
      if (!r.ok || (d && (d as any).ok === false)) { alert((d as any).msg || 'Media send failed!'); return; }
      setInput('');
      await load();
    } catch { alert('Media send failed!'); } finally { setBusy(false); }
  };

  const toggleRec = async () => {
    if (rec) { mrRef.current?.stop(); setRec(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];
      mr.ondataavailable = e => { if (e.data.size) chunksRef.current.push(e.data); };
      const to = setTimeout(() => { try { mr.stop(); } catch { /* cap 60s */ } setRec(false); }, 60000);
      mr.onstop = async () => {
        clearTimeout(to);
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const b64 = await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1]); fr.readAsDataURL(blob); });
        setBusy(true);
        try {
          await fetch('/api/admin/whatsapp/send-media', { method: 'POST', headers: authJson(), body: JSON.stringify({ phone, caption: '', mime: 'audio/webm', data_b64: b64 }) });
          await load();
        } finally { setBusy(false); }
      };
      mrRef.current = mr;
      mr.start();
      setRec(true);
    } catch { alert('মাইক্রোফোন চালু হয়নি'); }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 max-sm:p-0 max-sm:items-stretch" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg h-[80vh] flex flex-col overflow-hidden shadow-2xl max-sm:rounded-none max-sm:max-w-full max-sm:h-[100dvh]" onClick={e => e.stopPropagation()}>
        <div className="bg-emerald-700 text-white px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-bold text-sm">{name || phone}</div>
            <div className="text-[11px] opacity-80 font-mono">{phone}{invoice ? ` • #${invoice}` : ''} • {conn === null ? '...' : conn ? '🟢 সংযুক্ত' : '🔴 সংযোগ নেই'}</div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setMode(mode === 'chat' ? 'broadcast' : 'chat')} className="text-[11px] font-bold bg-white/20 hover:bg-white/30 px-2.5 py-1.5 rounded-lg">📢 ব্রডকাস্ট</button>
            <button onClick={onClose} className="px-2 py-1 bg-white/20 hover:bg-white/30 rounded-lg font-bold">✕</button>
          </div>
        </div>
        {mode === 'broadcast' ? (
          <div className="p-4 space-y-2 flex-1 overflow-y-auto">
            <label className="text-[11px] font-bold text-slate-500">নম্বরগুলো (কমা/স্পেস/লাইন দিয়ে আলাদা, সর্বোচ্চ ২০০)</label>
            <textarea rows={5} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-emerald-500" value={bulkPhones} onChange={e => setBulkPhones(e.target.value)} />
          </div>
        ) : (
          <div ref={boxRef} className="flex-1 overflow-y-auto p-4 space-y-2 bg-slate-50">
            {msgs.map((m, i) => (
              <div key={i} className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${m.direction === 'out' ? 'ml-auto bg-emerald-100' : 'mr-auto bg-white border border-slate-200'}`}>
                {m.msg_type !== 'text' && <div className="text-[10px] font-bold text-slate-400">[{m.msg_type}]{m.media_path ? ` ${m.media_path}` : ''}</div>}
                <div className="whitespace-pre-wrap">{m.body}</div>
              </div>
            ))}
            {msgs.length === 0 && <div className="text-center text-xs text-slate-400 py-8">এখনো কোনো মেসেজ নেই</div>}
          </div>
        )}
        {showTpl && (
          <div className="border-t max-h-40 overflow-y-auto p-2 space-y-1 bg-amber-50">
            {tpls.map(t => (
              <button key={t.id} onClick={() => { setInput(fill(t.body)); setShowTpl(false); }} className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-amber-100 border border-amber-100">
                <span className="font-bold">{t.title}</span><span className="text-slate-500"> — {String(t.body).slice(0, 60)}</span>
              </button>
            ))}
            {tpls.length === 0 && <div className="text-xs text-slate-400 px-3 py-2">কোনো টেমপ্লেট নেই</div>}
          </div>
        )}
        <div className="p-3 border-t flex items-center gap-2">
          <button onClick={() => fileRef.current?.click()} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-full" title="ছবি/ভিডিও">📎</button>
          <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={e => { onFile(e.target.files?.[0]); e.target.value = ''; }} />
          <button onClick={() => setShowTpl(!showTpl)} className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-full" title="টেমপ্লেট">📝</button>
          <button onClick={toggleRec} className={`p-2.5 rounded-full ${rec ? 'bg-red-500 text-white animate-pulse' : 'bg-slate-100 hover:bg-slate-200'}`} title="ভয়েস নোট">🎤</button>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') mode === 'chat' ? sendText(input) : sendBulk(); }} placeholder={mode === 'chat' ? 'মেসেজ লিখুন...' : 'ব্রডকাস্ট মেসেজ...'} className="flex-1 border border-slate-200 rounded-full px-4 py-2.5 text-sm outline-none focus:border-emerald-500" />
          <button disabled={busy} onClick={() => mode === 'chat' ? sendText(input) : sendBulk()} className="p-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full disabled:opacity-50 font-bold">➤</button>
        </div>
      </div>
    </div>
  );
}
