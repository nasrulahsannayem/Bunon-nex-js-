import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const svc: any = await import('../server/services/omnichannel');
// 1. does the compiled function see search at all?
const src = (await import('fs')).readFileSync('server/services/omnichannel.ts','utf8');
const i = src.indexOf('if (f.search)');
console.log('search block present in source:', i > 0);
console.log(src.slice(i, i+120).split('\n').map((l:string)=>'   '+l).join('\n'));
// 2. run the exact WHERE by hand
const like='%8801%';
try {
  const [r]: any = await dbPool.query(
    `SELECT COUNT(*) n FROM omnichannel_conversations c
       LEFT JOIN omnichannel_customers cu ON cu.id=c.customer_id
      WHERE (c.snoozed_until IS NULL OR c.snoozed_until <= NOW())
        AND (cu.display_name LIKE ? OR cu.primary_phone LIKE ?)`,
    [like, like]);
  console.log('manual LIKE count:', r[0].n);
} catch(e:any){ console.log('manual SQL err:', String(e.message).slice(0,160)); }
// 3. call the service with a guaranteed-nonsense term
const a: any = await svc.listConversations({ search: 'zzzznope', limit: 60 });
console.log('service zzz rows:', (a?.length ?? a?.conversations?.length ?? JSON.stringify(a).slice(0,80)));
process.exit(0);
