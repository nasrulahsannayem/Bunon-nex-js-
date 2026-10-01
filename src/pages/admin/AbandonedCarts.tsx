import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { SectionHeader, StatCard, StatusPill } from '../../components/admin/ui';

const auth = () => ({ 'Authorization': 'Bearer ' + localStorage.getItem('bunon_token') });

export default function AbandonedCarts() {
  const [carts, setCarts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [toast, setToast] = useState('');
  const [channels, setChannels] = useState<Record<number, string>>({});
  const [discounts, setDiscounts] = useState<Record<number, string>>({});

  const load = () => {
    setLoading(true);
    fetch('/api/admin/marketing/abandoned-carts', { headers: auth() })
      .then(res => res.json())
      .then(data => { if (data.ok) setCarts(data.carts); })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const sendRemind = async (id: number) => {
    const channel = channels[id] || 'sms';
    setBusy(id);
    try {
      const r = await fetch('/api/admin/marketing/abandoned-carts/' + id + '/remind', { method: 'POST', headers: Object.assign({}, auth(), { 'Content-Type': 'application/json' }), body: JSON.stringify({ channel }) });
      const d = await r.json();
      setToast(d.ok ? ('Reminder sent' + (d.sent ? ' (' + d.sent + ')' : '')) : (d.msg || 'Error'));
      if (d.ok) load();
    } catch { setToast('Network error'); }
    finally { setBusy(null); }
  };
  const sendOffer = async (id: number) => {
    const discount = Number(discounts[id] || '');
    if (!discount || discount <= 0) { setToast('Enter a discount amount'); return; }
    setBusy(id);
    try {
      const r = await fetch('/api/admin/marketing/abandoned-carts/' + id + '/offer', { method: 'POST', headers: Object.assign({}, auth(), { 'Content-Type': 'application/json' }), body: JSON.stringify({ discount }) });
      const d = await r.json();
      setToast(d.ok ? 'Offer sent' : (d.msg || 'Error'));
      if (d.ok) load();
    } catch { setToast('Network error'); }
    finally { setBusy(null); }
  };

  if (loading) return <div className="text-center py-20 animate-pulse">Loading data...</div>;

  const total = carts.length;
  const pending = carts.filter((c: any) => String(c.status || 'pending').toLowerCase() === 'pending').length;
  const converted = carts.filter((c: any) => String(c.status || '').toLowerCase() === 'converted').length;

  return (
    <div className="space-y-6 pb-10">
      <SectionHeader title="Abandoned Carts (Recovery)" sub="Visitors who shared a phone number at checkout but did not place an order" />
      {toast && <div className="bg-gray-900 text-white text-sm px-4 py-2 rounded-lg">{toast}</div>}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard title="Total Carts" value={total} tone="orders" />
        <StatCard title="Pending Recovery" value={pending} tone="alert" />
        <StatCard title="Converted" value={converted} tone="ret" />
      </div>
      <div className="bg-white shadow-sm rounded-2xl border border-gray-100 overflow-hidden">
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gradient-to-r from-indigo-50 via-blue-50 to-purple-50 border-b border-indigo-100 text-sm text-indigo-800">
                <th className="p-4 font-medium">Customer</th>
                <th className="p-4 font-medium">Contact</th>
                <th className="p-4 font-medium">Pending Cart Items</th>
                <th className="p-4 font-medium">Status</th>
                <th className="p-4 font-medium">Date (Last Updated)</th>
                <th className="p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm">
              {carts.length === 0 && (<tr><td colSpan={6} className="p-8 text-center text-sm text-gray-400">No abandoned carts found</td></tr>)}
              {carts.map((cart, idx) => (
                <motion.tr initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: idx * 0.05 }} key={cart.id} className="hover:bg-gray-50/50">
                  <td className="p-4 font-medium text-gray-900">{cart.customer_name || 'N/A'}</td>
                  <td className="p-4">
                    <div className="font-semibold text-brand-primary">{cart.phone || '-'}</div>
                    <div className="text-gray-500 text-xs">{cart.email && cart.email !== 'N/A' ? cart.email : ''}</div>
                  </td>
                  <td className="p-4">
                    {Array.isArray(cart.cart_data) && cart.cart_data.length > 0 ? (
                      <ul className="list-disc pl-4 text-xs text-gray-600">
                        {(Array.isArray(cart.cart_data) ? cart.cart_data : []).map((item: any, i: number) => (
                          <li key={i}>{item?.name || 'Item'} (Qty: {item?.quantity ?? 1})</li>
                        ))}
                      </ul>
                    ) : (<span className="text-gray-400 text-xs">Empty</span>)}
                  </td>
                  <td className="p-4">
                    <StatusPill status={cart.status || 'pending'} />
                  </td>
                  <td className="p-4 text-gray-500 text-xs">{cart.updated_at ? new Date(cart.updated_at).toLocaleString('en-US', {timeZone: 'Asia/Dhaka'}) : '-'}</td>
                  <td className="p-4">
                    <div className="flex flex-col gap-2">
                      <div className="flex gap-2 items-center">
                        <select value={channels[cart.id] || 'sms'} onChange={e => setChannels(p => ({ ...p, [cart.id]: e.target.value }))} className="border rounded-lg text-xs px-2 py-1.5">
                          <option value="sms">SMS</option>
                          <option value="note">Note</option>
                        </select>
                        <button onClick={() => sendRemind(cart.id)} disabled={busy === cart.id} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs disabled:opacity-50">Remind</button>
                      </div>
                      <div className="flex gap-2 items-center">
                        <input type="number" min="1" placeholder="Discount %" value={discounts[cart.id] || ''} onChange={e => setDiscounts(p => ({ ...p, [cart.id]: e.target.value }))} className="border rounded-lg text-xs px-2 py-1.5 w-20" />
                        <button onClick={() => sendOffer(cart.id)} disabled={busy === cart.id} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs disabled:opacity-50">Send Offer</button>
                      </div>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
