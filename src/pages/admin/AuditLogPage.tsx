import { useEffect, useState } from 'react';
import { SectionHeader, NameWithAvatar } from '../../components/admin/ui';

const auth = () => ({ 'Authorization': 'Bearer ' + String(localStorage.getItem('bunon_token') || '') });
const LIMIT = 20;

export default function AuditLogPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [module, setModule] = useState('');
  const [actor, setActor] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ page: String(p), limit: String(LIMIT) });
      if (module) q.set('module', module);
      if (/^\d+$/.test(actor.trim())) q.set('actor', actor.trim());
      if (from) q.set('from', from);
      if (to) q.set('to', to);
      const r = await fetch('/api/admin/audit?' + q.toString(), { headers: auth() }).then(x => x.json());
      setLogs(r.logs || []);
      const total = Number(r.total || 0);
      const limit = Number(r.limit || LIMIT) || LIMIT;
      setPages(Math.max(1, Math.ceil(total / limit)));
      setPage(Number(r.page || p));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(1); }, []);

  const th = 'px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b';
  const td = 'px-3 py-2 text-sm border-b border-gray-100';

  return (
    <div className="space-y-6 pb-10">
      <SectionHeader title="Audit Log" sub="Staff activity trail by module and actor" />
      <div className="bg-white p-4 rounded-2xl border border-gray-100 flex flex-wrap gap-2 items-end *:min-w-0">
        <label className="text-xs text-gray-500">Module<br /><input value={module} onChange={e => setModule(e.target.value)} placeholder="orders" className="border rounded-lg px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-gray-500">Actor ID<br /><input value={actor} onChange={e => setActor(e.target.value)} placeholder="Actor ID" inputMode="numeric" className="border rounded-lg px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-gray-500">From<br /><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></label>
        <label className="text-xs text-gray-500">To<br /><input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></label>
        <button onClick={() => load(1)} className="bg-brand-primary text-white px-4 py-2 rounded-xl text-sm font-bold">Filter</button>
      </div>
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        {loading ? <div className="text-center text-gray-400 animate-pulse">Loading...</div> : (
          <div className="overflow-x-auto -mx-1 px-1">
            <table className="w-full [&_td]:align-middle [&_th]:align-middle">
              <thead><tr><th className={th}>Time</th><th className={th}>Module</th><th className={th}>Action</th><th className={th}>Actor</th><th className={th}>Details</th></tr></thead>
              <tbody>
                {logs.map((l: any, i: number) => (
                  <tr key={i}><td className={td}>{(l.created_at || '').toString().slice(0, 16).replace('T', ' ')}</td><td className={td}>{l.module}</td><td className={td}>{l.action}</td><td className={td}><span className="inline-flex items-center gap-2 flex-wrap"><NameWithAvatar name={l.actor_name || l.actor_id || l.actor || '-'} />{l.actor_role ? <span className="text-xs text-gray-500">({l.actor_role})</span> : ''}{l.target ? <span className="text-xs text-gray-400">#{l.target}</span> : ''}</span></td><td className={td + ' max-w-xs truncate'} title={typeof l.detail === 'object' ? JSON.stringify(l.detail) : String(l.detail ?? '-')}>{typeof l.detail === 'object' ? JSON.stringify(l.detail) : (l.detail ?? '-')}</td></tr>
                ))}
                {logs.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-6 text-sm">No logs found</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-between items-center mt-4 text-sm">
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="border px-3 py-1.5 rounded-lg disabled:opacity-40">← Previous</button>
          <span className="text-gray-500">Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => load(page + 1)} className="border px-3 py-1.5 rounded-lg disabled:opacity-40">Next →</button>
        </div>
      </div>
    </div>
  );
}
