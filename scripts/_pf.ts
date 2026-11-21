/**
 * Print the exact string handed to the pool, escaped, plus what the pool
 * receives as args. If where.join() is correct at the call site but the pool
 * sees something else, the interpolation is being shadowed.
 */
import dotenv from 'dotenv';

dotenv.config({ override: true, quiet: true as true as any });

const dbmod: any = await import('/www/wwwroot/bunon.shop/server/db.ts');
const pool = dbmod.dbPool;
const orig = pool.query.bind(pool);

let done = false;
pool.query = async (sql: any, args?: any) => {
  const s = String(sql);
  if (!done && /FROM omnichannel_conversations c/.test(s)) {
    done = true;
    console.log('=== SQL length:', s.length);
    const wi = s.indexOf('LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id');
    console.log('=== AFTER THE JOIN ===');
    console.log(s.slice(wi, wi + 700));
    console.log('=== args ===', JSON.stringify(args));
  }
  return orig(sql, args);
};

const { listConversations } = await import('/www/wwwroot/bunon.shop/server/services/omnichannel.ts');
await listConversations({ search: 'zzzznope', limit: 60 });
process.exit(0);