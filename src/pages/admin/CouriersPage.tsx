import { useEffect, useState } from 'react';
import { Truck, Search, PackagePlus } from 'lucide-react';
import { PageHeader, Button, Card, Tabs, EmptyState } from '../../components/admin/ux';

const auth = () => ({ 'Authorization': 'Bearer ' + String(localStorage.getItem('bunon_token') || '') });
const jh = () => ({ ...auth(), 'Content-Type': 'application/json' });
const API = '/api/admin/couriers';

/**
 * Courier operations for the Steadfast / Pathao / RedX integrations.
 *
 * This backend already existed and was fully mounted but had no UI, so staff
 * could only reach it with curl. Booking is destructive (it calls the courier's
 * real API) so it lives behind an explicit confirm sheet.
 */
export default function CouriersPage() {
  const [tab, setTab] = useState('status');
  const [status, setStatus] = useState<any>(null);
  const [statusErr, setStatusErr] = useState('');
  const [tracking, setTracking] = useState('');
  const [trackResult, setTrackResult] = useState<any>(null);
  const [trackErr, setTrackErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [booking, setBooking] = useState(false);
  const [bookMsg, setBookMsg] = useState('');
  const [order, setOrder] = useState({ invoice: '', recipient_name: '', recipient_phone: '', recipient_address: '', recipient_city: '', amount: '', remark: '' });

  const loadStatus = () => {
    setStatusErr('');
    fetch(`${API}/status`, { headers: auth() })
      .then(r => r.json())
      .then(d => { if (d.ok) setStatus(d); else setStatusErr(d.msg || 'Could not read courier status'); })
      .catch(() => setStatusErr('Network error'));
  };
  useEffect(loadStatus, []);

  const track = async () => {
    if (!tracking.trim()) return;
    setBusy(true); setTrackErr(''); setTrackResult(null);
    try {
      const term = tracking.trim();
      const r = await fetch(`${API}/steadfast/status-by-invoice/${encodeURIComponent(term)}`, { headers: auth() });
      const d = await r.json();
      if (d.ok) setTrackResult(d);
      else setTrackErr(d.msg || 'Not found');
    } catch { setTrackErr('Network error'); }
    finally { setBusy(false); }
  };

  const bookOrder = async () => {
    if (!order.invoice || !order.recipient_name || !order.recipient_phone) {
      setBookMsg('Invoice, recipient name and phone are required');
      return;
    }
    setBusy(true); setBookMsg('');
    try {
      const payload: any = {
        invoice: order.invoice,
        recipient_name: order.recipient_name,
        recipient_phone: order.recipient_phone,
        recipient_address: order.recipient_address,
        recipient_city: order.recipient_city,
        amount: order.amount ? Number(order.amount) : undefined,
        remark: order.remark || undefined,
      };
      const r = await fetch(`${API}/steadfast/create-order`, { method: 'POST', headers: jh(), body: JSON.stringify(payload) });
      const d = await r.json();
      if (d.ok) { setBookMsg(`Booked — consignment ${d.consignment}`); setBooking(false); setOrder({ invoice: '', recipient_name: '', recipient_phone: '', recipient_address: '', recipient_city: '', amount: '', remark: '' }); }
      else setBookMsg(d.msg || 'Booking failed');
    } catch { setBookMsg('Network error'); }
    finally { setBusy(false); }
  };

  const providers = [
    { key: 'steadfast', label: 'Steadfast', on: !!status?.steadfast },
    { key: 'pathao', label: 'Pathao', on: !!status?.pathao },
    { key: 'redx', label: 'RedX', on: !!status?.redx },
  ];

  return (
    <div>
      <PageHeader
        title="Couriers"
        subtitle="Steadfast, Pathao and RedX integration"
        icon={<Truck size={20} />}
        actions={<Button onClick={loadStatus}>Refresh status</Button>}
      />

      <Tabs
        tabs={[{ key: 'status', label: 'Status' }, { key: 'track', label: 'Track parcel' }, { key: 'book', label: 'Book parcel' }]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'status' && (
        <>
          {statusErr && <p className="bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl mb-3">{statusErr}</p>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {providers.map(p => (
              <Card key={p.key} className="p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">{p.label}</span>
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${p.on ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {p.on ? 'Connected' : 'Not configured'}
                  </span>
                </div>
                <div className={`mt-3 h-1.5 rounded-full ${p.on ? 'bg-emerald-500' : 'bg-slate-200'}`} />
              </Card>
            ))}
          </div>
          <p className="text-xs text-slate-500 mt-3">
            A provider shows <b>Connected</b> only when its API credentials are stored. Webhooks and bulk
            booking endpoints are live on the backend.
          </p>
        </>
      )}

      {tab === 'track' && (
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                value={tracking}
                onChange={e => setTracking(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && track()}
                placeholder="Invoice number or consignment ID"
                aria-label="Tracking reference"
                className="w-full border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-brand-primary"
              />
            </div>
            <Button variant="primary" onClick={track} disabled={busy}>{busy ? 'Checking…' : 'Track'}</Button>
          </div>

          {trackErr && <p className="mt-3 bg-red-50 text-red-700 text-sm px-4 py-3 rounded-xl">{trackErr}</p>}

          {trackResult && (
            <div className="mt-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">Raw courier response</p>
              <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-xl p-3 overflow-x-auto admin-scroll-x max-h-80">
{JSON.stringify(trackResult, null, 2)}
              </pre>
            </div>
          )}

          {!trackResult && !trackErr && <div className="mt-4"><EmptyState message="Enter an invoice or consignment ID to see live courier status" icon={<Truck size={30} />} /></div>}
        </Card>
      )}

      {tab === 'book' && (
        <Card className="p-4">
          <p className="text-sm text-slate-600 mb-3">
            Booking calls the courier's live API and creates a real parcel. Check the recipient details first.
          </p>
          {!booking ? (
            <Button variant="primary" onClick={() => { setBookMsg(''); setBooking(true); }}>
              <PackagePlus size={16} /> Book a parcel
            </Button>
          ) : (
            <div className="space-y-3">
              {bookMsg && (
                <p className={`text-sm px-4 py-3 rounded-xl ${bookMsg.startsWith('Booked') ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{bookMsg}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-primary" placeholder="Invoice * (your order id)" value={order.invoice} onChange={e => setOrder({ ...order, invoice: e.target.value })} />
                <input className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-primary" placeholder="Amount (৳)" type="number" value={order.amount} onChange={e => setOrder({ ...order, amount: e.target.value })} />
                <input className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-primary" placeholder="Recipient name *" value={order.recipient_name} onChange={e => setOrder({ ...order, recipient_name: e.target.value })} />
                <input className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-primary" placeholder="Recipient phone *" value={order.recipient_phone} onChange={e => setOrder({ ...order, recipient_phone: e.target.value })} />
                <input className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-primary sm:col-span-2" placeholder="Recipient address" value={order.recipient_address} onChange={e => setOrder({ ...order, recipient_address: e.target.value })} />
                <input className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-primary" placeholder="Recipient city" value={order.recipient_city} onChange={e => setOrder({ ...order, recipient_city: e.target.value })} />
                <input className="border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-brand-primary" placeholder="Remark" value={order.remark} onChange={e => setOrder({ ...order, remark: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <Button variant="primary" onClick={bookOrder} disabled={busy} className="flex-1">{busy ? 'Booking…' : 'Confirm booking'}</Button>
                <Button onClick={() => setBooking(false)}>Cancel</Button>
              </div>
            </div>
          )}
        </Card>
      )}

    </div>
  );
}