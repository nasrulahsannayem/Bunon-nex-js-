import { useEffect, useState } from 'react';
import { Plus, Edit2, Trash2, X } from 'lucide-react';
import { SectionHeader, StatusPill } from '../../components/admin/ui';

const API = '/api/admin/coupons';
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
const jheaders = () => ({ ...auth(), 'Content-Type': 'application/json' });
const empty = { code: '', type: 'percent', value: '', min_order: '0', usage_limit: '', starts_at: '', ends_at: '', status: 'active', per_user_limit: '' };

export default function CouponsManager() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<any>({ ...empty });
  const [tCode, setTCode] = useState('');
  const [tSub, setTSub] = useState('');
  const [tRes, setTRes] = useState<any>(null);

  const load = () => {
    setLoading(true);
    fetch(API, { headers: auth() }).then(r => r.json()).then(d => {
      if (d.ok) setRows(d.coupons || []);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const openAdd = () => { setEditing(null); setForm({ ...empty }); setModal(true); };
  const openEdit = (c: any) => {
    setEditing(c);
    setForm({ code: c.code || '', type: c.type || 'percent', value: String(c.value ?? ''), min_order: String(c.min_order ?? 0), usage_limit: c.usage_limit ?? '', starts_at: (c.starts_at || '').slice(0, 16), ends_at: (c.ends_at || '').slice(0, 16), status: String(c.status ?? 'active'), per_user_limit: c.per_user_limit ?? '' });
    setModal(true);
  };
  const save = async () => {
    if (!form.code || !form.value) return alert('Enter code and value');
    const body: any = { code: form.code.toUpperCase(), type: form.type === 'fixed' ? 'flat' : form.type, value: Number(form.value), min_order: Number(form.min_order || 0), status: form.status };
    if (form.usage_limit) body.usage_limit = Number(form.usage_limit); if (form.per_user_limit) body.per_user_limit = Number(form.per_user_limit);
    if (form.starts_at) body.starts_at = form.starts_at;
    if (form.ends_at) body.ends_at = form.ends_at;
    const res = editing
      ? await fetch(`${API}/${editing.id}`, { method: 'PUT', headers: jheaders(), body: JSON.stringify(body) })
      : await fetch(API, { method: 'POST', headers: jheaders(), body: JSON.stringify(body) });
    const d = await res.json();
    if (d.ok) { setModal(false); load(); } else alert(d.msg || 'Error');
  };
  const toggle = async (c: any) => {
    const v = String(c.status ?? 'active') === 'active' ? 'inactive' : 'active';
    const r = await fetch(`${API}/${c.id}`, { method: 'PUT', headers: jheaders(), body: JSON.stringify({ status: v }) });
    const d = await r.json();
    if (d.ok) load(); else alert(d.msg || 'Error');
  };
  const del = async (id: number) => {
    if (!confirm('Delete this coupon?')) return;
    const r = await fetch(`${API}/${id}`, { method: 'DELETE', headers: auth() });
    const d = await r.json();
    if (d.ok) load(); else alert(d.msg || 'Error');
  };
  const test = async () => {
    if (!tCode || !tSub) return alert('Enter code and subtotal');
    const r = await fetch(`${API}/validate`, { method: 'POST', headers: jheaders(), body: JSON.stringify({ code: tCode.toUpperCase(), subtotal: Number(tSub) }) });
    setTRes(await r.json());
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <SectionHeader title="Coupon Management" sub="Discount codes and validation" right={
        can('edit_coupons') && (<button onClick={openAdd} className="flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-xl text-sm"><Plus size={16} /> New Coupon</button>)
      } />
      <div className="bg-white rounded-xl shadow p-4 mb-4 flex flex-wrap gap-3 items-end *:min-w-0">
        <div className="flex-1 min-w-[160px]"><label className="text-xs text-gray-500">Coupon code</label>
          <input className="w-full border rounded-lg p-2 text-sm uppercase" placeholder="EID10" value={tCode} onChange={e => setTCode(e.target.value)} /></div>
        <div className="w-40"><label className="text-xs text-gray-500">Subtotal (৳)</label>
          <input className="w-full border rounded-lg p-2 text-sm" type="number" value={tSub} onChange={e => setTSub(e.target.value)} /></div>
        <button onClick={test} className="bg-gray-900 text-white px-4 py-2 rounded-xl text-sm shrink-0">Validate</button>
        {tRes && <div className={`text-sm px-3 py-2 rounded-lg ${tRes.ok ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
          {tRes.ok ? `Discount: ৳${Number(tRes.discount || 0).toLocaleString()} — Total: ৳${Number(tRes.total ?? (Number(tSub) - Number(tRes.discount || 0))).toLocaleString()}` : (tRes.msg || 'Invalid coupon')}
        </div>}
      </div>
      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="bg-white rounded-xl shadow overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm [&_td]:align-middle [&_th]:align-middle"><thead className="bg-gray-50 text-gray-600 sticky top-0 z-10"><tr>
            <th className="p-3 text-left">Code</th><th className="p-3 text-left">Type</th><th className="p-3 text-left">Value</th>
            <th className="p-3 text-left">Minimum</th><th className="p-3 text-left">Usage</th><th className="p-3 text-left">Expiry</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Actions</th>
          </tr></thead><tbody>{rows.map(c => (
            <tr key={c.id} className="border-t">
              <td className="p-3 font-bold">{c.code}</td>
              <td className="p-3">{c.type === 'percent' ? 'Percent' : 'Flat'}</td>
              <td className="p-3">{c.type === 'percent' ? `${c.value}%` : `৳${Number(c.value).toLocaleString()}`}</td>
              <td className="p-3">৳{Number(c.min_order || 0).toLocaleString()}</td>
              <td className="p-3">{c.used_count ?? 0}/{c.usage_limit ?? '∞'}</td>
              <td className="p-3 text-xs text-gray-500">{(c.starts_at || '').slice(0, 10) || '—'} → {(c.ends_at || '').slice(0, 10) || '—'}</td>
              <td className="p-3">{can('edit_coupons') && (<button onClick={() => toggle(c)} title="Toggle status"><StatusPill status={String(c.status ?? 'active') === 'active' ? 'Active' : 'Off'} /></button>)}</td>
              <td className="p-3 flex gap-2 items-center flex-wrap">
                {can('edit_coupons') && (<button onClick={() => openEdit(c)} className="text-blue-600"><Edit2 size={16} /></button>)}
                {can('edit_coupons') && (<button onClick={() => del(c.id)} className="text-red-600"><Trash2 size={16} /></button>)}
              </td>
            </tr>))}
            {rows.length === 0 && <tr><td colSpan={8} className="p-4 text-center text-gray-400">No coupons found</td></tr>}
          </tbody></table>
        </div>
      )}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editing ? 'Edit' : 'New'} Coupon</h2>
              <button onClick={() => setModal(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input className="w-full border rounded-lg p-2 text-sm uppercase" placeholder="Code * (e.g. EID10)" value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} />
              <div className="flex flex-wrap gap-3">
                <select className="w-1/2 border rounded-lg p-2 text-sm" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                  <option value="percent">Percent (%)</option><option value="flat">Flat (৳)</option>
                </select>
                <input className="w-1/2 border rounded-lg p-2 text-sm" type="number" placeholder="Value *" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} />
              </div>
              <div className="flex flex-wrap gap-3">
                <input className="w-1/2 border rounded-lg p-2 text-sm" type="number" placeholder="Min order" value={form.min_order} onChange={e => setForm({ ...form, min_order: e.target.value })} />
                <input className="w-1/2 border rounded-lg p-2 text-sm" type="number" placeholder="Per-user limit (blank = none)" value={form.per_user_limit} onChange={e => setForm({ ...form, per_user_limit: e.target.value })} />
                <input className="w-1/2 border rounded-lg p-2 text-sm" type="number" placeholder="Limit (blank = unlimited)" value={form.usage_limit} onChange={e => setForm({ ...form, usage_limit: e.target.value })} />
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="w-1/2"><label className="text-xs text-gray-500">Start</label>
                  <input type="datetime-local" className="w-full border rounded-lg p-2 text-sm" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })} /></div>
                <div className="w-1/2"><label className="text-xs text-gray-500">End</label>
                  <input type="datetime-local" className="w-full border rounded-lg p-2 text-sm" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })} /></div>
              </div>
              <select className="w-full border rounded-lg p-2 text-sm" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                <option value="active">Active</option><option value="inactive">Off</option>
              </select>
            </div>
            {can('edit_coupons') && (<button onClick={save} className="mt-4 w-full bg-brand-primary text-white py-2 rounded-xl">Save</button>)}
          </div>
        </div>
      )}
    </div>
  );
}
