import { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';

const authH = () => ({ Authorization: "Bearer " + (localStorage.getItem('bunon_token') || '') } as Record<string, string>);

interface Props {
  onClose: () => void;
}

type ConnState = 'idle' | 'generating' | 'waiting_scan' | 'connected' | 'error';

export default function WAConnectModal({ onClose }: Props) {
  const [state, setState] = useState<ConnState>('idle');
  const [qr, setQr] = useState('');
  const [msg, setMsg] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startQR = async () => {
    setState('generating');
    setQr('');
    setMsg('');
    try {
      const r = await fetch('/api/admin/whatsapp/qr-start', {
        method: 'POST',
        headers: { ...authH(), 'Content-Type': 'application/json' },
      });
      const d = await r.json();
      if (!r.ok || !d.ok) {
        setState('error');
        setMsg(d.msg || 'QR generate ব্যর্থ হয়েছে');
        return;
      }
      setQr(d.qr);
      setState('waiting_scan');
      pollRef.current = setInterval(async () => {
        try {
          const sr = await fetch('/api/admin/whatsapp/status', {
            headers: { ...authH(), 'Content-Type': 'application/json' },
          });
          const sd = await sr.json();
          if (sd.connected) {
            stopPoll();
            setState('connected');
            setMsg('WhatsApp সংযুক্ত হয়েছে!');
            setTimeout(onClose, 2000);
          }
        } catch { /* silent */ }
      }, 3000);
    } catch (e: any) {
      setState('error');
      setMsg(e?.message || 'সংযোগ ব্যর্থ');
    }
  };

  useEffect(() => {
    // Check current status on mount
    fetch('/api/admin/whatsapp/status', {
          headers: { ...authH(), 'Content-Type': 'application/json' } })
      .then(r => r.json())
      .then(d => {
        if (d.connected) {
          setState('connected');
          setMsg('WhatsApp সংযুক্ত আছে');
        } else {
          startQR();
        }
      })
      .catch(() => { setState('error'); setMsg('সার্ভার সাড়া দিচ্ছে না'); });

    return stopPoll;
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-emerald-700 text-white px-4 py-3 flex items-center justify-between">
          <span className="font-bold text-sm">WhatsApp Connect</span>
          <button onClick={onClose} className="p-1 hover:bg-white/20 rounded-lg">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 flex flex-col items-center text-center">
          {state === 'idle' && (
            <div className="text-slate-400 text-sm">লোড হচ্ছে…</div>
          )}

          {state === 'generating' && (
            <div className="flex flex-col items-center gap-3">
              <RefreshCw size={40} className="animate-spin text-emerald-600" />
              <p className="text-sm text-slate-600">QR code generate হচ্ছে…</p>
            </div>
          )}

          {state === 'waiting_scan' && (
            <div className="flex flex-col items-center gap-3">
              {qr ? (
                <img src={qr} alt="WhatsApp QR" className="w-48 h-48 rounded-lg border-2 border-emerald-200" />
              ) : (
                <div className="w-48 h-48 rounded-lg bg-slate-100 flex items-center justify-center">
                  <RefreshCw size={30} className="animate-spin text-slate-400" />
                </div>
              )}
              <p className="text-sm font-medium text-slate-700">
                WhatsApp এ QR scan করুন
              </p>
              <p className="text-xs text-slate-500">
                WhatsApp → Settings → Linked Devices → Link a Device
              </p>
              <button
                onClick={startQR}
                className="mt-2 text-xs text-emerald-600 underline"
              >
                QR refresh করুন
              </button>
            </div>
          )}

          {state === 'connected' && (
            <div className="flex flex-col items-center gap-3">
              <CheckCircle2 size={48} className="text-emerald-500" />
              <p className="text-sm font-medium text-emerald-700">{msg}</p>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center gap-3">
              <AlertCircle size={48} className="text-red-400" />
              <p className="text-sm text-red-600">{msg}</p>
              <button
                onClick={startQR}
                className="mt-2 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700"
              >
                আবার চেষ্টা করুন
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
