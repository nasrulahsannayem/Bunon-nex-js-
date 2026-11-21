import { useEffect, useState } from 'react';
import { Plus, Trash2, Palette, Ruler, Scissors } from 'lucide-react';

const field = 'w-full min-w-0 border rounded-lg p-2 text-base sm:text-sm';

/* Product variants in the admin modal.
 *
 * A product can now carry real options - colours with their own swatch and
 * image, sizes with their own stock - each with its own price. Before this
 * every saree was one price and one stock count, which is why sold-out
 * combinations could not be expressed at all.
 *
 * The parent product's stock is kept in sync by the API, so this panel only has
 * to present the options.
 */

const TYPES = [
  { key: 'color', label: 'Colour', icon: Palette, ph: 'লাল' },
  { key: 'size', label: 'Size', icon: Ruler, ph: 'M' },
  { key: 'style', label: 'Style', icon: Scissors, ph: 'জামদানি' },
];

type Variant = {
  id: number; variant_type: string; label: string; option_value: string;
  sku: string | null; price: number | null; regular_price: number | null;
  sale_price: number | null;
  /** null means unlimited / not tracked -- stock is optional on an option */
  stock_quantity: number | null;
  stock_status: string;
  image: string | null; swatch: string | null;
};

type Group = { id: number; variant_type: string; label: string };

const empty = {
  variant_type: 'color', label: '', option_value: '', sku: '',
  price: '', regular_price: '', sale_price: '', stock_quantity: '',
  stock_status: 'instock', swatch: '#ffffff', image: '',
};

export default function VariantEditor({ productId, basePrice }: { productId: number; basePrice: number }) {
  const [groups, setGroups] = useState<Group[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ ...empty });
  const [open, setOpen] = useState(false);

  const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('bunon_token')}` });
  const jh = () => ({ ...auth(), 'Content-Type': 'application/json' });

  const load = async () => {
    try {
      const r = await fetch(`/api/admin/products/${productId}/variants`, { headers: auth() });
      const d = await r.json();
      if (d.ok) { setGroups(d.groups || []); setVariants(d.variants || []); }
      else setMsg(d.msg || 'Could not load variants');
    } catch { setMsg('Network error'); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [productId]);

  const add = async () => {
    if (!form.option_value.trim()) return setMsg('Option value required');
    setBusy(true); setMsg('');
    try {
      const r = await fetch(`/api/admin/products/${productId}/variants`, {
        method: 'POST', headers: jh(), body: JSON.stringify(form),
      });
      const d = await r.json();
      if (d.ok) { setForm({ ...empty, variant_type: form.variant_type }); await load(); }
      else setMsg(d.msg || 'Could not add');
    } catch { setMsg('Network error'); }
    finally { setBusy(false); }
  };

  const patch = async (v: Variant, fieldName: string, value: any) => {
    setVariants((vs) => vs.map((x) => (x.id === v.id ? { ...x, [fieldName]: value } : x)));
    try {
      await fetch(`/api/admin/products/${productId}/variants/${v.id}`, {
        method: 'PUT', headers: jh(), body: JSON.stringify({ [fieldName]: value }),
      });
      await load(); // re-read so the parent stock refresh lands in the table
    } catch { setMsg('Network error'); }
  };

  const del = async (v: Variant) => {
    if (!confirm(`Remove "${v.option_value}"?`)) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/products/${productId}/variants/${v.id}`, { method: 'DELETE', headers: auth() });
      const d = await r.json();
      if (d.ok) await load(); else setMsg(d.msg || 'Could not remove');
    } catch { setMsg('Network error'); }
    finally { setBusy(false); }
  };

  const byType = (t: string) => variants.filter((v) => v.variant_type === t);
  /* Stock is optional: any active option with no number means unlimited. */
  const active = variants.filter((v) => v.status);
  const anyUnlimited = active.some(
    (v) => v.stock_quantity === '' || v.stock_quantity == null,
  );
  const totalStock = active.reduce(
    (a, v) => a + Number(v.stock_quantity || 0),
    0,
  );

  return (
    <div className="rounded-xl border border-slate-200 p-3 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-700">
          Colour / Size / Variant
        </span>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="text-[11px] px-2 py-1 rounded-lg bg-slate-800 text-white hover:bg-slate-900"
        >
          {open ? 'Close' : '+ Add option'}
        </button>
      </div>

      {variants.length > 0 && (
        <p className="text-[11px] text-slate-500">
          {variants.length} option{variants.length === 1 ? '' : 's'} ·{' '}
          {anyUnlimited ? (
            <strong className="text-emerald-700">stock অসীম</strong>
          ) : (
            <>মোট stock <strong className="text-slate-800">{totalStock}</strong></>
          )}{' '}
          · product stock এই যোগের সাথে sync হচ্ছে
        </p>
      )}

      {open && (
        <div className="rounded-lg bg-slate-50 p-3 space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">ধরন</span>
              <select className={field} value={form.variant_type} onChange={(e) => setForm({ ...form, variant_type: e.target.value, label: form.label })}>
                {TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">নাম (ঐচ্ছিক)</span>
              <input className={field} placeholder="Colour / Size" value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })} />
            </label>
          </div>

          <label className="block">
            <span className="block text-[11px] font-semibold text-slate-600 mb-1">
              অপশনের নাম <span className="text-red-500">*</span>
            </span>
            <input className={field}
              placeholder={TYPES.find((t) => t.key === form.variant_type)?.ph || 'option'}
              value={form.option_value}
              onChange={(e) => setForm({ ...form, option_value: e.target.value })} />
          </label>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">দাম</span>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm">৳</span>
                <input type="number" className={field + ' pl-6'} placeholder={String(basePrice || 'inherit')}
                  value={form.price}
                  onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <span className="block text-[10px] text-slate-400 mt-1">খালি = product-এর দাম</span>
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">আগের দাম</span>
              <input type="number" className={field} value={form.regular_price}
                onChange={(e) => setForm({ ...form, regular_price: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">ছাড়ের দাম</span>
              <input type="number" className={field} value={form.sale_price}
                onChange={(e) => setForm({ ...form, sale_price: e.target.value })} />
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">
                Stock <span className="font-normal text-slate-400">(খালি = অসীম)</span>
              </span>
              <input type="number" min={0} className={field} value={form.stock_quantity}
                placeholder="খালি রাখলে অসীম"
                onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} />
            </label>
            <label className="block">
              <span className="block text-[11px] font-semibold text-slate-600 mb-1">SKU</span>
              <input className={field} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </label>
            {form.variant_type === 'color' && (
              <label className="block">
                <span className="block text-[11px] font-semibold text-slate-600 mb-1">Colour</span>
                <input type="color" className={field + ' p-1 h-10'} value={form.swatch}
                  onChange={(e) => setForm({ ...form, swatch: e.target.value })} />
              </label>
            )}
          </div>

          <button type="button" onClick={add} disabled={busy}
            className="w-full bg-slate-800 text-white rounded-lg py-2 text-sm font-semibold hover:bg-slate-900 disabled:opacity-50">
            {busy ? 'Saving…' : 'Add option'}
          </button>
        </div>
      )}

      {groups.length === 0 && !open && (
        <p className="text-[11px] text-slate-400">
          এখনো কোনো option নেই — শুধু একটি দাম ও stock।
        </p>
      )}

      {groups.map((g) => {
        const rows = byType(g.variant_type);
        if (!rows.length) return null;
        return (
          <div key={g.id} className="space-y-2">
            <p className="text-[11px] font-bold text-slate-600">{g.label || g.variant_type}</p>
            {rows.map((v) => (
              <div key={v.id} className="rounded-lg border border-slate-100 p-2 space-y-2">
                <div className="flex items-center gap-2">
                  {v.swatch && <span className="w-5 h-5 rounded-full border border-slate-300 shrink-0" style={{ background: v.swatch }} />}
                  <span className="font-semibold text-sm text-slate-800 flex-1 min-w-0 truncate">{v.option_value}</span>
                  <input
                    type="number" className="w-20 border rounded-lg p-1 text-sm text-center"
                    value={v.stock_quantity ?? ''}
                    placeholder="অসীম"
                    onChange={(e) => patch(v, 'stock_quantity', e.target.value)}
                    title="Stock (খালি = অসীম)"
                  />
                  <button type="button" onClick={() => del(v)} title="Remove"
                    className="p-1.5 rounded-lg hover:bg-red-50 text-red-600 shrink-0">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-3">
                  <label className="block">
                    <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">দাম</span>
                    <input type="number" className={field + ' p-1.5 text-sm'} value={v.price ?? ''}
                      onChange={(e) => patch(v, 'price', e.target.value === '' ? null : e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">SKU</span>
                    <input className={field + ' p-1.5 text-sm'} value={v.sku ?? ''}
                      onChange={(e) => patch(v, 'sku', e.target.value)} />
                  </label>
                  <label className="block">
                    <span className="block text-[10px] font-semibold text-slate-500 mb-0.5">Status</span>
                    <select className={field + ' p-1.5 text-sm'} value={v.stock_status}
                      onChange={(e) => patch(v, 'stock_status', e.target.value)}>
                      <option value="instock">In stock</option>
                      <option value="outofstock">Out of stock</option>
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>
        );
      })}

      {msg && <p className="text-[11px] text-red-600 whitespace-pre-wrap">{msg}</p>}
    </div>
  );
}