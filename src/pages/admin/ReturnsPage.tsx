import { useEffect, useState } from 'react';
import { StatCard, SectionHeader, StatusPill, NameWithAvatar } from '../../components/admin/ui';


const auth = () => ({ 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` });
const today = () => new Date().toISOString().slice(0, 10);
const monthAgo = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().slice(0, 10); };
const tk = (n: any) => '৳' + (Number(n) || 0).toLocaleString('en-IN');

export default function ReturnsPage() {
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(today());
  const [analytics, setAnalytics] = useState<any>(null);
  const [list, setList] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [acting, setActing] = useState(false);
  // action form
  // Steadfast courier-return (SF return requests, separate from internal refund returns)
  const [sfRet, setSfRet] = useState({ consignment_id: '', invoice: '', tracking_code: '', reason: '' });
  const [sfRetMsg, setSfRetMsg] = useState('');
  const [sfRetList, setSfRetList] = useState<any[]>([]);
  const [sfRetDetail, setSfRetDetail] = useState<any>(null);
  const loadSfReturns = async () => {
    try {
      const r = await fetch('/api/admin/couriers/steadfast/returns', { headers: auth() }).then(x => x.json());
      const list = r?.data?.return_requests || r?.return_requests || r?.data || [];
      setSfRetList(Array.isArray(list) ? list : []);
    } catch {}
  };
  const sendSfReturn = async () => {
    setSfRetMsg('পাঠানো হচ্ছে...');
    try {
      const body: any = { reason: sfRet.reason };
      if (sfRet.consignment_id) body.consignment_id = Number(sfRet.consignment_id);
      else if (sfRet.invoice) body.invoice = sfRet.invoice;
      else if (sfRet.tracking_code) body.tracking_code = sfRet.tracking_code;
      else { setSfRetMsg('❌ consignment/invoice/tracking যেকোনো একটা দিন'); return; }
      const res = await fetch('/api/admin/couriers/steadfast/return', { method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(x => x.json());
      setSfRetMsg(res.ok ? '✅ রিটার্ন রিকোয়েস্ট গেছে' : ('❌ ' + (res.msg || 'ব্যর্থ')));
      if (res.ok) loadSfReturns();
    } catch { setSfRetMsg('❌ নেটওয়ার্ক সমস্যা'); }
  };
  const [orderId, setOrderId] = useState('');
  const [reason, setReason] = useState('');
  const [restock, setRestock] = useState(true);
  const [lines, setLines] = useState('[{"qty": 1}]');

  const load = async (p = 1) => {
    setLoading(true);
    try {
      const [a, l] = await Promise.all([
        fetch(`/api/admin/orders/returns/analytics?from=${from}&to=${to}`, { headers: auth() }).then(x => x.json()).catch(() => ({})),
        fetch(`/api/admin/orders/returns/list?page=${p}&limit=20`, { headers: auth() }).then(x => x.json()).catch(() => ({})),
      ]);
      if (a && a.ok !== false) setAnalytics(a);
      setList(Array.isArray(l.returns) ? l.returns : []);
      setTotal(l.pagination ? l.pagination.total : 0);
      setPage(p);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(1); loadSfReturns(); }, []);

  const doAction = async (kind: 'partial-return' | 'full-return') => {
    if (!orderId) { alert('Enter an order ID'); return; }
    let items: any[] = [];
    if (kind === 'partial-return') {
      try {
        items = JSON.parse(lines);
        if (!Array.isArray(items) || items.length === 0) throw new Error('empty');
      } catch { alert('Fix the items JSON: [{"order_item_id": 12, "qty": 1}]'); return; }
    }
    setActing(true);
    try {
      const body = kind === 'full-return' ? { reason, restock } : { items, reason, restock };
      const r = await fetch(`/api/admin/orders/${orderId}/${kind}`, {
        method: 'POST', headers: { ...auth(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(x => x.json());
      alert(r.msg + (r.refund_amount ? ` — Refund ${tk(r.refund_amount)}` : ''));
      if (r.ok) { setOrderId(''); setReason(''); load(page); }
    } finally { setActing(false); }
  };

  const t = analytics?.totals || {};
  const th = 'px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase border-b';
  const td = 'px-3 py-2 text-sm border-b border-gray-100';
  const card = 'bg-white p-5 rounded-3xl shadow-sm border border-gray-100';

  return (
    <div className="space-y-6 pb-10">
      <SectionHeader title="Returns" sub="Partial / full returns and refund totals" right={<>
          <label className="shrink-0 whitespace-nowrap text-xs text-gray-500">From<br /><input type="date" value={from} onChange={e => setFrom(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></label>
          <label className="shrink-0 whitespace-nowrap text-xs text-gray-500">To<br /><input type="date" value={to} onChange={e => setTo(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></label>
          <button onClick={() => load(1)} className="shrink-0 bg-brand-primary text-white px-4 py-2 rounded-xl text-sm font-bold">Load</button>
        </>} />

      {loading && <div className="text-center text-gray-400 animate-pulse">Loading...</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total Returns" value={t.total_returns ?? 0} tone="orders" />
        <StatCard title="Partial" value={t.partial ?? 0} tone="pending" />
        <StatCard title="Full Returns" value={t.full ?? 0} tone="cancelled" />
        <StatCard title="Total Refund" value={tk(t.refund_amount)} tone="sales" />
      </div>

      <div className={card}>
        <div className="flex items-center gap-2 mb-1"><h3 className="text-lg font-bold text-brand-navy">Courier Return — Steadfast</h3><button onClick={loadSfReturns} className="ml-auto border px-3 py-1.5 rounded-lg text-sm font-bold">Refresh</button></div>
        <p className="text-xs text-slate-500 mb-3">পার্সেল ফেরত আনার রিকোয়েস্ট (consignment / invoice / tracking — যেকোনো একটা)। ডেলিভারড বা আগের ওপেন রিকোয়েস্ট থাকলে 422 আসবে।</p>
        <div className="grid md:grid-cols-4 gap-2">
          <label className="text-xs text-gray-500">Consignment ID<br /><input value={sfRet.consignment_id} onChange={e => setSfRet({ ...sfRet, consignment_id: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm w-full font-mono" /></label>
          <label className="text-xs text-gray-500">Invoice<br /><input value={sfRet.invoice} onChange={e => setSfRet({ ...sfRet, invoice: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm w-full font-mono" /></label>
          <label className="text-xs text-gray-500">Tracking Code<br /><input value={sfRet.tracking_code} onChange={e => setSfRet({ ...sfRet, tracking_code: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm w-full font-mono" /></label>
          <label className="text-xs text-gray-500">কারণ<br /><input value={sfRet.reason} onChange={e => setSfRet({ ...sfRet, reason: e.target.value })} className="border rounded-lg px-2 py-1.5 text-sm w-full" /></label>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <button onClick={sendSfReturn} className="bg-brand-primary text-white px-4 py-2 rounded-xl text-sm font-bold">রিটার্ন রিকোয়েস্ট পাঠান</button>
          {sfRetMsg && <span className="text-sm">{sfRetMsg}</span>}
        </div>
        <div className="overflow-x-auto mt-3"><table className="w-full"><thead><tr><th className={th}>ID</th><th className={th}>Consignment</th><th className={th}>Status</th><th className={th}>Reason</th><th className={th}></th></tr></thead>
          <tbody>{sfRetList.map((x: any) => (<tr key={x.id}><td className={td + ' font-mono'}>{x.id}</td><td className={td + ' font-mono'}>{x.consignment_id}</td><td className={td}><StatusPill status={x.status} /></td><td className={td}>{x.reason || '-'}</td><td className={td}><button className="text-indigo-600 text-xs font-bold" onClick={async () => { const d = await fetch('/api/admin/couriers/steadfast/returns/' + x.id, { headers: auth() }).then(y => y.json()); setSfRetDetail(d); }}>দেখুন</button></td></tr>))}
          {sfRetList.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-4 text-sm">No courier return requests</td></tr>}</tbody></table></div>
        {sfRetDetail && (() => {
          const rd: any = sfRetDetail?.return_request || sfRetDetail?.data?.return_request || sfRetDetail?.data || sfRetDetail || {};
          const pc: any = rd?.consignment || {};
          const fields: any = { ...rd }; delete fields.consignment;
          return (
          <div className="mt-3 bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="flex justify-between items-center mb-3"><b className="text-sm text-slate-800">রিটার্ন #{rd.id} — {rd.status}</b><button className="text-rose-600 font-bold text-sm" onClick={() => setSfRetDetail(null)}>✕ বন্ধ</button></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {Object.entries(fields).filter(([k]) => !['id', 'user_id', 'updated_at'].includes(k)).map(([k, v]: any, i: number) => (
                <div key={i} className="bg-white rounded-xl px-3 py-2 border border-slate-100"><div className="text-[10px] text-slate-400">{k}</div><div className="text-xs font-bold text-slate-800 break-all">{typeof v === 'object' ? JSON.stringify(v) : String(v ?? '-')}</div></div>
              ))}
            </div>
            {pc && pc.consignment_id && (
              <div className="bg-white rounded-xl p-3 border border-slate-100 text-xs space-y-1">
                <div className="font-bold text-slate-700 mb-1">পার্সেল</div>
                <div><b>Invoice:</b> <span className="font-mono">{pc.invoice}</span> • <b>COD:</b> ৳{Number(pc.cod_amount || 0).toLocaleString()} • <b>স্ট্যাটাস:</b> {pc.status}</div>
                <div><b>ক্রেতা:</b> {pc.recipient_name} (<span className="font-mono">{pc.recipient_phone}</span>)</div>
                <div className="text-slate-500">{pc.recipient_address}</div>
              </div>
            )}
          </div>);
        })()}
      </div>

      <div className={card}>
        <h3 className="text-lg font-bold text-brand-navy mb-3">Return Actions</h3>
        <div className="grid md:grid-cols-4 gap-2">
          <label className="text-xs text-gray-500">Order ID<br /><input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="e.g. 123" className="border rounded-lg px-2 py-1.5 text-sm w-full" /></label>
          <label className="text-xs text-gray-500">Reason<br /><input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. size issue" className="border rounded-lg px-2 py-1.5 text-sm w-full" /></label>
          <label className="text-xs text-gray-500">Items (Partial)<br /><input value={lines} onChange={e => setLines(e.target.value)} placeholder='[{"order_item_id":1,"qty":1}]' className="border rounded-lg px-2 py-1.5 text-sm w-full font-mono" /></label>
          <label className="text-xs text-gray-500 flex items-end gap-2 pb-2"><input type="checkbox" checked={restock} onChange={e => setRestock(e.target.checked)} className="w-4 h-4" /> Restock inventory</label>
        </div>
        <div className="flex gap-2 mt-3">
          <button disabled={acting} onClick={() => doAction('partial-return')} className="bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">Partial Return</button>
          <button disabled={acting} onClick={() => doAction('full-return')} className="bg-rose-600 text-white px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-50">Full Return</button>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className={card}>
          <h3 className="text-lg font-bold text-brand-navy mb-3">By Reason</h3>
          <table className="w-full"><thead><tr><th className={th}>Reason</th><th className={th}>Status</th><th className={th}>Count</th><th className={th}>Amount</th></tr></thead>
          <tbody>{(analytics?.byReason || []).map((r: any, i: number) => (
            <tr key={i}><td className={td}>{r.reason}</td><td className={td}><StatusPill status={r.status} /></td><td className={td}>{r.n}</td><td className={td}>{tk(r.amount)}</td></tr>
          ))}</tbody></table>
          {(analytics?.byReason || []).length === 0 && <div className="text-sm text-gray-400 py-3">No returns found</div>}
        </div>
        <div className={card}>
          <h3 className="text-lg font-bold text-brand-navy mb-3">By Day</h3>
          <table className="w-full"><thead><tr><th className={th}>Date</th><th className={th}>Status</th><th className={th}>Count</th><th className={th}>Amount</th></tr></thead>
          <tbody>{(analytics?.byDay || []).slice(-14).map((r: any, i: number) => (
            <tr key={i}><td className={td}>{String(r.d || '').slice(0, 10)}</td><td className={td}><StatusPill status={r.status} /></td><td className={td}>{r.n}</td><td className={td}>{tk(r.amount)}</td></tr>
          ))}</tbody></table>
          {(analytics?.byDay || []).length === 0 && <div className="text-sm text-gray-400 py-3">No returns found</div>}
        </div>
      </div>

      <div className={card}>
        <h3 className="text-lg font-bold text-brand-navy mb-3">Return List ({total})</h3>
        <div className="overflow-x-auto">
        <table className="w-full"><thead><tr><th className={th}>ID</th><th className={th}>Invoice</th><th className={th}>Customer</th><th className={th}>Reason</th><th className={th}>Status</th><th className={th}>Refund</th><th className={th}>Date</th></tr></thead>
        <tbody>{list.map((r: any) => (
          <tr key={r.id}>
            <td className={td}>#{r.id} / Order {r.order_id}</td>
            <td className={td + ' font-mono'}>{r.invoice || '—'}</td>
            <td className={td}><NameWithAvatar name={r.customer_name || '—'} /><div className="text-xs text-gray-400">{r.phone || ''}</div></td>
            <td className={td}>{r.reason || '—'}</td>
            <td className={td}><StatusPill status={r.status === 'full' ? 'full' : 'partial'} /></td>
            <td className={td}>{tk(r.refund_amount)}</td>
            <td className={td}>{String(r.created_at || '').slice(0, 16).replace('T', ' ')}</td>
          </tr>
        ))}</tbody></table>
        </div>
        {list.length === 0 && <div className="text-sm text-gray-400 py-3">No return records found</div>}
        <div className="flex gap-2 mt-3">
          <button disabled={page <= 1} onClick={() => load(page - 1)} className="border px-3 py-1.5 rounded-lg text-sm disabled:opacity-40">← Previous</button>
          <span className="text-sm text-gray-500 py-1.5">Page {page}</span>
          <button disabled={list.length < 20} onClick={() => load(page + 1)} className="border px-3 py-1.5 rounded-lg text-sm disabled:opacity-40">Next →</button>
        </div>
      </div>
    </div>
  );
}
