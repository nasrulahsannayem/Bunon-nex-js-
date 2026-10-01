import { useEffect, useState } from 'react';
import { Trash2, Edit2, Plus, X, KeyRound, Eye, EyeOff, Upload } from 'lucide-react';
import ConfirmModal from '../../components/admin/ConfirmModal';
import { timeAgoBn } from '../../lib/timeAgoBn';
import { SectionHeader, StatusPill, UserAvatar, NameWithAvatar } from '../../components/admin/ui';

const API = '/api/admin/users';
const MEDIA = '/api/admin/media/upload';
const auth = () => ({ Authorization: `Bearer ${localStorage.getItem('bunon_token')}` });
const authJson = () => ({ ...auth(), 'Content-Type': 'application/json' });

// Grouped permission model - mirrors server VALID_PERMS (server/routes/admin/users.ts).
// soon (whole group) / item.soon = module does not exist yet: shown disabled + 'Coming soon', never saved.
type PermItem = { k: string; bn: string; soon?: boolean };
type PermGroup = { key: string; label: string; soon?: boolean; items: PermItem[] };
const PERM_GROUPS: PermGroup[] = [
  { key: 'overview', label: 'Overview', items: [{ k: 'view_dashboard', bn: 'View dashboard' }] },
  { key: 'kpi', label: 'Dashboard KPI', items: [
    { k: 'view_kpi_sales', bn: 'Sales (cards+chart)' }, { k: 'view_kpi_orders', bn: 'Orders (cards+funnel)' },
    { k: 'view_kpi_carts', bn: 'Carts (abandoned)' }, { k: 'view_kpi_users', bn: 'Users' },
    { k: 'view_kpi_products', bn: 'Top products' }, { k: 'view_kpi_live', bn: 'Live analytics' },
    { k: 'view_kpi_advanced', bn: 'Advanced KPI' },
  ]},
  { key: 'orders', label: 'Orders', items: [
    { k: 'view_orders', bn: 'View' }, { k: 'create_orders', bn: 'Create (manual)' },
    { k: 'edit_orders', bn: 'Edit' }, { k: 'update_order_status', bn: 'Change status' },
    { k: 'book_courier', bn: 'Book courier' }, { k: 'bulk_orders', bn: 'Bulk actions' },
    { k: 'delete_orders', bn: 'Delete' },
  ]},
  { key: 'courier', label: 'Courier Tracking', items: [
    { k: 'view_courier_tracking', bn: 'View tracking/journey' }, { k: 'sync_courier_status', bn: 'Sync status' },
  ]},
  { key: 'inventory', label: 'Inventory', items: [
    { k: 'view_inventory', bn: 'View' }, { k: 'adjust_inventory', bn: 'Adjust stock' },
  ]},
  { key: 'products', label: 'Products', items: [
    { k: 'view_products', bn: 'View' }, { k: 'create_products', bn: 'Create' },
    { k: 'edit_products', bn: 'Edit' }, { k: 'delete_products', bn: 'Delete' },
  ]},
  { key: 'customers', label: 'Customers', items: [
    { k: 'view_customers', bn: 'View' }, { k: 'edit_customers', bn: 'Edit' },
  ]},
  { key: 'marketing', label: 'Marketing', items: [
    { k: 'view_marketing', bn: 'View' }, { k: 'edit_marketing', bn: 'Edit' },
  ]},
  { key: 'coupons', label: 'Coupons', items: [
    { k: 'view_coupons', bn: 'View' }, { k: 'edit_coupons', bn: 'Edit' },
  ]},
  { key: 'reports', label: 'Reports', items: [{ k: 'view_reports', bn: 'View' }] },
  { key: 'blogs', label: 'Blog', items: [
    { k: 'view_blogs', bn: 'View' }, { k: 'edit_blogs', bn: 'Edit' },
  ]},
  { key: 'categories', label: 'Categories', items: [
    { k: 'view_categories', bn: 'View' }, { k: 'edit_categories', bn: 'Edit' },
  ]},
  { key: 'media', label: 'Media', items: [
    { k: 'manage_media', bn: 'Manage' }, { k: 'upload_media', bn: 'Upload' },
  ]},
  { key: 'trash', label: 'Recycle Bin', items: [
    { k: 'view_trash', bn: 'View trash' }, { k: 'restore_trash', bn: 'Restore' },
    { k: 'delete_trash', bn: 'Delete permanently' },
  ]},
  { key: 'users', label: 'Users', items: [
    { k: 'view_users', bn: 'View' }, { k: 'manage_users', bn: 'Manage' },
  ]},
  { key: 'settings', label: 'Settings', items: [
    { k: 'view_settings', bn: 'View' }, { k: 'manage_settings', bn: 'Manage' },
  ]},
  { key: 'tickets', label: 'Support Desk', soon: true, items: [
    { k: 'view_tickets', bn: 'View tickets' }, { k: 'create_ticket', bn: 'Create ticket' }, { k: 'reply_ticket', bn: 'Reply' },
  ]},
  { key: 'addons', label: 'Add-ons', soon: true, items: [
    { k: 'view_addons', bn: 'View' }, { k: 'manage_addons', bn: 'Manage' },
  ]},
  { key: 'attendance', label: 'Attendance', soon: true, items: [
    { k: 'view_attendance', bn: 'View' }, { k: 'manage_attendance', bn: 'Manage' },
  ]},
  { key: 'leave', label: 'Leave', soon: true, items: [
    { k: 'view_leave', bn: 'View' }, { k: 'manage_leave', bn: 'Manage' },
  ]},
  { key: 'tasks', label: 'Tasks', soon: true, items: [
    { k: 'view_tasks', bn: 'View' }, { k: 'manage_tasks', bn: 'Manage' },
  ]},
];

// Role presets - buttons fill the checkboxes (tele_sales/staff: no delete).
const ROLE_PRESETS: { key: string; label: string; perms: string[] }[] = [
  { key: 'tele_sales', label: 'Telesales', perms: [
    'view_dashboard', 'view_orders', 'create_orders', 'edit_orders', 'update_order_status',
    'book_courier', 'view_products', 'view_customers', 'edit_customers', 'view_courier_tracking',
    'view_kpi_orders',
  ]},
  { key: 'staff', label: 'Staff', perms: [
    'view_dashboard', 'view_orders', 'create_orders', 'edit_orders', 'update_order_status',
    'book_courier', 'bulk_orders', 'sync_courier_status', 'view_products', 'view_inventory',
    'view_customers', 'edit_customers', 'view_courier_tracking',
    'view_kpi_sales', 'view_kpi_orders', 'view_kpi_carts', 'view_kpi_products',
  ]},
  { key: 'manager', label: 'Manager', perms: [
    'view_dashboard', 'view_orders', 'create_orders', 'edit_orders', 'update_order_status',
    'book_courier', 'bulk_orders', 'delete_orders', 'view_courier_tracking', 'sync_courier_status',
    'view_inventory', 'adjust_inventory', 'view_products', 'create_products', 'edit_products', 'delete_products',
    'view_customers', 'edit_customers', 'view_marketing', 'edit_marketing', 'view_coupons', 'edit_coupons',
    'view_reports', 'view_blogs', 'edit_blogs', 'view_categories', 'edit_categories',
    'manage_media', 'upload_media', 'view_trash', 'restore_trash',
    'view_kpi_sales', 'view_kpi_orders', 'view_kpi_carts', 'view_kpi_users', 'view_kpi_products', 'view_kpi_live', 'view_kpi_advanced',
  ]},
  { key: 'viewer', label: 'Viewer', perms: [
    'view_dashboard', 'view_orders', 'view_courier_tracking', 'view_inventory', 'view_products',
    'view_customers', 'view_marketing', 'view_coupons', 'view_reports', 'view_blogs', 'view_categories',
    'manage_media', 'view_trash', 'view_users', 'view_settings',
    'view_kpi_sales', 'view_kpi_orders', 'view_kpi_carts', 'view_kpi_users', 'view_kpi_products', 'view_kpi_live', 'view_kpi_advanced',
  ]},
];

// Keys with no module yet - shown disabled, stripped before save.
const SOON_KEYS = new Set<string>(PERM_GROUPS.flatMap(g =>
  g.soon ? g.items.map(i => i.k) : g.items.filter(i => i.soon).map(i => i.k)));

const roleBadge = (role: string) => {
  const base = 'px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap';
  if (role === 'super_admin') return `${base} bg-purple-100 text-purple-700`;
  if (role === 'admin') return `${base} bg-blue-100 text-blue-700`;
  if (role === 'staff') return `${base} bg-gray-100 text-gray-700`;
  return `${base} bg-green-100 text-green-700`;
};

const roleBn: Record<string, string> = { staff: 'Staff', admin: 'Admin', super_admin: 'Super Admin', customer: 'Customers' };

const errBn = (d: any, fallback = 'Something went wrong') => {
  if (!d) return fallback;
  if (d.code === 'USERNAME_EXISTS') return 'Username already exists — try another';
  if (d.code === 'PHONE_EXISTS') return d.role === 'customer' ? 'A customer account exists for this number' : 'This phone number already exists';
  return d.msg || fallback;
};

type Form = { username: string; name: string; phone: string; password: string; role: string; status: string; photo: string };

export default function UsersRolesManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [form, setForm] = useState<Form>({ username: '', name: '', phone: '', password: '', role: 'staff', status: 'active', photo: '' });
  const [showPw, setShowPw] = useState(false);
  const [permOpen, setPermOpen] = useState(false);
  const [permUser, setPermUser] = useState<any | null>(null);
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [closed, setClosed] = useState<Record<string, boolean>>({});
  const toggleGroup = (gk: string) => setClosed(prev => ({ ...prev, [gk]: !prev[gk] }));
  const applyPreset = (keys: string[]) => setPerms(Object.fromEntries(keys.map(k => [k, true])));
  const [tab, setTab] = useState<'staff' | 'customer'>('staff');
  const [counts, setCounts] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkRole, setBulkRole] = useState('staff');
  const [confirmUser, setConfirmUser] = useState<any | null>(null);
  const [delBusy, setDelBusy] = useState(false);

  const me = (() => { try { return JSON.parse(localStorage.getItem('bunon_user') || '{}'); } catch { return {}; } })();
  const isSuper = me.role === 'super_admin';
  const myId = me.id;

  const load = (t: 'staff' | 'customer' = tab) => {
    setLoading(true);
    fetch(`${API}?role=${t}`, { headers: auth() }).then(r => r.json()).then(d => {
      if (d.ok) {
        setUsers(d.users); setSelected(new Set());
        // T5-gap (ref user-management.js USER_PHOTO_MAP): global avatar map for reuse outside this page
        try {
          const m: Record<string, string> = {};
          for (const u of (d.users || [])) m[u.username || u.phone || String(u.id)] = u.photo || '';
          (window as any).USER_PHOTO_MAP = Object.assign((window as any).USER_PHOTO_MAP || {}, m);
          try {
            const prev = JSON.parse(localStorage.getItem('bunon_user_photos') || '{}');
            localStorage.setItem('bunon_user_photos', JSON.stringify({ ...prev, ...m }));
          } catch { /* storage unavailable */ }
        } catch { /* non-fatal */ }
      }
      if (d.counts) setCounts(d.counts);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => { load(tab); }, [tab]);

  const permCount = (u: any) => {
    const p = u.permissions;
    if (!p) return 0;
    if (typeof p === 'string') { try { return Object.values(JSON.parse(p)).filter(Boolean).length; } catch { return 0; } }
    if (typeof p === 'object') return Object.values(p).filter(Boolean).length;
    return 0;
  };

  const openAdd = () => { setEditing(null); setShowPw(false); setForm({ username: '', name: '', phone: '', password: '', role: 'staff', status: 'active', photo: '' }); setModalOpen(true); };
  const openEdit = (u: any) => {
    setEditing(u); setShowPw(false);
    setForm({ username: u.username || '', name: u.name || '', phone: u.phone || '', password: '', role: u.role || 'staff', status: u.status || 'active', photo: u.photo || '' });
    setModalOpen(true);
  };

  const uploadPhoto = async (f: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch(MEDIA, { method: 'POST', headers: auth(), body: fd });
      const d = await res.json();
      if (d.ok && (d.url || d.path)) setForm(prev => ({ ...prev, photo: d.url || d.path }));
      else alert('Photo upload failed');
    } catch { alert('Photo upload failed'); }
    setUploading(false);
  };

  const save = async () => {
    if (!form.name.trim()) return alert('Enter full name');
    if (!form.phone.trim()) return alert('Enter phone number');
    if (!editing && !form.password) return alert('Enter a password');
    const body: any = { name: form.name.trim(), phone: form.phone.trim(), role: form.role, status: form.status };
    if (form.username.trim()) body.username = form.username.trim();
    if (form.photo.trim()) body.photo = form.photo.trim();
    if (!editing) {
      const p: string[] = [];
      /* default perms: empty array, whitelisted server-side */
      body.permissions = p;
    }
    if (!editing || form.password) body.password = form.password;
    const doSave = async (url: string, method: string, b: any) => {
      const res = await fetch(url, { method, headers: authJson(), body: JSON.stringify(b) });
      return { status: res.status, d: await res.json().catch(() => ({})) };
    };
    const { status, d } = editing
      ? await doSave(`${API}/${editing.id}`, 'PUT', body)
      : await doSave(API, 'POST', body);
    if (d.ok) { setModalOpen(false); load(tab); return; }
    if (!editing && status === 409 && (d.code === 'PHONE_EXISTS' || d.code === 'USERNAME_EXISTS') && d.role === 'customer') {
      if (!confirm(`A customer account exists for this number. ${roleBn[form.role] || form.role}? Order history will be kept`)) return;
      const convertBody: any = { phone: body.phone, name: body.name, role: body.role, password: body.password, permissions: [] }; const r2 = await doSave(API + "/convert", 'POST', convertBody);
      if (r2.d.ok) { setModalOpen(false); load(tab); alert('Converted successfully!'); } else alert(errBn(r2.d));
      return;
    }
    alert(errBn(d));
  };

  const del = async () => {
    if (!confirmUser) return;
    setDelBusy(true);
    try {
      const res = await fetch(`${API}/${confirmUser.id}`, { method: 'DELETE', headers: auth() });
      const d = await res.json().catch(() => ({}));
      if (d.ok) {
        setConfirmUser(null);
        setSelected(prev => { const n = new Set(prev); n.delete(confirmUser.id); return n; });
        load(tab);
      } else alert(errBn(d));
    } catch { alert('Delete failed'); }
    setDelBusy(false);
  };

  const applyBulkRole = async () => {
    if (selected.size === 0) return alert('Nothing selected');
    if (!confirm(`${selected.size} users to role '${bulkRole}'?`)) return;
    const res = await fetch(`${API}/bulk-role`, { method: 'PUT', headers: authJson(), body: JSON.stringify({ ids: [...selected], role: bulkRole }) });
    const d = await res.json().catch(() => ({}));
    if (d.ok) { load(tab); alert('Roles updated!'); } else alert(errBn(d));
  };

  const toggleStatus = async (u: any) => {
    const next = u.status === 'disabled' ? 'active' : 'disabled';
    if (u.id === myId && next === 'disabled') return alert('You cannot disable yourself');
    const res = await fetch(`${API}/${u.id}`, { method: 'PUT', headers: authJson(), body: JSON.stringify({ status: next }) });
    const d = await res.json().catch(() => ({}));
    if (d.ok) load(tab); else alert(errBn(d));
  };

  const openPerms = (u: any) => {
    setPermUser(u);
    const p = u.permissions;
    const toObj = (arr: string[]) => Object.fromEntries(arr.map(k => [k, true]));
    if (Array.isArray(p)) setPerms(toObj(p));
    else if (typeof p === 'string') {
      try { const v = JSON.parse(p); setPerms(Array.isArray(v) ? toObj(v) : { ...v }); }
      catch { setPerms({}); }
    } else setPerms({ ...(p || {}) });
    setPermOpen(true);
  };
  const togglePerm = (perm: string) => setPerms(prev => ({ ...prev, [perm]: !prev[perm] }));
  const savePerms = async () => {
    if (!permUser) return;
    const res = await fetch(`${API}/${permUser.id}/permissions`, {
      method: 'PUT', headers: authJson(), body: JSON.stringify({ permissions: Object.keys(perms).filter((k) => perms[k] && !SOON_KEYS.has(k)) }),
    });
    const d = await res.json().catch(() => ({}));
    if (d.ok) { setPermOpen(false); load(tab); } else alert(errBn(d));
  };

  const set = (k: keyof Form, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <div className="space-y-6">
      <SectionHeader title="User & Role Management" right={
        tab === 'staff' ? (
          <button onClick={openAdd} className="flex items-center gap-2 bg-brand-primary text-white px-4 py-2 rounded-xl text-sm">
            <Plus size={18} /> New User
          </button>
        ) : undefined
      } />

      <div className="flex gap-2 mb-2 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible pb-2 -mx-1 px-1 scroll-smooth">
        {(['staff', 'customer'] as const).map(t => (
          <button key={t} onClick={(e) => { setTab(t); e.currentTarget.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium shrink-0 whitespace-nowrap ${tab === t ? 'bg-brand-primary text-white' : 'bg-white text-gray-600 border'}`}>
            {t === 'staff' ? 'Staff & Admins' : `Customers (${(counts.find((c: any) => c.role === 'customer')?.c) ?? '…'})`}
          </button>
        ))}
      </div>
      {tab === 'customer' && <p className="text-xs text-gray-500 mb-3">Customer accounts are view-only — use the Customers page to edit/delete.</p>}

      {tab === 'staff' && isSuper && selected.size > 0 && (
        <div className="flex gap-2 items-center mb-2 bg-white border rounded-xl px-3 py-2 flex-wrap">
          <span className="text-xs font-bold text-gray-600">{selected.size} selected</span>
          <select value={bulkRole} onChange={e => setBulkRole(e.target.value)} className="border rounded-lg px-2 py-1.5 text-xs">
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
            <option value="customer">Customers</option>
            {isSuper && <option value="super_admin">Super Admin</option>}
          </select>
          <button onClick={applyBulkRole} className="bg-brand-primary text-white px-3 py-1.5 rounded-lg text-xs font-bold">Apply Role</button>
          <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500">Clear</button>
        </div>
      )}
      {loading ? <p className="text-gray-500">Loading...</p> : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="bg-gray-50 text-gray-600 sticky top-0 z-10">
              <tr>
                <th className="p-3 w-10"><input type="checkbox" checked={users.length > 0 && selected.size === users.length} onChange={() => setSelected(selected.size === users.length ? new Set() : new Set(users.map(u => u.id)))} className="accent-pink-600" /></th>
                <th className="p-3 text-left">Photo</th>
                <th className="p-3 text-left">Username</th>
                <th className="p-3 text-left">Name</th>
                <th className="p-3 text-left">Phone</th>
                <th className="p-3 text-left">Role</th>
                <th className="p-3 text-left">Last login</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-t">
                  <td className="p-3"><input type="checkbox" checked={selected.has(u.id)} onChange={() => setSelected(prev => { const n = new Set(prev); if (n.has(u.id)) n.delete(u.id); else n.add(u.id); return n; })} className="accent-pink-600" /></td>
                  <td className="p-3"><UserAvatar name={u.username || u.name || u.phone || String(u.id)} size={36} /></td>
                  <td className="p-3 font-mono text-xs"><NameWithAvatar name={u.username} size={24} /></td>
                  <td className="p-3 font-medium"><NameWithAvatar name={u.name} size={24} /></td>
                  <td className="p-3 text-gray-500">{u.phone}</td>
                  <td className="p-3"><span className={roleBadge(u.role)}>{roleBn[u.role] || u.role}</span></td>
                  <td className="p-3 text-xs text-gray-500 whitespace-nowrap">{u.last_login ? timeAgoBn(u.last_login) : <span className="text-gray-300">—</span>}</td>
                  <td className="p-3">
                    {tab === 'staff' ? (
                      <button onClick={() => toggleStatus(u)} title={u.status === 'disabled' ? 'Enable' : 'Disable'}
                        className={`relative w-11 h-6 rounded-full transition-colors ${u.status === 'disabled' ? 'bg-gray-300' : 'bg-green-500'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${u.status === 'disabled' ? 'left-0.5' : 'left-[22px]'}`} />
                      </button>
                    ) : (<StatusPill status={u.status === 'disabled' ? 'disabled' : 'active'} />)}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-2 items-center">
                      {tab === 'staff' && <button onClick={() => openEdit(u)} className="text-blue-600" title="Edit"><Edit2 size={16} /></button>}
                      {tab === 'staff' && isSuper && <button onClick={() => openPerms(u)} className="text-green-600" title={`Permissions (${permCount(u)})`}><KeyRound size={16} /></button>}
                      {tab === 'staff' && isSuper && <button onClick={() => { if (u.id === myId) return alert('You cannot delete yourself'); setConfirmUser(u); }} className="text-red-600" title="Delete"><Trash2 size={16} /></button>}
                      {tab === 'customer' && <span className="text-gray-400 text-xs">View only</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={9} className="p-4 text-center text-gray-400">No users found</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-5 sm:p-6 max-h-[92vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">{editing ? 'Edit' : 'New'} Users</h2>
              <button onClick={() => setModalOpen(false)}><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-600">Username (unique)</label>
                <input className="w-full border rounded-lg p-2 mt-1 font-mono text-sm" placeholder="e.g. nayem01" value={form.username} onChange={e => set('username', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Full name *</label>
                <input className="w-full border rounded-lg p-2 mt-1" placeholder="Name *" value={form.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Phone *</label>
                <input className="w-full border rounded-lg p-2 mt-1" placeholder="01XXXXXXXXX" value={form.phone} onChange={e => set('phone', e.target.value)} />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Password {editing ? '(blank = unchanged)' : '*'}</label>
                <div className="relative mt-1">
                  <input type={showPw ? 'text' : 'password'} className="w-full border rounded-lg p-2 pr-10" placeholder={editing ? 'New password (optional)' : 'Password *'} value={form.password} onChange={e => set('password', e.target.value)} />
                  <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500">{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
                </div>
              </div>
              <div className="grid max-sm:grid-cols-1 grid-cols-2 gap-3 items-start">
                <div>
                  <label className="text-xs font-medium text-gray-600">Role</label>
                  <select className="w-full border rounded-lg p-2 mt-1" value={form.role} onChange={e => set('role', e.target.value)}>
                    <option value="staff">Staff</option>
                    <option value="admin">Admin</option>
                    {isSuper && <option value="super_admin">Super Admin</option>}
                    <option value="customer">Customers</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600">Status</label>
                  <select className="w-full border rounded-lg p-2 mt-1" value={form.status} onChange={e => set('status', e.target.value)}>
                    <option value="active">Active</option>
                    <option value="disabled">Disabled</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600">Photo (upload or URL)</label>
                <div className="flex gap-2 items-center mt-1">
                  {form.photo && <img src={form.photo} alt="" className="w-11 h-11 rounded-full object-cover border" />}
                  <input className="flex-1 border rounded-lg p-2 text-sm" placeholder="https://... photo URL" value={form.photo} onChange={e => set('photo', e.target.value)} />
                  <label className="shrink-0 flex items-center gap-1 bg-gray-100 hover:bg-gray-200 px-3 py-2 rounded-lg text-sm cursor-pointer">
                    <Upload size={16} /> {uploading ? '...' : 'Upload'}
                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); }} />
                  </label>
                </div>
              </div>
            </div>
            <button onClick={save} className="mt-4 w-full bg-brand-primary text-white py-2.5 rounded-xl font-medium">Save</button>
          </div>
        </div>
      )}

            <ConfirmModal open={confirmUser != null} title="Delete User" message={`"${confirmUser?.name || confirmUser?.username || ''}"?`} onConfirm={del} busy={delBusy} onClose={() => setConfirmUser(null)} />
      {permOpen && permUser && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold"><NameWithAvatar name={permUser.name} size={24} /> — Permissions</h2>
              <button onClick={() => setPermOpen(false)}><X size={20} /></button>
            </div>
            <div className="flex gap-2 flex-wrap mb-3">
              {ROLE_PRESETS.map(r => (
                <button key={r.key} onClick={() => applyPreset(r.perms)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100">
                  {r.label}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {PERM_GROUPS.map(g => {
                const dis = !!g.soon;
                const on = g.items.filter(i => perms[i.k]).length;
                return (
                  <div key={g.key} className={`border rounded-xl ${dis ? 'opacity-60 bg-gray-50' : ''}`}>
                    <button onClick={() => toggleGroup(g.key)} className="w-full flex items-center justify-between p-3 text-left">
                      <span className="font-bold text-sm">{g.label}
                        {dis && <span className="ml-2 text-[10px] font-medium bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Coming soon</span>}
                        {!dis && on > 0 && <span className="ml-2 text-[10px] font-medium bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{on}</span>}
                      </span>
                      <span className="text-gray-400 text-xs">{closed[g.key] ? '▶' : '▼'}</span>
                    </button>
                    {!closed[g.key] && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 px-3 pb-3">
                        {g.items.map(it => {
                          const itemDis = dis || !!it.soon;
                          return (
                            <label key={it.k} className={`flex items-center gap-2 text-sm ${itemDis ? 'cursor-not-allowed text-gray-400' : 'cursor-pointer'}`}
                              title={it.k + (itemDis ? ' (Coming soon)' : '')}>
                              <input type="checkbox" checked={itemDis ? false : !!perms[it.k]}
                                disabled={itemDis} onChange={() => togglePerm(it.k)} className="accent-pink-600" />
                              <span>{it.bn}{it.soon && <span className="ml-1 text-[10px] bg-gray-200 px-1.5 py-0.5 rounded-full">Coming soon</span>}</span>
                              <span className="font-mono text-[10px] text-gray-400">{it.k}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button onClick={savePerms} className="mt-4 w-full bg-brand-primary text-white py-2 rounded-xl">Save</button>
          </div>
        </div>
      )}
    </div>
  );
}
