/**
 * Monkey-patch the pool before the service imports it, so every SQL string the
 * service sends is captured. A hand-built equivalent returns 0 rows, so seeing
 * the real string is the fastest way to find the difference.
 */
import dotenv from 'dotenv';

dotenv.config({ override: true, quiet: true as true as any });

const dbmod: any = await import('/www/wwwroot/bunon.shop/server/db.ts');
const pool = dbmod.dbPool;
const origQuery = pool.query.bind(pool);
const origExecute = pool.execute?.bind(pool);

let n = 0;
pool.query = async (sql: any, args?: any) => {
  const id = ++n;
  const s = String(sql);
  if (/FROM omnichannel_conversations/i.test(s)) {
    console.log(`\n[Q${id}] omnichannel list query`);
    console.log('  ? count in sql :', (s.match(/\?/g) || []).length);
    console.log('  args length    :', Array.isArray(args) ? args.length : String(args));
    const w = s.split('WHERE')[1] || '';
    console.log('  WHERE tail     :', w.trim().slice(-160).replace(/\s+/g, ' '));
  }
  const res = await origQuery(sql, args);
  if (/FROM omnichannel_conversations/i.test(String(sql))) {
    const rows: any = Array.isArray(res) ? res[0] : (res as any)?.[0];
    console.log(`  -> rows returned:`, Array.isArray(rows) ? rows.length : 'n/a');
  }
  return res;
};

const { listConversations } = await import('/www/wwwroot/bunon.shop/server/services/omnichannel.ts');
console.log('=== calling listConversations({search: "zzzznope"}) ===');
const rows = await listConversations({ search: 'zzzznope', limit: 60 });
console.log('\n=== final rows:', rows.length);

process.exit(0);