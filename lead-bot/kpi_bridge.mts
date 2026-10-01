import { fetchOrderStats, fetchMetaStats } from '../server/services/dailyKpi.ts';

// Bridge: lead-bot calls canonical KPI engine, prints JSON. Read-only.
const [fn, a, b] = process.argv.slice(2);
try {
  if (fn === 'orders') console.log(JSON.stringify(await fetchOrderStats(a)));
  else if (fn === 'meta') console.log(JSON.stringify(await fetchMetaStats(a, b || undefined)));
  else { console.log(JSON.stringify({ error: 'unknown fn' })); process.exit(1); }
  process.exit(0);
} catch (e: any) {
  console.log(JSON.stringify({ error: String(e?.message || e) }));
  process.exit(1);
}
