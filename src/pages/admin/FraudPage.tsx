import { useState } from 'react';
import { ShieldCheck, Search } from 'lucide-react';
import { PageHeader, Button, Card, Badge } from '../../components/admin/ux';

const auth = () => ({ 'Authorization': 'Bearer ' + String(localStorage.getItem('bunon_token') || '') });

/**
 * Courier-level fraud lookup for a phone number.
 *
 * The endpoint proxies a courier plugin (Hoorin) plus a Steadfast score. Both are
 * read-only lookups — nothing is booked or sent.
 */
export default function FraudPage() {
  const [phone, setPhone] = useState('');
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const check = async () => {
    const p = phone.replace(/\D+/g, '');
    if (p.length < 6) { setErr('Enter a valid phone number'); return; }
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch(`/api/admin/fraud/check?phone=${encodeURIComponent(p)}`, { headers: auth() });
      const d = await r.json();
      if (d.ok) setRes(d);
      else setErr(d.msg || 'Lookup failed');
    } catch { setErr('Network error'); }
    finally { setBusy(false); }
  };

  const riskTone = (risk: string) =>
    risk === 'high' ? 'red' : risk === 'medium' ? 'amber' : risk === 'low' ? 'green' : 'slate';

  const overall = res?.overall || {};
  const perCourier = res?.perCourier || [];

  return (
    <div>
      <PageHeader
        title="Fraud Check"
        subtitle="Courier delivery history for a customer phone number"
        icon={<ShieldCheck size={20} />}
      />

      <Card className="p-4 mb-4">
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              value={phone}
              onChange={e => setPhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && check()}
              placeholder="01XXXXXXXXX"
              inputMode="numeric"
              aria-label="Phone number"
              className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-brand-primary"
            />
          </div>
          <Button variant="primary" onClick={check} disabled={busy}>{busy ? 'Checking…' : 'Check'}</Button>
        </div>
      </Card>

      {err && <p className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-3">{err}</p>}

      {res && (
        <div className="space-y-3">
          <Card className="p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">Risk</p>
                <p className="text-xl font-black text-slate-800">{res.phone}</p>
              </div>
              <Badge tone={riskTone(String(res.risk || 'unknown'))}>{String(res.risk || 'unknown').toUpperCase()}</Badge>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <div><p className="text-[11px] uppercase text-slate-400">Total parcels</p><p className="text-lg font-black">{overall.total ?? 0}</p></div>
              <div><p className="text-[11px] uppercase text-slate-400">Delivered</p><p className="text-lg font-black text-emerald-600">{overall.delivered ?? 0}</p></div>
              <div><p className="text-[11px] uppercase text-slate-400">Success rate</p><p className="text-lg font-black">{res.success_pct ?? 0}%</p></div>
              <div><p className="text-[11px] uppercase text-slate-400">Steadfast score</p><p className="text-lg font-black">{res.steadfast_score ?? '—'}</p></div>
            </div>
          </Card>

          {perCourier.length > 0 && (
            <Card className="p-4">
              <p className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold mb-3">Per courier</p>
              <div className="space-y-2">
                {perCourier.map((c: any, i: number) => (
                  <div key={i} className="flex items-center justify-between gap-3 text-sm border-b border-slate-100 last:border-0 pb-2 last:pb-0">
                    <span className="font-semibold text-slate-700">{c.name || c.courier || 'Courier'}</span>
                    <span className="text-xs text-slate-500">
                      {c.total ?? 0} parcels · {c.delivered ?? 0} delivered · {c.success_pct ?? 0}%
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {!res && !err && (
        <Card className="p-6 text-center text-slate-400">
          <ShieldCheck size={32} className="mx-auto mb-2" />
          <p className="text-sm font-medium">Enter a phone number to check courier delivery history</p>
        </Card>
      )}
    </div>
  );
}