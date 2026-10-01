import { useEffect, useMemo, useState } from 'react';
import { SectionHeader, NameWithAvatar, StatusPill } from '../../components/admin/ui';

const authH = () => ({ 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + localStorage.getItem('bunon_token') });

type LeaveReq = { id: number; user_name: string; leave_type: string; start_date: string; end_date: string; reason?: string; admin_comment?: string; status: string };

export default function LeavePage() {
  const [rows, setRows] = useState<LeaveReq[]>([]);
  const [form, setForm] = useState({ leave_type: 'Casual', start_date: '', end_date: '', reason: '' });
  const [msg, setMsg] = useState('');
  const [filter, setFilter] = useState<'all' | 'Pending' | 'Approved' | 'Rejected'>('all');
  const me: any = (() => { try { return JSON.parse(localStorage.getItem('bunon_user') || '{}'); } catch { return {}; } })();
  const canDecide = me.role === 'admin' || me.role === 'super_admin';
  const [page, setPage] = useState(1);
  const PAGE = 20;
  useEffect(() => { setPage(1); }, [filter, rows.length]);

  const load = async () => {
    const q = filter === 'all' ? '' : '?status=' + filter;
    const r = await fetch('/api/admin/leave' + q, { headers: authH() });
    const d = await r.json();
    if (d.ok) setRows(d.requests || []);
  };
  useEffect(() => { load(); }, [filter]);

  // T5-gap (ref leave.js admin summary): per-user month/year/approved-days/pending stats, client-computed — no extra API
  const summary = useMemo(() => {
    const now = new Date();
    const m: Record<string, { monthReq: number; yearReq: number; approvedDays: number; pending: number }> = {};
    for (const r of rows) {
      const u = r.user_name || 'unknown';
      if (!m[u]) m[u] = { monthReq: 0, yearReq: 0, approvedDays: 0, pending: 0 };
      const s = new Date(String(r.start_date).slice(0, 10));
      const e = new Date(String(r.end_date).slice(0, 10));
      if (isNaN(s.getTime())) continue;
      if (s.getFullYear() === now.getFullYear()) m[u].yearReq += 1;
      if (s.getFullYear() === now.getFullYear() && s.getMonth() === now.getMonth()) m[u].monthReq += 1;
      if (r.status === 'Approved') {
        const days = !isNaN(e.getTime()) && e >= s ? Math.floor((e.getTime() - s.getTime()) / 86400000) + 1 : 1;
        m[u].approvedDays += days;
      }
      if (r.status === 'Pending') m[u].pending += 1;
    }
    return Object.entries(m).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  const apply = async () => {
    setMsg('');
    if (!form.start_date || !form.end_date) return setMsg('Enter start and end dates');
    if (form.end_date < form.start_date) return setMsg('End date cannot be before start date');
    let userName = '';
    try { const u = JSON.parse(localStorage.getItem('bunon_user') || '{}'); userName = u.phone || u.name || ''; } catch { userName = ''; }
    const r = await fetch('/api/admin/leave/apply', { method: 'POST', headers: authH(), body: JSON.stringify({ user_name: userName, ...form }) });
    const d = await r.json();
    setMsg(d.msg || (d.ok ? 'Submitted' : 'Error'));
    if (d.ok) { setForm({ leave_type: 'Casual', start_date: '', end_date: '', reason: '' }); load(); }
  };

  const decide = async (id: number, act: 'approve' | 'reject') => {
    const comment = prompt(act === 'approve' ? 'Comment (optional):' : 'Rejection reason:') || '';
    const url = '/api/admin/leave/' + id + '/' + act;
    const r = await fetch(url, { method: 'POST', headers: authH(), body: JSON.stringify({ comment }) });
    const d = await r.json();
    setMsg(d.msg || '');
    load();
  };

  return (
    <div className="space-y-6">
      <SectionHeader title="Leave Management" right={
        <div className="flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible pb-1 -mx-1 px-1 scroll-smooth">
          {([["all", "All"], ["Pending", "Pending"], ["Approved", "Approved"], ["Rejected", "Rejected"]] as const).map(([v, label]) => (
            <button key={v} onClick={(e) => { setFilter(v); e.currentTarget.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }}
              className={`px-4 py-2 rounded-xl text-sm font-medium shrink-0 whitespace-nowrap ${filter === v ? "bg-brand-primary text-white" : "bg-white text-gray-600 border"}`}>
              {label}
            </button>
          ))}
        </div>}
      />
      {msg && <div className="bg-blue-50 text-blue-700 px-4 py-2 rounded-xl text-sm">{msg}</div>}
      <div className="bg-white rounded-2xl shadow-sm border p-4 grid grid-cols-2 md:grid-cols-5 gap-3">
        <select value={form.leave_type} onChange={(e) => setForm({ ...form, leave_type: e.target.value })} className="border rounded-xl px-3 py-2">
          <option value="Casual">Casual</option>
          <option value="Sick">Sick</option>
          <option value="Emergency">Emergency</option>
        </select>
        <input type="date" value={form.start_date} onChange={(e) => setForm({ ...form, start_date: e.target.value })} className="border rounded-xl px-3 py-2" />
        <input type="date" value={form.end_date} onChange={(e) => setForm({ ...form, end_date: e.target.value })} className="border rounded-xl px-3 py-2" />
        <input placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="border rounded-xl px-3 py-2" />
        <button onClick={apply} className="bg-brand-primary text-white rounded-xl px-4 py-2 font-medium">Apply</button>
      </div>
      {summary.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
          <div className="px-4 py-2 text-sm font-bold text-gray-600 border-b">Summary (This Month / This Year / Approved Days / Pending)</div>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="px-4 py-2">Name</th><th className="px-4 py-2">This Month</th><th className="px-4 py-2">This Year</th><th className="px-4 py-2">Approved (Days)</th><th className="px-4 py-2">Pending</th>
            </tr></thead>
            <tbody>
              {summary.map(([u, s]) => (
                <tr key={u} className="border-b last:border-0">
                  <td className="px-4 py-2 font-medium"><NameWithAvatar name={u} size={24} /></td><td className="px-4 py-2">{s.monthReq}</td>
                  <td className="px-4 py-2">{s.yearReq}</td><td className="px-4 py-2">{s.approvedDays}</td>
                  <td className={'px-4 py-2 ' + (s.pending ? 'text-amber-600 font-bold' : 'text-gray-400')}>{s.pending}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="bg-white rounded-2xl shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-gray-500 border-b">
            <th className="px-4 py-3">Name</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">From</th><th className="px-4 py-3">To</th><th className="px-4 py-3">Reason</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th>
          </tr></thead>
          <tbody>
            {rows.slice((Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE))) - 1) * PAGE, Math.min(page, Math.max(1, Math.ceil(rows.length / PAGE))) * PAGE).map((r) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="px-4 py-2"><NameWithAvatar name={r.user_name} size={24} /></td>
                <td className="px-4 py-2">{r.leave_type}</td>
                <td className="px-4 py-2">{String(r.start_date).slice(0, 10)}</td>
                <td className="px-4 py-2">{String(r.end_date).slice(0, 10)}</td>
                <td className="px-4 py-2 text-gray-600 max-w-[220px] truncate" title={r.reason || ''}>{r.reason || '—'}</td>
                <td className="px-4 py-2"><StatusPill status={r.status} /></td>
                <td className="px-4 py-2 space-x-2">
                  {r.status === 'Pending' && canDecide && (<>
                    <button onClick={() => decide(r.id, 'approve')} className="text-green-600 font-medium">Approve</button>
                    <button onClick={() => decide(r.id, 'reject')} className="text-red-600 font-medium">Reject</button>
                  </>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <div className="p-6 text-center text-gray-400">No applications found</div>}
        {rows.length > 0 && (() => {
          const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
          const cur = Math.min(page, totalPages);
          return (
            <div className="flex gap-2 items-center justify-center py-3">
              <button disabled={cur <= 1} onClick={() => setPage(cur - 1)} className="border px-3 py-1.5 rounded-lg text-sm disabled:opacity-40">← Previous</button>
              <span className="text-sm text-gray-500">Page {cur} of {totalPages} ({rows.length})</span>
              <button disabled={cur >= totalPages} onClick={() => setPage(cur + 1)} className="border px-3 py-1.5 rounded-lg text-sm disabled:opacity-40">Next →</button>
            </div>
          );
        })()}
      </div>
    </div>
  );
}
