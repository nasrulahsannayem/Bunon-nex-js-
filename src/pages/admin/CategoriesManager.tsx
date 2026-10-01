import { useEffect, useState } from 'react';
import { Trash2, Edit2, Plus, X } from 'lucide-react';
import ImagePicker from '../../components/ImagePicker';
import { SectionHeader, StatusPill } from '../../components/admin/ui';

const API = '/api/admin/categories';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('bunon_token')}` });

export default function CategoriesManager() {
  const [cats, setCats] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ name: '', slug: '', parent_id: '', image: '', description: '', menu_order: '0', status: '1' });

  const load = () => {
    setLoading(true);
    fetch(API, { headers: auth() }).then(r => r.json()).then(d => {
      if (d.ok) setCats(d.categories);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const openAdd = () => { setEditing(null); setForm({ name: '', slug: '', parent_id: '', image: '', description: '', menu_order: '0', status: '1' }); setModalOpen(true); };
  const openEdit = (c: any) => { setEditing(c); setForm({ name: c.name || '', slug: c.slug || '', parent_id: c.parent_id ?? '', image: c.image || '', description: c.description || '', menu_order: String(c.menu_order ?? 0), status: String(c.status ?? 1) }); setModalOpen(true); };

  const save = async () => {
    if (!form.name) return alert('Enter a name');
    const body = {
      name: form.name, slug: form.slug || undefined,
      parent_id: form.parent_id ? Number(form.parent_id) : null,
      image: form.image || null, description: form.description || null,
      menu_order: Number(form.menu_order), status: Number(form.status)
    };
    const res = editing
      ? await fetch(`${API}/${editing.id}`, { method: 'PUT', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      : await fetch(API, { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json();
    if (d.ok) { setModalOpen(false); load(); } else alert(d.msg || 'Error');
  };

  const del = async (id: number) => {
    if (!confirm('Delete?')) return;
    const res = await fetch(`${API}/${id}`, { method: 'DELETE', headers: auth() });
    const d = await res.json();
    if (d.ok) load(); else alert(d.msg || 'Error');
  };

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <SectionHeader title="Category Management" sub="Group products into categories" right={
        <button onClick={openAdd} className="flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-xl shrink-0 whitespace-nowrap">
          <Plus size={18} /> New Category
        </button>
      } />

      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm [&_td]:align-middle [&_th]:align-middle">
            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
              <tr><th className="p-3 text-left">#</th><th className="p-3 text-left">Name</th><th className="p-3 text-left">Slug</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Actions</th></tr>
            </thead>
            <tbody>
              {cats.map(c => (
                <tr key={c.id} className="border-t">
                  <td className="p-3">{c.id}</td>
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-gray-500">{c.slug}</td>
                  <td className="p-3"><StatusPill status={c.status ? 'Active' : 'Inactive'} /></td>
                  <td className="p-3 flex gap-2 items-center flex-wrap">
                    <button onClick={() => openEdit(c)} className="text-blue-600"><Edit2 size={16} /></button>
                    <button onClick={() => del(c.id)} className="text-red-600"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {cats.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-gray-400">No categories found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editing ? 'Edit' : 'New'} Category</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input className="w-full border rounded-lg p-2" placeholder="Name *" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
              <input className="w-full border rounded-lg p-2" placeholder="Slug (leave blank for auto)" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
              <input className="w-full border rounded-lg p-2" placeholder="Parent ID (blank = top level)" value={form.parent_id} onChange={e => setForm({ ...form, parent_id: e.target.value })} />
              <ImagePicker label="Category Image" value={form.image} onChange={v => setForm({ ...form, image: v })} />
              <textarea className="w-full border rounded-lg p-2" placeholder="Description" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              <div className="flex gap-3">
                <input className="w-1/2 border rounded-lg p-2" placeholder="Menu Order" value={form.menu_order} onChange={e => setForm({ ...form, menu_order: e.target.value })} />
                <select className="w-1/2 border rounded-lg p-2" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="1">Active</option><option value="0">Inactive</option>
                </select>
              </div>
            </div>
            <button onClick={save} className="mt-4 w-full bg-brand-primary text-white py-2 rounded-xl">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
