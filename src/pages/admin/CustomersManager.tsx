import { useEffect, useState } from 'react';
import { Search, History, StickyNote, X } from 'lucide-react';
import { SectionHeader, NameWithAvatar, StatusPill } from '../../components/admin/ui';

const auth = () => ({ 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` });
const jheaders = () => ({ ...auth(), 'Content-Type': 'application/json' });

export default function CustomersManager() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [minOrders, setMinOrders] = useState('');
  const [minSpent, setMinSpent] = useState('');
  const [hist, setHist] = useState<any | null>(null);
  const [histOpen, setHistOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const [notePhone, setNotePhone] = useState('');
  const [note, setNote] = useState('');

  const load = () => {
    setLoading(true);
    const q = new URLSearchParams();
    if (search) q.set('search', search);
    if (minOrders) q.set('min_orders', minOrders);
    if (minSpent) q.set('min_spent', minSpent);
    q.set("page", String(page));
    q.set("limit", "20");
    fetch(`/api/admin/customers?${q.toString()}`, { headers: auth() })
      .then(r => r.json()).then(d => { if (d.ok) { setRows(d.customers || []); setPage(d.pagination?.page || 1); setPages(d.pagination?.pages || 1); setTotal(d.pagination?.total || 0); } })
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, [page]);

  const openHistory = async (phone: string) => {
    const r = await fetch(`/api/admin/customers/${encodeURIComponent(phone)}/history`, { headers: auth() });
    const d = await r.json();
    if (d.ok) { setHist(d); setHistOpen(true); } else alert(d.msg || 'Error');
  };
  const openNote = (phone: string) => { setNotePhone(phone); setNote(''); setNoteOpen(true); };
  const saveNote = async () => {
    const r = await fetch(`/api/admin/customers/${encodeURIComponent(notePhone)}/note`, {
      method: 'PUT', headers: jheaders(), body: JSON.stringify({ note })
    });
    const d = await r.json();
    if (d.ok) { setNoteOpen(false); alert('Note saved'); } else alert(d.msg || 'Error');
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="Customer Management" sub={`${total} customers`} />
      <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap gap-3 items-end *:min-w-0">
        <div className="flex items-center gap-2 border rounded-lg px-3 py-2 flex-1 min-w-[200px]">
          <Search size={16} className="text-gray-400" />
          <input className="outline-none w-full text-sm" placeholder="Search name / phone / city" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        </div>
        <input className="border rounded-lg p-2 text-sm w-32 min-w-0" type="number" placeholder="Min orders" value={minOrders} onChange={e => setMinOrders(e.target.value)} />
        <input className="border rounded-lg p-2 text-sm w-36 min-w-0" type="number" placeholder="Min spent (৳)" value={minSpent} onChange={e => setMinSpent(e.target.value)} />
        <button onClick={() => { if (page !== 1) setPage(1); else load(); }} className="bg-brand-primary text-white px-4 py-2 rounded-xl text-sm shrink-0">Filter</button>
      </div>
      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="bg-white rounded-xl shadow overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm [&_td]:align-middle [&_th]:align-middle">
            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10"><tr>
              <th className="p-3 text-left">Name</th><th className="p-3 text-left">Phone</th><th className="p-3 text-left">City</th>
              <th className="p-3 text-left">Orders</th><th className="p-3 text-left">Total spent</th><th className="p-3 text-left">Last order</th><th className="p-3 text-left">Actions</th>
            </tr></thead>
            <tbody>{rows.map(c => (
              <tr key={c.phone} className="border-t">
                <td className="p-3 font-medium"><NameWithAvatar name={c.customer_name} size={24} /></td>
                <td className="p-3">{c.phone}</td>
                <td className="p-3">{c.city || '—'}</td>
                <td className="p-3">{c.order_count}</td>
                <td className="p-3">৳{Number(c.total_spent || 0).toLocaleString()}</td>
                <td className="p-3 text-xs text-gray-500">{c.last_order ? new Date(c.last_order).toLocaleDateString('bn-BD') : '—'}</td>
                <td className="p-3 flex gap-2 items-center flex-wrap">
                  <button onClick={() => openHistory(c.phone)} title="History" className="text-blue-600"><History size={16} /></button>
                  <button onClick={() => openNote(c.phone)} title="Note" className="text-amber-600"><StickyNote size={16} /></button>
                </td>
              </tr>))}
              {rows.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-gray-400">No customers found</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {!loading && pages > 1 && (
        <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
          <span>Total: {total} customers</span>
          <div className="flex items-center gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button>
            <span>Page {page} / {pages}</span>
            <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}
      {histOpen && hist && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-bold">{hist.phone} — Orders History</h2>
              <button onClick={() => setHistOpen(false)}><X size={20} /></button>
            </div>
            <div className="bg-gray-50 rounded-lg p-3 mb-3 text-sm flex flex-wrap gap-6">
              <span>Total orders: <b>{hist.totals?.order_count ?? hist.orders?.length}</b></span>
              <span>Total spent: <b>৳{Number(hist.totals?.total_spent || 0).toLocaleString()}</b></span>
            </div>
            <table className="w-full text-sm"><thead className="bg-gray-50 sticky top-0 z-10"><tr>
              <th className="p-2 text-left">Orders</th><th className="p-2 text-left">Date</th><th className="p-2 text-left">Amount</th><th className="p-2 text-left">Status</th>
            </tr></thead><tbody>{(hist.orders || []).map((o: any) => (
              <tr key={o.id} className="border-t"><td className="p-2">#{o.id}</td>
                <td className="p-2 text-xs">{o.created_at ? new Date(o.created_at).toLocaleDateString('bn-BD') : '—'}</td>
                <td className="p-2">৳{Number(o.total_payable || 0).toLocaleString()}</td>
                <td className="p-2 text-xs"><StatusPill status={o.status} /></td></tr>))}
            </tbody></table>
          </div>
        </div>
      )}
      {noteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-bold">Note — {notePhone}</h2>
              <button onClick={() => setNoteOpen(false)}><X size={20} /></button>
            </div>
            <textarea className="w-full border rounded-lg p-2 text-sm" rows={4} placeholder="Write customer note" value={note} onChange={e => setNote(e.target.value)} />
            <button onClick={saveNote} className="mt-3 w-full bg-brand-primary text-white py-2 rounded-xl">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
