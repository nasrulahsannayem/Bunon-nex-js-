import { useEffect, useState, useRef } from 'react';
import ImagePicker from '../../components/ImagePicker';
import ConfirmModal from '../../components/admin/ConfirmModal';
import { Plus, Edit2, Trash2, Copy, X, Search, Download, Upload, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';

const API = '/api/admin/products';
const CATS_API = '/api/admin/categories';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('bunon_token')}` });
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

const imgVal = (v: any): string => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const s = (v as any).src || (v as any).url || (v as any).image || (v as any).thumbnail;
    if (typeof s === 'string' && s) return s;
  }
  return '';
};

// Admin table thumbnail source. Delegates to the shared bestProductImage() so the
// admin panel resolves images with exactly the same fallback chain as the
// storefront (local /uploads -> images -> thumbnail -> placeholder). Never
// returns '' — an empty string rendered a broken <img> in the table.
const imgSrc = (prod: any): string => bestProductImage(prod);

const EMPTY = { name: '', slug: '', sku: '', price: '', regular_price: '', sale_price: '', stock_quantity: '0', stock_status: 'instock', track_stock: 1, delivery_fee: '', categories: [] as string[], tags: '', images: [] as string[], description: '', short_description: '', status: 'publish', featured: false };

import ProductImage, { bestProductImage, PRODUCT_PLACEHOLDER } from '../../components/ProductImage';
import { SectionHeader, StatusPill } from '../../components/admin/ui';
export default function ProductsManager() {
  const [items, setItems] = useState<any[]>([]);
  const [cats, setCats] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [catF, setCatF] = useState('');
  const [stockF, setStockF] = useState('');
  const [lowCount, setLowCount] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [imgUrl, setImgUrl] = useState('');
  const [importMsg, setImportMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = (page = 1) => {
    setLoading(true);
    const qs = new URLSearchParams({ q, category: catF, stock_status: stockF, page: String(page) });
    fetch(`${API}?${qs}`, { headers: auth() }).then(r => r.json()).then(d => {
      if (d.ok) {
        setItems(d.products || []);
        const total = Number(d.total ?? (d.pagination?.total ?? 0));
        const pg = Number(d.page ?? d.pagination?.page ?? page ?? 1);
        const lim = Number(d.limit ?? d.pagination?.limit ?? 20);
        setPagination({ page: pg, limit: lim, total, totalPages: Math.max(1, Math.ceil(total / lim)) });
        setSelected([]);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  const loadLow = () => fetch(`${API}/low-stock`, { headers: auth() }).then(r => r.json()).then(d => { if (d.ok) setLowCount((d.products || []).length); }).catch(() => {});
  useEffect(() => { fetch(CATS_API, { headers: auth() }).then(r => r.json()).then(d => { if (d.ok) setCats(d.categories || []); }).catch(() => {}); loadLow(); }, []);
  useEffect(() => { const t = setTimeout(() => load(1), 350); return () => clearTimeout(t); }, [q, catF, stockF]);

  const openAdd = () => { setEditing(null); setForm({ ...EMPTY }); setImgUrl(''); setModalOpen(true); };
  const openEdit = async (p: any) => {
    setEditing(p); setImgUrl('');
    try {
      const r = await fetch(`${API}/${p.id}`, { headers: auth() }); const d = await r.json();
      const full = d.ok && d.product ? d.product : p;
      setForm({
        name: full.name || '', slug: full.slug || '', sku: full.sku || '',
        price: String(full.price ?? ''), regular_price: String(full.regular_price ?? ''), sale_price: String(full.sale_price ?? ''),
        stock_quantity: String(full.stock_quantity ?? 0), stock_status: full.stock_status || 'instock',
        track_stock: full.track_stock ?? 1, delivery_fee: full.delivery_fee ?? '',
        categories: Array.isArray(full.categories) ? full.categories.map(String) : [],
        tags: Array.isArray(full.tags) ? full.tags.join(', ') : (full.tags || ''),
        images: (Array.isArray(full.images) && full.images.length) ? full.images : (full.image ? [full.image] : (full.thumbnail ? [full.thumbnail] : (Array.isArray(full.local_images) ? full.local_images : []))),
        description: full.description || '', short_description: full.short_description || '',
        status: full.status || 'publish', featured: !!full.featured,
      });
    } catch { setForm({ ...EMPTY, name: p.name || '' }); }
    setModalOpen(true);
  };

  const toggleCat = (id: string) => setForm(f => ({ ...f, categories: f.categories.includes(id) ? f.categories.filter(c => c !== id) : [...f.categories, id] }));

  const addImgUrl = () => { if (!imgUrl.trim()) return; setForm(f => ({ ...f, images: [...f.images, imgUrl.trim()] })); setImgUrl(''); };
  const rmImg = (i: number) => setForm(f => ({ ...f, images: f.images.filter((_, x) => x !== i) }));

  const save = async () => {
    if (!form.name.trim()) return alert('Enter a name');
    if (!form.price) return alert('Enter a price');
    setSaving(true);
    const body = {
      name: form.name.trim(), slug: form.slug.trim() || undefined, sku: form.sku.trim() || undefined,
      price: Number(form.price), regular_price: form.regular_price ? Number(form.regular_price) : undefined,
      sale_price: form.sale_price ? Number(form.sale_price) : undefined,
      stock_quantity: Number(form.stock_quantity) || 0, stock_status: form.stock_status,
      track_stock: Number(form.track_stock ?? 1), delivery_fee: form.delivery_fee === '' ? null : Number(form.delivery_fee),
      categories: form.categories.map(Number).filter(Boolean),
      tags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      images: form.images, description: form.description, short_description: form.short_description,
      status: form.status, featured: form.featured,
    };
    try {
      const res = editing
        ? await fetch(`${API}/${editing.id}`, { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(API, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await res.json();
      if (d.ok) { setModalOpen(false); load(pagination.page); loadLow(); } else alert(d.msg || 'Save failed');
    } catch { alert('Save failed'); }
    setSaving(false);
  };

  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [delBusy, setDelBusy] = useState(false);
  const del = async () => {
    if (confirmId == null) return;
    setDelBusy(true);
    try {
      const r = await fetch(`${API}/${confirmId}`, { method: 'DELETE', headers: auth() });
      const d = await r.json();
      if (d.ok) { setConfirmId(null); load(pagination.page); loadLow(); } else alert(d.msg || 'Delete failed');
    } catch { alert('Delete failed'); }
    setDelBusy(false);
  };
  const dup = async (id: number) => {
    const r = await fetch(`${API}/${id}/duplicate`, { method: 'POST', headers: auth() });
    const d = await r.json(); if (d.ok) load(pagination.page); else alert(d.msg || 'Duplicate failed');
  };
  const inlineStock = async (id: number, qty: number) => {
    const r = await fetch(`${API.replace('/products', '/products/stock/batch')}`, { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id, qty }] }) });
    const d = await r.json();
    if (d.ok) {
      if (d.skipped) alert(`Untracked items skipped: ${d.skipped} items`);
      else { setItems(it => it.map(p => p.id === id ? { ...p, stock_quantity: qty } : p)); loadLow(); }
    } else alert(d.msg || 'Stock update failed');
  };
  const toggleTrack = async (p: any) => {
    const v = Number(p.track_stock) === 0 ? 1 : 0;
    const r = await fetch(`${API}/${p.id}`, { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ track_stock: v }) });
    const d = await r.json();
    if (d.ok) { setItems(it => it.map(x => x.id === p.id ? { ...x, track_stock: v } : x)); loadLow(); } else alert(d.msg || 'Update failed');
  };
  const updateFee = async (id: number, val: string) => {
    const fee = val === '' ? null : Number(val);
    const r = await fetch(`${API}/${id}`, { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ delivery_fee: fee }) });
    const d = await r.json();
    if (d.ok) setItems(it => it.map(x => x.id === id ? { ...x, delivery_fee: fee } : x)); else alert(d.msg || 'Update failed');
  };

  const [selected, setSelected] = useState<number[]>([]);
  const toggleSel = (id: number) => setSelected(sel => (sel.includes(id) ? sel.filter(x => x !== id) : [...sel, id]));
  const toggleAll = () => setSelected(sel => (sel.length === items.length && items.length ? [] : items.map((pp: any) => pp.id)));
  const bulkDelete = async () => {
    if (!selected.length || !confirm('Delete ' + selected.length + ' products?')) return;
    for (const id of selected) {
      try { await fetch(API + '/' + id, { method: 'DELETE', headers: auth() }); } catch { /* per-item best-effort */ }
    }
    setSelected([]); load(pagination.page); loadLow();
  };
  const bulkStatus = async (status: string) => {
    if (!selected.length) return;
    for (const id of selected) {
      try { await fetch(API + '/' + id, { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) }); } catch { /* per-item best-effort */ }
    }
    setSelected([]); load(pagination.page);
  };
  const doExport = async () => {
    try {
      const r = await fetch(API + '/export', { headers: auth() });
      if (!r.ok) return alert('Export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'products.csv'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch { alert('Export failed'); }
  };
  const [importErrs, setImportErrs] = useState<any[]>([]);
  const doImport = async (f: File) => {
    setImportMsg('আপলোড হচ্ছে...');
    setImportErrs([]);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const r = await fetch(API + '/import', { method: 'POST', headers: { ...auth() }, body: fd });
      const d = await r.json();
      setImportMsg(d.ok ? ('✅ সফল: নতুন ' + (d.created ?? 0) + ', আপডেট ' + (d.updated ?? 0) + (d.errors?.length ? ' (এরর: ' + d.errors.length + ')' : '')) : ('❌ ' + (d.msg || 'Import failed')));
      if (d.ok && Array.isArray(d.errors) && d.errors.length) setImportErrs(d.errors.slice(0, 8));
      if (d.ok) { load(1); loadLow(); }
    } catch { setImportMsg('❌ Import failed'); }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <SectionHeader title="Product Management" sub="Search, stock and catalogue" right={<>
          {lowCount > 0 && <span className="flex items-center gap-1 bg-amber-100 text-amber-800 text-xs font-medium px-3 py-1.5 rounded-full"><AlertTriangle size={14} /> Low stock: {lowCount}</span>}
          <button onClick={doExport} className="flex items-center gap-1 border px-3 py-2 rounded-xl text-sm shrink-0 whitespace-nowrap"><Download size={16} /> Export CSV</button>
          <label className="flex items-center gap-1 border px-3 py-2 rounded-xl text-sm cursor-pointer shrink-0 whitespace-nowrap"><Upload size={16} /> Import CSV<input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={e => e.target.files?.[0] && doImport(e.target.files[0])} /></label>
          {can('create_products') && (<button onClick={openAdd} className="flex items-center gap-1 bg-brand-primary text-white px-4 py-2 rounded-xl text-sm shrink-0 whitespace-nowrap"><Plus size={16} /> New Product</button>)}
      </>} />

      <div className="flex flex-wrap gap-2 mb-4 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible pb-1 -mx-1 px-1">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-3 text-gray-400" />
          <input className="w-full border rounded-xl pl-9 pr-3 py-2 text-sm" placeholder="Search by name / SKU..." value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <select className="border rounded-xl px-3 py-2 text-sm shrink-0 max-w-[45vw] md:max-w-none truncate" value={catF} onChange={e => setCatF(e.target.value)}>
          <option value="">All categories</option>
          {cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="border rounded-xl px-3 py-2 text-sm shrink-0 max-w-[45vw] md:max-w-none truncate" value={stockF} onChange={e => setStockF(e.target.value)}>
          <option value="">All stock</option>
          <option value="instock">In stock</option>
          <option value="outofstock">Out of stock</option>
          <option value="lowstock">Low stock</option>
          <option value="notrack">Untracked</option>
        </select>
      </div>

      {importMsg && <div className="mb-3 bg-blue-50 border border-blue-200 text-blue-800 text-sm px-4 py-2 rounded-xl">{importMsg}{importErrs.length > 0 && <ul className="mt-1 text-xs list-disc ml-4">{importErrs.map((e: any, i: number) => (<li key={i}>line {e.line}: {e.msg}</li>))}</ul>}</div>}

      {loading ? <p className="text-gray-500">Loading...</p> : (
        <>
          <div className="bg-white rounded-xl shadow overflow-x-auto">
            <table className="w-full text-sm min-w-[900px] [&_td]:align-middle [&_th]:align-middle">
              <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
                <tr><th className="p-3 text-left"><input type="checkbox" checked={items.length > 0 && selected.length === items.length} onChange={toggleAll} title="Select all" /></th><th className="p-3 text-left">Photo</th><th className="p-3 text-left">Name / SKU</th><th className="p-3 text-left">Category</th><th className="p-3 text-left">Price / Sale</th><th className="p-3 text-left">Stock</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Featured</th><th className="p-3 text-left">Actions</th></tr>
              </thead>
              <tbody>
                {items.map((p: any) => (
                  <tr key={p.id} className="border-t hover:bg-gray-50">
                    <td className="p-3"><input type="checkbox" checked={selected.includes(p.id)} onChange={() => toggleSel(p.id)} /></td>
                    <td className="p-3"><ProductImage src={imgSrc(p)} loading="eager" className="w-11 h-11 rounded-lg object-cover" alt={p.name} /></td>
                    <td className="p-3"><div className="font-medium">{p.name}</div><div className="text-xs text-gray-400">{p.sku || `#${p.id}`} · {p.slug}</div></td>
                    <td className="p-3 text-gray-600">{Array.isArray(p.categories) ? p.categories.map((c: any) => typeof c === 'object' ? c.name : c).join(', ') : (p.category || '—')}</td>
                    <td className="p-3"><span className="font-medium">৳{p.price}</span>{p.sale_price ? <span className="ml-1 text-xs text-green-600">Sale ৳{p.sale_price}</span> : null}</td>
                    <td className="p-3">
                      <input type="number" className="w-16 border rounded-lg px-1 py-0.5 text-center" defaultValue={p.stock_quantity ?? 0} key={`${p.id}-${p.stock_quantity}`} onBlur={e => { const v = Number(e.target.value); if (v !== p.stock_quantity) inlineStock(p.id, v); }} />
                      <div className="mt-1">{can('edit_products') && (<button onClick={() => toggleTrack(p)} title="Toggle stock tracking" className={`text-[11px] px-2 py-0.5 rounded-full border ${Number(p.track_stock) === 0 ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-green-50 text-green-700 border-green-200'}`}>{Number(p.track_stock) === 0 ? 'Untracked' : 'Tracked'}</button>)}</div>
                      <input type="number" title="Delivery fee (blank=default)" placeholder="Delivery (blank=default)" className="w-24 border rounded-lg px-1 py-0.5 text-center text-[11px] mt-1" defaultValue={p.delivery_fee ?? ''} key={`${p.id}-fee-${p.delivery_fee ?? 'd'}`} onBlur={e => { const cur = p.delivery_fee ?? ''; if (e.target.value !== String(cur)) updateFee(p.id, e.target.value); }} />
                    </td>
                    <td className="p-3"><StatusPill status={p.status} /></td>
                    <td className="p-3">{p.featured ? '★' : '—'}</td>
                    <td className="p-3"><div className="flex gap-2 items-center flex-wrap">
                      {can('edit_products') && (<button onClick={() => openEdit(p)} title="Edit" className="text-blue-600"><Edit2 size={16} /></button>)}
                      {can('create_products', 'edit_products') && (<button onClick={() => dup(p.id)} title="Duplicate" className="text-gray-600"><Copy size={16} /></button>)}
                      {can('delete_products') && (<button onClick={() => setConfirmId(p.id)} title="Delete" className="text-red-600"><Trash2 size={16} /></button>)}
                    </div></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-gray-400">No products found</td></tr>}
              </tbody>
            </table>
          </div>
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mt-3 text-sm bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
              <span className="font-medium">{selected.length} selected</span>
              {can('edit_products') && (<button onClick={() => bulkStatus('publish')} className="border rounded-lg px-3 py-1 bg-white">Publish</button>)}
              {can('edit_products') && (<button onClick={() => bulkStatus('draft')} className="border rounded-lg px-3 py-1 bg-white">Draft</button>)}
              {can('delete_products') && (<button onClick={bulkDelete} className="border border-red-300 text-red-600 rounded-lg px-3 py-1 bg-white">Delete</button>)}
              <button onClick={() => setSelected([])} className="text-gray-500 px-2 py-1">Clear</button>
            </div>
          )}
          <div className="flex items-center justify-between mt-3 text-sm text-gray-600">
            <span>Total {pagination.total} items · Page {pagination.page}/{pagination.totalPages}</span>
            <div className="flex gap-2">
              <button disabled={pagination.page <= 1} onClick={() => load(pagination.page - 1)} className="border rounded-lg p-2 disabled:opacity-40"><ChevronLeft size={16} /></button>
              <button disabled={pagination.page >= pagination.totalPages} onClick={() => load(pagination.page + 1)} className="border rounded-lg p-2 disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        </>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl w-full max-w-3xl p-6 my-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editing ? 'Edit' : 'New'} Product</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="grid md:grid-cols-2 gap-3 items-start">
              <input className="border rounded-lg p-2" placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className="border rounded-lg p-2" placeholder="Slug (blank = auto)" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
              <input className="border rounded-lg p-2" placeholder="SKU" value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} />
              <input className="border rounded-lg p-2" placeholder="Tags (comma separated)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
              <input type="number" className="border rounded-lg p-2" placeholder="Price *" value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
              <input type="number" className="border rounded-lg p-2" placeholder="Regular price" value={form.regular_price} onChange={e => setForm({ ...form, regular_price: e.target.value })} />
              <input type="number" className="border rounded-lg p-2" placeholder="Sale price" value={form.sale_price} onChange={e => setForm({ ...form, sale_price: e.target.value })} />
              <input type="number" className="border rounded-lg p-2" placeholder="Stock quantity" value={form.stock_quantity} onChange={e => setForm({ ...form, stock_quantity: e.target.value })} />
              <select className="border rounded-lg p-2" value={form.stock_status} onChange={e => setForm({ ...form, stock_status: e.target.value })}>
                <option value="instock">In stock</option><option value="outofstock">Out of stock</option><option value="onbackorder">Backorder</option>
              </select>
              <select className="border rounded-lg p-2" value={String(form.track_stock ?? 1)} onChange={e => setForm({ ...form, track_stock: Number(e.target.value) })}>
                <option value="1">Track (count stock)</option><option value="0">Untracked (unlimited)</option>
              </select>
              <input type="number" className="border rounded-lg p-2" placeholder="Delivery fee (blank=default)" value={form.delivery_fee} onChange={e => setForm({ ...form, delivery_fee: e.target.value })} />
              <select className="border rounded-lg p-2" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="publish">Published</option><option value="draft">Draft</option><option value="private">Private</option>
              </select>
              <textarea className="border rounded-lg p-2 md:col-span-2" rows={2} placeholder="Short description" value={form.short_description} onChange={e => setForm({ ...form, short_description: e.target.value })} />
              <textarea className="border rounded-lg p-2 md:col-span-2" rows={4} placeholder="Full description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              <div className="md:col-span-2 border rounded-lg p-3">
                <p className="text-sm font-medium mb-2">Categories (multiple)</p>
                <div className="flex flex-wrap gap-2">
                  {cats.map((c: any) => (
                    <label key={c.id} className={`text-xs px-3 py-1.5 rounded-full border cursor-pointer ${form.categories.includes(String(c.id)) ? 'bg-brand-primary text-white border-brand-primary' : 'bg-gray-50'}`}>
                      <input type="checkbox" className="hidden" checked={form.categories.includes(String(c.id))} onChange={() => toggleCat(String(c.id))} />{c.name}
                    </label>
                  ))}
                  {cats.length === 0 && <span className="text-xs text-gray-400">Categories not loaded</span>}
                </div>
              </div>
              <div className="md:col-span-2 border rounded-lg p-3">
                <p className="text-sm font-medium mb-2">Photos ({form.images.length})</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {form.images.map((u, i) => (
                    <div key={i} className="relative"><ProductImage src={u} className="w-16 h-16 rounded-lg object-cover border" alt="" />
                      <button onClick={() => rmImg(i)} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5"><X size={12} /></button></div>
                  ))}
                </div>
                <div className="flex gap-2 items-start">
                  <div className="flex-1"><ImagePicker value={imgUrl} onChange={setImgUrl} /></div>
                  <button onClick={addImgUrl} className="border px-3 py-2 rounded-lg text-sm whitespace-nowrap">Add</button>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" checked={form.featured} onChange={e => setForm({ ...form, featured: e.target.checked })} /> Featured product</label>
            </div>
            <button disabled={saving} onClick={save} className="mt-4 w-full bg-brand-primary text-white py-2.5 rounded-xl disabled:opacity-50">{saving ? 'Saving...' : 'Save'}</button>
          </div>
        </div>
      )}
      <ConfirmModal open={confirmId != null} title="Delete Product" message="Permanently delete this product?" onConfirm={del} busy={delBusy} onClose={() => setConfirmId(null)} />
    </div>
  );
}
