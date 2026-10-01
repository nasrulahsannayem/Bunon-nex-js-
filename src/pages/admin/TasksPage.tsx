import { useEffect, useState } from 'react';
import { SectionHeader, StatusPill, NameWithAvatar } from '../../components/admin/ui';

const authH = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('bunon_token') });

export default function TasksPage() {
  const me: any = (() => { try { return JSON.parse(localStorage.getItem('bunon_user') || '{}'); } catch { return {}; } })();
  const canManage = me.role === 'admin' || me.role === 'super_admin';
  const [rows, setRows] = useState<any[]>([]);
  const [fStatus, setFStatus] = useState('');
  const [fAssignee, setFAssignee] = useState('');
  const [form, setForm] = useState({ task_name: '', priority: 'medium', deadline: '', assigned_to: '', type: 'daily' });
  const [msg, setMsg] = useState('');

  const load = async () => {
    const qs = new URLSearchParams();
    if (fStatus) qs.set('status', fStatus);
    if (fAssignee.trim()) qs.set('assigned_to', fAssignee.trim());
    const q = qs.toString() ? '?' + qs.toString() : '';
    const r = await fetch('/api/admin/tasks' + q, { headers: authH() });
    const d = await r.json();
    if (d.ok) setRows(d.tasks || []);
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setMsg('');
    const r = await fetch('/api/admin/tasks', { method: 'POST', headers: authH(), body: JSON.stringify(form) });
    const d = await r.json();
    setMsg(d.msg || '');
    if (d.ok) { setForm({ task_name: '', priority: 'medium', deadline: '', assigned_to: '', type: 'daily' }); load(); }
  };

  const setStatus = async (id: number, status: string) => {
    const r = await fetch(`/api/admin/tasks/${id}/status`, { method: 'POST', headers: authH(), body: JSON.stringify({ status }) });
    const d = await r.json();
    setMsg(d.msg || '');
    load();
  };

  const assign = async (id: number) => {
    const to = prompt('Assign to (phone/name)?') || '';
    if (!to) return;
    const r = await fetch(`/api/admin/tasks/${id}/assign`, { method: 'POST', headers: authH(), body: JSON.stringify({ assigned_to: to }) });
    const d = await r.json();
    setMsg(d.msg || '');
    load();
  };

  const remove = async (id: number) => {
    if (!confirm('Delete this task?')) return;
    const r = await fetch(`/api/admin/tasks/${id}`, { method: 'DELETE', headers: authH() });
    const d = await r.json();
    setMsg(d.msg || '');
    load();
  };

  return (
    <div className="space-y-6 pb-10">
      <SectionHeader title="Task Management" sub="Assign, track and complete staff tasks" />
      {msg && <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-sm">{msg}</div>}
      <div className="bg-white rounded-2xl shadow-sm border p-4 grid grid-cols-2 md:grid-cols-6 gap-3 min-w-0 overflow-x-clip">
        <input placeholder="Task name" value={form.task_name} onChange={(e) => setForm({ ...form, task_name: e.target.value })} className="border rounded-xl px-3 py-2 col-span-2 min-w-0" />
        <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className="border rounded-xl px-3 py-2 min-w-0">
          <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option>
        </select>
        <input type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} className="border rounded-xl px-3 py-2 min-w-0" />
        <input placeholder="Assignee (phone)" value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })} className="border rounded-xl px-3 py-2 min-w-0" />
        <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="border rounded-xl px-3 py-2 min-w-0">
          <option value="daily">Daily</option><option value="weekly">Weekly</option><option value="once">Once</option>
        </select>
        <button onClick={create} className="bg-brand-primary text-white rounded-xl px-4 py-2 font-medium min-w-0 col-span-2 md:col-span-1">Add</button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border p-4 flex flex-wrap gap-3 items-end">
        <label className="text-xs text-gray-500">Status<br /><select value={fStatus} onChange={(e) => setFStatus(e.target.value)} className="border rounded-xl px-3 py-2 text-sm">
          <option value="">All</option><option value="pending">Pending</option><option value="doing">Doing</option><option value="done">Done</option>
        </select></label>
        <label className="text-xs text-gray-500">Assignee<br /><input value={fAssignee} onChange={(e) => setFAssignee(e.target.value)} placeholder="phone/name" className="border rounded-xl px-3 py-2 text-sm" /></label>
        <button onClick={load} className="border rounded-xl px-4 py-2 text-sm font-bold">Filter</button>
      </div>
      <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="px-4 py-3">Task</th><th className="px-4 py-3">Priority</th><th className="px-4 py-3">Assigned To</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th>
          </tr></thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} className="border-b last:border-0">
                <td className="px-4 py-2">{t.task_name}</td>
                <td className="px-4 py-2">{t.priority}</td>
                <td className="px-4 py-2">{t.assigned_to ? <NameWithAvatar name={t.assigned_to} /> : '-'}</td>
                <td className="px-4 py-2"><StatusPill status={t.status} /></td>
                <td className="px-4 py-2 space-x-2 whitespace-nowrap">
                  {t.status !== 'done' && <button onClick={() => setStatus(t.id, 'done')} className="text-green-600 font-medium">Done</button>}
                  {t.status === 'pending' && <button onClick={() => setStatus(t.id, 'doing')} className="text-blue-600 font-medium">Start</button>}
                  {canManage && <button onClick={() => assign(t.id)} className="text-gray-600 font-medium">Assign</button>}
                  {canManage && <button onClick={() => remove(t.id)} className="text-red-600 font-medium">Delete</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-6 text-center text-gray-400">No tasks found</div>}
      </div>
    </div>
  );
}
