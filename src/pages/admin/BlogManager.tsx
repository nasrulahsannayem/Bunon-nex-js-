import { useEffect, useState } from 'react';
import { Trash2, Edit2, Plus, X } from 'lucide-react';
import ImagePicker from '../../components/ImagePicker';
import { SectionHeader, StatusPill } from '../../components/admin/ui';

const API = '/api/admin/blogs';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('bunon_token')}` });

export default function BlogManager() {
  const [blogs, setBlogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const pageCount = Math.max(1, Math.ceil(blogs.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const pageBlogs = blogs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState({ title: '', slug: '', excerpt: '', content: '', featured_image: '', author: '', tags: '', status: '0', published_at: '' });

  const load = () => {
    setLoading(true);
    fetch(API, { headers: auth() }).then(r => r.json()).then(d => {
      if (d.ok) setBlogs(d.blogs);
      setLoading(false);
    });
  };
  useEffect(load, []);

  const openAdd = () => { setEditing(null); setForm({ title: '', slug: '', excerpt: '', content: '', featured_image: '', author: '', tags: '', status: '0', published_at: '' }); setModalOpen(true); };
  const openEdit = (b: any) => { setEditing(b); setForm({ title: b.title || '', slug: b.slug || '', excerpt: b.excerpt || '', content: b.content || '', featured_image: b.featured_image || '', author: b.author || '', tags: typeof b.tags === 'string' ? b.tags : (b.tags ? JSON.stringify(b.tags) : ''), status: String(b.status ?? 0), published_at: b.published_at ? b.published_at.slice(0, 16) : '' }); setModalOpen(true); };

  const save = async () => {
    if (!form.title) return alert('Enter a title');
    const body = {
      title: form.title, slug: form.slug.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || undefined, excerpt: form.excerpt || null,
      content: form.content || null, featured_image: form.featured_image || null, author: form.author || null,
      tags: form.tags || null, status: Number(form.status),
      published_at: form.status === '1' ? ((form.published_at ? form.published_at.replace('T', ' ').slice(0, 16) + ':00' : null) || new Date().toISOString().slice(0, 19).replace('T', ' ')) : null
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
      <SectionHeader title="Blog Management" sub="Posts, drafts and publishing" right={
        <button onClick={openAdd} className="flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-xl shrink-0 whitespace-nowrap">
          <Plus size={18} /> New Post
        </button>
      } />

      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm [&_td]:align-middle [&_th]:align-middle">
            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
              <tr><th className="p-3 text-left">#</th><th className="p-3 text-left">Title</th><th className="p-3 text-left">Slug</th><th className="p-3 text-left">Status</th><th className="p-3 text-left">Published</th><th className="p-3 text-left">Actions</th></tr>
            </thead>
            <tbody>
              {pageBlogs.map(b => (
                <tr key={b.id} className="border-t">
                  <td className="p-3">{b.id}</td>
                  <td className="p-3 font-medium">{b.title}</td>
                  <td className="p-3 text-gray-500">{b.slug}</td>
                  <td className="p-3"><StatusPill status={b.status ? 'Published' : 'Draft'} /></td><td className="p-3 text-xs text-gray-500 whitespace-nowrap">{(b.published_at || b.created_at || '').toString().slice(0, 16).replace('T', ' ') || '-'}</td>
                  <td className="p-3 flex gap-2 items-center flex-wrap">
                    <button onClick={() => openEdit(b)} className="text-blue-600"><Edit2 size={16} /></button>
                    <button onClick={() => del(b.id)} className="text-red-600"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
              {blogs.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-gray-400">No posts found</td></tr>}
            </tbody>
          </table>
              {pageCount > 1 && (<div className="flex items-center justify-between text-sm px-1 py-3"><button disabled={safePage <= 1} onClick={() => setPage(safePage - 1)} className="border px-3 py-1.5 rounded-lg disabled:opacity-40">Prev</button><span className="text-gray-500">Page {safePage} / {pageCount}</span><button disabled={safePage >= pageCount} onClick={() => setPage(safePage + 1)} className="border px-3 py-1.5 rounded-lg disabled:opacity-40">Next</button></div>)}
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editing ? 'Edit' : 'New'} Post</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <input className="w-full border rounded-lg p-2" placeholder="Title *" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
              <input className="w-full border rounded-lg p-2" placeholder="Slug (blank = auto)" value={form.slug} onChange={e => setForm({ ...form, slug: e.target.value })} />
              <input className="w-full border rounded-lg p-2" placeholder="Excerpt / short summary" value={form.excerpt} onChange={e => setForm({ ...form, excerpt: e.target.value })} />
              <ImagePicker label="Featured Image" value={form.featured_image} onChange={v => setForm({ ...form, featured_image: v })} />
              <input className="w-full border rounded-lg p-2" placeholder="Author" value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} />
              <input className="w-full border rounded-lg p-2" placeholder="Tags (comma separated)" value={form.tags} onChange={e => setForm({ ...form, tags: e.target.value })} />
              <textarea className="w-full border rounded-lg p-2" placeholder="Content (full text)" rows={6} value={form.content} onChange={e => setForm({ ...form, content: e.target.value })} />
              <div className="flex gap-3">
                <input className="w-1/2 border rounded-lg p-2" type="datetime-local" value={form.published_at} onChange={e => setForm({ ...form, published_at: e.target.value })} />
                <select className="w-1/2 border rounded-lg p-2" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                  <option value="0">Draft</option><option value="1">Publish</option>
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
