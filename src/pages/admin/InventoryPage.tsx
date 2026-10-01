import { useEffect, useMemo, useState } from 'react';
import { SectionHeader, StatusPill, NameWithAvatar } from '../../components/admin/ui';

const auth = () => ({ 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` });
// Button-level RBAC: hide actions the user may not perform (backend still enforces).
// super_admin/admin pass; empty perms array (legacy) => show (route gate still applies).
const can = (p: string, ...alt: string[]): boolean => {
  try {
    const u = JSON.parse(localStorage.getItem('bunon_user') || '{}');
    if (u.role === 'super_admin' || u.role === 'admin') return true;
    const perms: string[] = Array.isArray(u.permissions) ? u.permissions : [];
    if (perms.length === 0) return true;
    return perms.includes(p) || alt.some((a) => perms.includes(a));
  } catch { return true; }
};
const authJ = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` });
const num = (v: any) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const today = () => new Date().toISOString().slice(0, 10);
type Row = { id: number; name: string; sku: string; sell_price: number; todayQty: number; saleQty: number };

export default function InventoryPage() {
  const [low, setLow] = useState<any[]>([]);
  const [logs, setLogs] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [grid, setGrid] = useState<Row[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [date, setDate] = useState(today());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // add/move forms
  const [np, setNp] = useState({ name: '', sku: '', price: '', opening: '' });
  const [mv, setMv] = useState({ sku: '', qty: '', type: 'out' });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [l, g, gr, h, a] = await Promise.all([
        fetch('/api/admin/inventory/low', { headers: auth() }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/inventory/logs', { headers: auth() }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/inventory/grid', { headers: auth() }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/inventory/history', { headers: auth() }).then(r => r.json()).catch(() => ({})),
        fetch('/api/admin/inventory/alerts?threshold=10', { headers: auth() }).then(r => r.json()).catch(() => ({})),
      ]);
      setLow(Array.isArray(l.low_stock) ? l.low_stock : []);
      setLogs(Array.isArray(g.logs) ? g.logs : []);
      setGrid(((gr.items || []) as any[]).map((p: any) => ({ id: p.id, name: p.name, sku: p.sku, sell_price: num(p.sell_price), todayQty: parseInt(p.current_stock, 10) || 0, saleQty: 0 })));
      setHistory(Array.isArray(h.history) ? h.history : []);
      setAlerts(Array.isArray(a.alerts) ? a.alerts : []);
    } finally { setLoading(false); }
  };
  useEffect(() => { loadAll(); }, []);

  const totals = useMemo(() => {
    let tq = 0, sq = 0, aq = 0, tv = 0, av = 0;
    for (const r of grid) {
      const after = Math.max(0, r.todayQty - Math.min(r.saleQty, r.todayQty));
      tq += r.todayQty; sq += Math.min(r.saleQty, r.todayQty); aq += after;
      tv += r.todayQty * r.sell_price; av += after * r.sell_price;
    }
    return { tq, sq, aq, tv, av };
  }, [grid]);

  const setCell = (id: number, k: 'todayQty' | 'saleQty', v: number) =>
    setGrid(g => g.map(r => r.id === id ? { ...r, [k]: Math.max(0, Math.floor(v) || 0) } : r));

  const bulkSave = async () => {
    if (!grid.length) return alert('No rows to save.');
    setSaving(true);
    try {
      const rows = grid.map(r => {
        const sale = Math.min(r.saleQty, r.todayQty);
        return { id: r.id, today_qty: r.todayQty, sale_qty: sale, after_qty: r.todayQty - sale };
      });
      const res = await fetch('/api/admin/inventory/bulk_update', { method: 'POST', headers: authJ(), body: JSON.stringify({ date, rows }) }).then(r => r.json());
      alert(res.msg || 'Stock updated successfully');
      loadAll();
    } catch { alert('Bulk update failed.'); } finally { setSaving(false); }
  };

  const move = async () => {
    if (!mv.sku.trim() || !mv.qty) return alert('SKU and Qty are required');
    const res = await fetch('/api/admin/inventory/move', { method: 'POST', headers: authJ(), body: JSON.stringify(mv) }).then(r => r.json()).catch(() => ({}));
    alert(res.msg || 'Updated');
    setMv({ sku: '', qty: '', type: 'out' });
    loadAll();
  };

  const addProduct = async () => {
    if (!np.name.trim() || !np.sku.trim()) return alert('Name and SKU are required');
    const res = await fetch('/api/admin/inventory/product', { method: 'POST', headers: authJ(), body: JSON.stringify({ name: np.name, sku: np.sku, price: np.price || 0, opening_stock: np.opening || 0 }) }).then(r => r.json()).catch(() => ({}));
    alert(res.msg || 'Saved');
    setNp({ name: '', sku: '', price: '', opening: '' });
    loadAll();
  };

  const printReport = () => window.print();

  const th = 'px-2 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase border-b';
  const td = 'px-2 py-1.5 text-sm border-b border-gray-100';
  const inp = 'border rounded-lg px-2 py-1.5 text-sm outline-none focus:border-brand-primary';
  const filtered = filter ? logs.filter((l: any) => String(l.product_id ?? '').includes(filter.trim()) || String(l.reason || '').toLowerCase().includes(filter.toLowerCase())) : logs;

  if (loading) return <div className="text-center py-20 animate-pulse">Loading...</div>;

  return (
    <div className="space-y-6 pb-10">
      <SectionHeader title="Inventory" sub="Bulk grid updates, movements, history and low-stock alerts" right={
        <label className="text-xs text-gray-500">Date<br /><input type="date" value={date} onChange={e => setDate(e.target.value)} className={inp} /></label>
      } />

      {alerts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="font-bold text-red-700 text-sm mb-2">⚠️ Low-stock alerts ({alerts.length})</div>
          <div className="flex flex-wrap gap-2">
            {alerts.slice(0, 12).map((a: any, i: number) => (
              <span key={i} className="bg-white border border-red-200 rounded-full px-3 py-1 text-xs font-bold text-red-700">{a.name || a.sku} — {a.qty}</span>
            ))}
            {alerts.length > 12 && <span className="text-xs text-red-500 font-bold">+{alerts.length - 12} more</span>}
          </div>
        </div>
      )}

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-lg font-bold text-brand-navy">Stock grid ({grid.length})</h3>
          <div className="flex gap-2">
            <button onClick={printReport} className="border px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50 shrink-0 whitespace-nowrap">Print</button>
            {can('adjust_inventory') && (<button onClick={bulkSave} disabled={saving} className="bg-brand-primary text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50 shrink-0 whitespace-nowrap">{saving ? 'Saving...' : '✅ Update Stock (All Products)'}</button>)}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
          <table className="w-full min-w-[760px]"><thead><tr><th className={th}>#</th><th className={th}>Name</th><th className={th}>SKU</th><th className={th}>Price</th><th className={th}>Today's stock</th><th className={th}>Sold</th><th className={th}>Remaining</th><th className={th}>Today's value</th><th className={th}>Remaining value</th></tr></thead>
          <tbody>{grid.map((r, i) => {
            const sale = Math.min(r.saleQty, r.todayQty); const after = r.todayQty - sale;
            return (<tr key={r.id}><td className={td}>{i + 1}</td><td className={td}>{r.name}</td><td className={td}>{r.sku}</td>
              <td className={td + ' text-right'}>{r.sell_price.toFixed(2)}</td>
              <td className={td}><input type="number" value={r.todayQty} onChange={e => setCell(r.id, 'todayQty', num(e.target.value))} className={inp + ' w-20 text-right'} /></td>
              <td className={td}><input type="number" value={r.saleQty} onChange={e => setCell(r.id, 'saleQty', num(e.target.value))} className={inp + ' w-20 text-right'} /></td>
              <td className={td + ' text-right font-bold'}>{after}</td>
              <td className={td + ' text-right'}>{(r.todayQty * r.sell_price).toFixed(2)}</td>
              <td className={td + ' text-right'}>{(after * r.sell_price).toFixed(2)}</td></tr>);
          })}
          {grid.length === 0 && <tr><td colSpan={9} className="text-center text-gray-400 py-6 text-sm">No stock found</td></tr>}</tbody>
          {grid.length > 0 && <tfoot><tr className="font-bold text-sm bg-gray-50"><td colSpan={4} className="px-2 py-2">Total</td><td className="px-2 py-2">{totals.tq}</td><td className="px-2 py-2">{totals.sq}</td><td className="px-2 py-2">{totals.aq}</td><td className="px-2 py-2">{totals.tv.toFixed(2)}</td><td className="px-2 py-2">{totals.av.toFixed(2)}</td></tr></tfoot>}</table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-brand-navy mb-3">Add Product</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input value={np.name} onChange={e => setNp({ ...np, name: e.target.value })} placeholder="Name" className={inp} />
            <input value={np.sku} onChange={e => setNp({ ...np, sku: e.target.value })} placeholder="SKU" className={inp} />
            <input value={np.price} onChange={e => setNp({ ...np, price: e.target.value })} placeholder="Price" className={inp} />
            <input value={np.opening} onChange={e => setNp({ ...np, opening: e.target.value })} placeholder="Opening stock" className={inp} />
          </div>
          {can('adjust_inventory', 'create_products') && (<button onClick={addProduct} className="mt-3 w-full bg-brand-primary text-white px-4 py-2 rounded-xl text-sm font-bold">Save</button>)}
        </div>
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-brand-navy mb-3">Stock Move (IN/OUT/RETURN)</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input value={mv.sku} onChange={e => setMv({ ...mv, sku: e.target.value })} placeholder="SKU" className={inp} />
            <input value={mv.qty} onChange={e => setMv({ ...mv, qty: e.target.value })} placeholder="Qty" className={inp} />
            <select value={mv.type} onChange={e => setMv({ ...mv, type: e.target.value })} className={inp}><option value="in">IN</option><option value="out">OUT</option><option value="return">RETURN</option></select>
          </div>
          {can('adjust_inventory') && (<button onClick={move} className="mt-3 w-full border px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50">Update</button>)}
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-brand-navy mb-4">Low Stock ({low.length})</h3>
        <div className="overflow-x-auto"><table className="w-full"><thead><tr><th className={th}>Product</th><th className={th}>SKU</th><th className={th}>Stock</th><th className={th}>Status</th></tr></thead>
        <tbody>{low.map((p: any, i: number) => (<tr key={p.id ?? i}><td className={td}>{p.name || ('#' + p.id)}</td><td className={td}>{p.sku || '-'}</td><td className={td}><span className="text-red-600 font-bold">{p.stock_quantity ?? 0}</span></td><td className={td}><StatusPill status={p.stock_status || '-'} /></td></tr>))}
        {low.length === 0 && <tr><td colSpan={4} className="text-center text-gray-400 py-6 text-sm">All stock levels OK</td></tr>}</tbody></table></div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-brand-navy mb-4">Movement History ({history.length})</h3>
        <div className="overflow-x-auto max-h-72 overflow-y-auto"><table className="w-full"><thead><tr><th className={th}>Name</th><th className={th}>SKU</th><th className={th}>Type</th><th className={th}>Qty</th><th className={th}>By</th><th className={th}>Date</th></tr></thead>
        <tbody>{history.map((r: any, i: number) => (<tr key={r.id ?? i}><td className={td}>{r.name}</td><td className={td}>{r.sku}</td><td className={td}><StatusPill status={r.move_type} /></td><td className={td + ' text-right'}>{r.qty}</td><td className={td}><NameWithAvatar name={r.created_by} /></td><td className={td}>{String(r.created_at || '').slice(0, 16).replace('T', ' ')}</td></tr>))}
        {history.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6 text-sm">No history</td></tr>}</tbody></table></div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-lg font-bold text-brand-navy">Stock Log</h3>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Product ID / reason..." className={inp} />
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto"><table className="w-full"><thead><tr><th className={th}>Date</th><th className={th}>Product</th><th className={th}>Change</th><th className={th}>Reason</th></tr></thead>
        <tbody>{filtered.map((l: any, i: number) => (<tr key={l.id ?? i}><td className={td}>{(l.created_at || '').toString().slice(0, 16).replace('T', ' ')}</td><td className={td}>{'#' + l.product_id} <span className="text-gray-400 text-xs">({l.old_qty ?? '-'} → {l.new_qty ?? '-'})</span></td><td className={td}>{l.delta ?? '-'}</td><td className={td}>{l.reason || '-'}</td></tr>))}
        {filtered.length === 0 && <tr><td colSpan={4} className="text-center text-gray-400 py-6 text-sm">No logs found</td></tr>}</tbody></table></div>
      </div>
    </div>
  );
}
