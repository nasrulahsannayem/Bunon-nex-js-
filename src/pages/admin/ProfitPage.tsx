import { useEffect, useMemo, useState } from 'react';
import { StatCard, SectionHeader, StatusPill } from '../../components/admin/ui';


const auth = () => ({ 'Content-Type': 'application/json', 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` });
const authGet = () => ({ 'Authorization': `Bearer ${localStorage.getItem('bunon_token')}` });
const num = (v: any) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
const today = () => new Date().toISOString().slice(0, 10);

export default function ProfitPage() {
  const [period, setPeriod] = useState('week');
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState(today());
  const [records, setRecords] = useState<any[]>([]);
  const [income, setIncome] = useState(0);
  const [expense, setExpense] = useState(0);
  const [net, setNet] = useState(0);
  const [delivered, setDelivered] = useState('');
  const [avgCost, setAvgCost] = useState('120');
  const [loading, setLoading] = useState(false);
  // save form
  const [f, setF] = useState({ record_date: today(), total_cost: '', total_sell: '', total_units: '', total_parcels: '', ads_usd: '', ads_bdt: '', net_profit: '' });

  const load = async () => {
    setLoading(true);
    try {
      let url = `/api/admin/profit?period=${period}`;
      if (period === 'custom') url += `&start=${start}&end=${end}`;
      const r = await fetch(url, { headers: authGet() }).then(x => x.json());
      setRecords(r.records || []);
      setIncome(num(r.income)); setExpense(num(r.expense)); setNet(num(r.net));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const agg = useMemo(() => {
    let c = 0, s = 0, u = 0, au = 0, ab = 0, np = 0, p = 0;
    for (const r of records) {
      c += num(r.total_cost); s += num(r.total_sell); u += parseInt(r.total_units || 0, 10);
      au += num(r.ads_usd); ab += num(r.ads_bdt); np += num(r.net_profit);
      p += parseInt(r.total_parcels ?? r.total_units ?? 0, 10);
    }
    const date = records.length ? (records[records.length-1].record_date === records[0].record_date ? records[0].record_date : `${records[records.length-1].record_date} → ${records[0].record_date}`) : 'N/A';
    return { date, c, s, u, au, ab, np, p };
  }, [records]);

  const del = num(delivered); const avg = num(avgCost);
  const cprBdt = del > 0 ? agg.ab / del : 0;
  const cprUsd = del > 0 ? agg.au / del : 0;
  const realProfit = net - del * avg;

  const save = async () => {
    if (!f.record_date) return alert('Enter a date.');
    const payload = { record_date: f.record_date, amount: num(f.net_profit), description: 'Daily Net Profit', created_by: 'system',
      total_cost: f.total_cost, total_sell: f.total_sell, total_units: f.total_units, total_parcels: f.total_parcels || f.total_units,
      cpr_unit: '', cpr_parcel: cprBdt.toFixed(2), ads_usd: f.ads_usd, ads_bdt: f.ads_bdt, net_profit: f.net_profit };
    const r = await fetch('/api/admin/profit', { method: 'POST', headers: auth(), body: JSON.stringify(payload) }).then(x => x.json()).catch(() => ({}));
    alert(r.msg || (r.success ? 'Saved' : 'Failed'));
    if (r.ok || r.success) load();
  };

  const th = 'px-2 py-1.5 text-left text-xs font-semibold text-gray-500 uppercase border-b';
  const td = 'px-2 py-1.5 text-sm border-b border-gray-100';
  const inp = 'border rounded-lg px-2 py-1.5 text-sm w-full outline-none focus:border-brand-primary';
  const set = (k: string) => (e: any) => setF({ ...f, [k]: e.target.value });

  return (
    <div className="space-y-6 pb-10">
      <SectionHeader title="Profit" sub="Period summary, CPR and real profit" right={<>
        <div className="flex gap-2 overflow-x-auto no-scrollbar md:flex-wrap md:overflow-visible pb-1 -mx-1 px-1">
          <label className="shrink-0 whitespace-nowrap text-xs text-gray-500">Period<br />
            <select value={period} onChange={e => setPeriod(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm">
              <option value="today">Today</option><option value="yesterday">Yesterday</option><option value="week">This Week</option>
              <option value="month">This Month</option><option value="year">This Year</option><option value="all">All</option><option value="custom">Custom</option>
            </select></label>
          {period === 'custom' && (<>
            <label className="shrink-0 whitespace-nowrap text-xs text-gray-500">Start<br /><input type="date" value={start} onChange={e => setStart(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></label>
            <label className="shrink-0 whitespace-nowrap text-xs text-gray-500">End<br /><input type="date" value={end} onChange={e => setEnd(e.target.value)} className="border rounded-lg px-2 py-1.5 text-sm" /></label>
          </>)}
          <button onClick={load} className="shrink-0 bg-brand-primary text-white px-4 py-2 rounded-xl text-sm font-bold">Refresh</button>
        </div>
      </>} />

      {loading && <div className="text-center text-gray-400 animate-pulse">Loading...</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard title="Total Income" value={typeof income === 'number' ? income.toFixed(2) : income} tone="sales" />
        <StatCard title="Total Expense" value={typeof expense === 'number' ? expense.toFixed(2) : expense} tone="alert" />
        <StatCard title="Net" value={typeof net === 'number' ? net.toFixed(2) : net} tone="revenue" />
        <StatCard title="Total Parcels" value={agg.p} tone="orders" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-brand-navy mb-4">Saved Summary</h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {[['Date', agg.date], ['Total Cost', agg.c.toFixed(2)], ['Total Sales', agg.s.toFixed(2)], ['Total Units', agg.u],
              ['Ads (BDT)', agg.ab.toFixed(2)], ['Ads (USD)', agg.au.toFixed(2)], ['Net Profit', agg.np.toFixed(2)], ['Total Parcels', agg.p]].map(([l, v]: any, i: number) => (
              <div key={i} className="flex justify-between border-b py-1.5"><span className="text-gray-500">{l}</span><b>{v}</b></div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <label className="text-xs text-gray-500">Delivered Parcels<br /><input id="psDelivered" type="number" value={delivered} onChange={e => setDelivered(e.target.value)} className={inp} placeholder="0" /></label>
            <label className="text-xs text-gray-500">Avg. Delivery Cost (৳)<br /><input id="avgDeliveryCost" type="number" value={avgCost} onChange={e => setAvgCost(e.target.value)} className={inp} /></label>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm mt-3">
            <div className="bg-gray-50 rounded-xl p-3 text-center"><div className="text-xs text-gray-500">CPR/Parcel</div><b>{cprBdt.toFixed(2)}</b></div>
            <div className="bg-gray-50 rounded-xl p-3 text-center"><div className="text-xs text-gray-500">CPR (USD)</div><b>{cprUsd.toFixed(2)}</b></div>
            <div className="bg-green-50 rounded-xl p-3 text-center"><div className="text-xs text-gray-500">Real Profit</div><b className="text-green-700">{realProfit.toFixed(2)}</b></div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
          <h3 className="text-lg font-bold text-brand-navy mb-4">Save Net Profit</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-gray-500">Date<br /><input type="date" value={f.record_date} onChange={set('record_date')} className={inp} /></label>
            <label className="text-xs text-gray-500">Total Cost<br /><input value={f.total_cost} onChange={set('total_cost')} className={inp} placeholder="0" /></label>
            <label className="text-xs text-gray-500">Total Sales<br /><input value={f.total_sell} onChange={set('total_sell')} className={inp} placeholder="0" /></label>
            <label className="text-xs text-gray-500">Total Units<br /><input value={f.total_units} onChange={set('total_units')} className={inp} placeholder="0" /></label>
            <label className="text-xs text-gray-500">Total Parcels<br /><input value={f.total_parcels} onChange={set('total_parcels')} className={inp} placeholder="0" /></label>
            <label className="text-xs text-gray-500">Ads USD<br /><input value={f.ads_usd} onChange={set('ads_usd')} className={inp} placeholder="0" /></label>
            <label className="text-xs text-gray-500">Ads BDT<br /><input value={f.ads_bdt} onChange={set('ads_bdt')} className={inp} placeholder="0" /></label>
            <label className="text-xs text-gray-500">Net Profit<br /><input value={f.net_profit} onChange={set('net_profit')} className={inp} placeholder="0" /></label>
          </div>
          <button onClick={save} className="mt-3 w-full bg-brand-primary text-white px-4 py-2.5 rounded-xl text-sm font-bold">Save</button>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-brand-navy mb-4">Records ({records.length})</h3>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full min-w-[560px]"><thead><tr><th className={th}>Date</th><th className={th}>Type</th><th className={th}>Description</th><th className={th}>Amount</th><th className={th}>Net Profit</th><th className={th}>Parcels</th></tr></thead>
          <tbody>{records.map((r: any) => (
            <tr key={r.id}><td className={td}>{r.record_date}</td><td className={td}><StatusPill status={r.type} /></td><td className={td}>{r.description || ''}</td>
            <td className={td + ' text-right'}>{num(r.amount).toFixed(2)}</td><td className={td + ' text-right'}>{num(r.net_profit).toFixed(2)}</td><td className={td + ' text-right'}>{r.total_parcels ?? r.total_units ?? '-'}</td></tr>
          ))}
          {records.length === 0 && <tr><td colSpan={6} className="text-center text-gray-400 py-6 text-sm">No records found</td></tr>}</tbody></table>
        </div>
      </div>
    </div>
  );
}
