import { useEffect, useMemo, useState } from 'react';
import { SectionHeader, StatCard } from '../../components/admin/ui';
const authGet = () => ({ 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` });
const num = (v: any) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
export default function PayoutPage() {
  const [view, setView] = useState<'hisab' | 'pickup'>('hisab');
  // local
  const [period, setPeriod] = useState('month');
  const [records, setRecords] = useState<any[]>([]);
  const [rate, setRate] = useState('120');
  const [loading, setLoading] = useState(false);
  // steadfast
  const [sfBal, setSfBal] = useState<any>(null);
  const [sfPays, setSfPays] = useState<any[]>([]);
  const [sfPage, setSfPage] = useState(1);
  const [sfLoading, setSfLoading] = useState(false);
  const [payDetail, setPayDetail] = useState<any>(null);
  // pickup
  const [stations, setStations] = useState<any[]>([]);
  const [pk, setPk] = useState({ address_id: '', police_station_id: '', address: '', contact_number: '', note: '', estim_qty: '' });
  const [pkMsg, setPkMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/admin/profit?period=${period}`, { headers: authGet() }).then(x => x.json());
      setRecords(r.records || []);
    } finally { setLoading(false); }
  };
  const loadSf = async (page = 1) => {
    setSfLoading(true);
    try {
      const [b, p] = await Promise.all([
        fetch('/api/admin/couriers/steadfast/balance', { headers: authGet() }).then(x => x.json()).catch(() => null),
        fetch(`/api/admin/couriers/steadfast/payments?page=${page}`, { headers: authGet() }).then(x => x.json()).catch(() => null),
      ]);
      setSfBal(b);
      setSfPays(Array.isArray(p?.payments) ? p.payments : []);
      setSfPage(page);
    } finally { setSfLoading(false); }
  };
  const loadStations = async () => {
    if (stations.length) return;
    try {
      const r = await fetch('/api/admin/couriers/steadfast/police-stations', { headers: authGet() }).then(x => x.json());
      const list = r?.data?.police_stations || r?.police_stations || r?.data || [];
      setStations(Array.isArray(list) ? list : []);
    } catch {}
  };
  useEffect(() => { load(); loadSf(1); }, []);
  useEffect(() => { if (view === 'pickup') loadStations(); }, [view]);

  const r = num(rate);
  const rows = useMemo(() => records.map((x: any) => {
    const parcels = parseInt(x.total_parcels ?? x.total_units ?? 0, 10) || 0;
    const courier = parcels * r;
    return { ...x, parcels, courier, payout: num(x.net_profit) - courier };
  }), [records, rate]);
  const t = rows.reduce((a: any, x: any) => ({ net: a.net + num(x.net_profit), courier: a.courier + x.courier, payout: a.payout + x.payout, parcels: a.parcels + x.parcels }), { net: 0, courier: 0, payout: 0, parcels: 0 });
  const sfBalance = Number(sfBal?.current_balance ?? sfBal?.data?.current_balance ?? 0);
  const th = 'px-2 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase border-b';
  const td = 'px-2 py-1.5 text-sm border-b border-gray-100';
  const csv = () => {
    const head = 'date,net_profit,parcels,courier_cost,payout';
    const lines = rows.map((x: any) => [x.record_date, num(x.net_profit).toFixed(2), x.parcels, x.courier.toFixed(2), x.payout.toFixed(2)].join(','));
    const blob = new Blob([[head, ...lines].join('\n')], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `payout_${period}.csv`; a.click();
  };
  const sendPickup = async () => {
    setPkMsg('পাঠানো হচ্ছে...');
    try {
      const res = await fetch('/api/admin/couriers/steadfast/pickup', { method: 'POST', headers: { ...authGet(), 'Content-Type': 'application/json' }, body: JSON.stringify({ address_id: Number(pk.address_id), police_station_id: Number(pk.police_station_id), address: pk.address, contact_number: pk.contact_number, note: pk.note, estim_qty: pk.estim_qty ? Number(pk.estim_qty) : undefined }) }).then(x => x.json());
      setPkMsg(res.ok ? '✅ পিকআপ রিকোয়েস্ট গেছে (201)' : `❌ ${res.msg || 'ব্যর্থ'}`);
    } catch { setPkMsg('❌ নেটওয়ার্ক সমস্যা'); }
  };
  const inp = 'border rounded-lg px-2 py-1.5 text-sm w-full';

  return (
    <div className="space-y-6 pb-10">
      <SectionHeader title="Payout" sub="লোকাল + Steadfast একসাথে" right={
        <div className="flex gap-1 bg-slate-100 rounded-xl p-1 shrink-0">
          {([['hisab', 'হিসাব'], ['pickup', 'Pickup']] as const).map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${view === k ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}>{l}</button>
          ))}
        </div>}
      />
      {view === 'hisab' && (<>
      {(loading || sfLoading) && <div className="text-center text-gray-400 animate-pulse">Loading...</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="লোকাল Payout" value={`৳${t.payout.toFixed(2)}`} tone="revenue" />
        <StatCard title="Steadfast ব্যালেন্স" value={`৳${sfBalance.toLocaleString()}`} tone="sales" />
        <StatCard title="লোকাল পার্সেল" value={t.parcels} tone="orders" />
        <StatCard title="SF পেআউট (পেজ)" value={sfPays.length} tone="alert" />
      </div>
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <h3 className="text-lg font-bold text-brand-navy">লোকাল হিসাব ({rows.length})</h3>
          <select value={period} onChange={e => setPeriod(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm ml-auto">
            <option value="week">This Week</option><option value="month">This Month</option><option value="year">This Year</option><option value="all">All</option>
          </select>
          <input type="number" value={rate} onChange={e => setRate(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm w-24" title="Parcel Rate" />
          <button onClick={load} className="bg-brand-primary text-white px-4 py-2 rounded-xl text-sm font-bold">Load</button>
          <button onClick={csv} className="border px-4 py-2 rounded-xl text-sm font-bold text-gray-700 hover:bg-gray-50">CSV</button>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto"><table className="w-full">
          <thead><tr><th className={th}>Date</th><th className={th}>Net</th><th className={th}>Parcels</th><th className={th}>Courier</th><th className={th}>Payout</th></tr></thead>
          <tbody>{rows.map((x: any) => (<tr key={x.id}><td className={td}>{x.record_date}</td><td className={td + ' text-right'}>{num(x.net_profit).toFixed(2)}</td><td className={td + ' text-right'}>{x.parcels}</td><td className={td + ' text-right'}>{x.courier.toFixed(2)}</td><td className={td + ' text-right font-bold text-green-700'}>{x.payout.toFixed(2)}</td></tr>))}
          {rows.length === 0 && <tr><td colSpan={5} className="text-center text-gray-400 py-6 text-sm">No data found</td></tr>}</tbody></table></div>
      </div>
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="text-lg font-bold text-brand-navy">Steadfast পেআউট (পেজ {sfPage})</h3>
          <button onClick={() => loadSf(sfPage)} className="ml-auto border px-3 py-1.5 rounded-lg text-sm font-bold">Refresh</button>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto"><table className="w-full">
          <thead><tr><th className={th}>Payment ID</th><th className={th}>Amount</th><th className={th}>Method</th><th className={th}>Status</th><th className={th}>Paid At</th><th className={th}></th></tr></thead>
          <tbody>{sfPays.map((p: any, i: number) => (<tr key={p.payment_id || i}><td className={td + ' font-mono'}>{p.payment_id}</td><td className={td + ' text-right'}>৳{Number(p.amount ?? 0).toLocaleString()}</td><td className={td}>{p.method || '-'}</td><td className={td}>{p.status_label || p.status || '-'}</td><td className={td}>{p.paid_at || p.created_at || '-'}</td><td className={td}><button className="text-indigo-600 text-xs font-bold" onClick={async () => { const d = await fetch(`/api/admin/couriers/steadfast/payments/${encodeURIComponent(String(p.payment_id).replace(/\D/g, ''))}`, { headers: authGet() }).then(x => x.json()); setPayDetail(d); }}>ডিটেইল</button></td></tr>))}
          {sfPays.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6 text-sm">No data found</td></tr>}</tbody></table></div>
        <div className="flex gap-2 mt-4">
          <button disabled={sfPage <= 1} onClick={() => loadSf(sfPage - 1)} className="px-3 py-1.5 border rounded-lg text-sm font-bold disabled:opacity-50">← আগের</button>
          <button onClick={() => loadSf(sfPage + 1)} className="px-3 py-1.5 border rounded-lg text-sm font-bold">পরের →</button>
        </div>
        {payDetail && (() => {
          const pm: any = payDetail?.payment || payDetail?.data?.payment || payDetail?.data || {};
          const items: any[] = Array.isArray(pm?.consignments) ? pm.consignments : [];
          const tot = items.reduce((a: number, c: any) => a + Number(c.cod_amount || 0), 0);
          return (
          <div className="mt-4 bg-slate-50 rounded-2xl p-4 border border-slate-200">
            <div className="flex justify-between items-center mb-3"><b className="text-sm text-slate-800">পেআউট {pm.payment_id} — {items.length} পার্সেল</b><button className="text-rose-600 font-bold text-sm" onClick={() => setPayDetail(null)}>✕ বন্ধ</button></div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
              {[['টাকা', '৳' + Number(pm.amount ?? 0).toLocaleString()], ['মাধ্যম', pm.method || '-'], ['স্ট্যাটাস', pm.status_label || pm.status || '-'], ['চার্জ', '৳' + Number(pm.charges ?? 0).toLocaleString()], ['বকেয়া বিল', pm.due_bills ?? '-'], ['পরিশোধিত বিল', pm.paid_bills ?? '-'], ['তৈরি', String(pm.created_at || '-').slice(0, 16)], ['পেড', String(pm.paid_at || '-').slice(0, 16)]].map(([l, v]: any, i: number) => (
                <div key={i} className="bg-white rounded-xl px-3 py-2 border border-slate-100"><div className="text-[10px] text-slate-400">{l}</div><div className="text-sm font-bold text-slate-800">{v}</div></div>
              ))}
            </div>
            <div className="overflow-x-auto max-h-64 overflow-y-auto bg-white rounded-xl border border-slate-100"><table className="w-full">
              <thead><tr><th className={th}>Invoice</th><th className={th}>ক্রেতা</th><th className={th}>ফোন</th><th className={th}>COD</th><th className={th}>স্ট্যাটাস</th><th className={th}>ট্র্যাকিং</th></tr></thead>
              <tbody>{items.map((c: any) => (<tr key={c.consignment_id}><td className={td + ' font-mono'}>{c.invoice}</td><td className={td}>{c.recipient_name}</td><td className={td + ' font-mono'}>{c.recipient_phone}</td><td className={td + ' text-right'}>৳{Number(c.cod_amount || 0).toLocaleString()}</td><td className={td}><span className="bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full text-xs font-bold">{c.status}</span></td><td className={td + ' font-mono text-indigo-600'}>{c.tracking_code}</td></tr>))}
              {items.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-4 text-sm">পার্সেল পাওয়া যায়নি</td></tr>}</tbody>
              {items.length > 0 && <tfoot><tr><td colSpan={3} className={td + ' font-bold text-right'}>মোট COD</td><td className={td + ' text-right font-black text-green-700'}>৳{tot.toLocaleString()}</td><td colSpan={2}></td></tr></tfoot>}
            </table></div>
          </div>);
        })()}
      </div>
      </>)}
      {view === 'pickup' && (
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 max-w-xl">
        <h3 className="text-lg font-bold text-brand-navy mb-1">রাইডার ডাকুন (Pickup)</h3>
        <p className="text-xs text-slate-500 mb-4">একই ঠিকানায় pending থাকলে 409 আসবে — দুই রাইডার আসবে না।</p>
        <div className="space-y-3">
          <label className="text-xs text-gray-500">Address ID*<br /><input className={inp} value={pk.address_id} onChange={e => setPk({ ...pk, address_id: e.target.value })} placeholder="Steadfast address id" /></label>
          <label className="text-xs text-gray-500">থানা*<br /><select className={inp} value={pk.police_station_id} onChange={e => setPk({ ...pk, police_station_id: e.target.value })}><option value="">-- থানা বেছে নিন --</option>{stations.map((s: any) => (<option key={s.id} value={s.id}>{s.name} ({s.district_name || s.district})</option>))}</select></label>
          <label className="text-xs text-gray-500">ঠিকানা* (সর্বোচ্চ ২৫৫)<br /><input className={inp} value={pk.address} onChange={e => setPk({ ...pk, address: e.target.value })} /></label>
          <label className="text-xs text-gray-500">যোগাযোগ নম্বর* (013–019, ১১ ডিজিট)<br /><input className={inp} value={pk.contact_number} onChange={e => setPk({ ...pk, contact_number: e.target.value })} /></label>
          <label className="text-xs text-gray-500">আনুমানিক পার্সেল<br /><input type="number" className={inp} value={pk.estim_qty} onChange={e => setPk({ ...pk, estim_qty: e.target.value })} /></label>
          <label className="text-xs text-gray-500">নোট<br /><input className={inp} value={pk.note} onChange={e => setPk({ ...pk, note: e.target.value })} /></label>
          <button onClick={sendPickup} className="bg-brand-primary text-white px-5 py-2.5 rounded-xl text-sm font-bold">পিকআপ রিকোয়েস্ট পাঠান</button>
          {pkMsg && <div className="text-sm">{pkMsg}</div>}
        </div>
      </div>
      )}
    </div>
  );
}
