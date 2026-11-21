import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [a]: any = await dbPool.query("SELECT COUNT(*) n FROM omnichannel_messages WHERE media_url LIKE '%fbcdn%'");
console.log('fb media rows:', a[0].n);
// test how many are still alive
const [b]: any = await dbPool.query("SELECT media_url FROM omnichannel_messages WHERE media_url LIKE '%fbcdn%' LIMIT 12");
let alive=0, dead=0;
for (const x of b) { const c=await fetch(x.media_url,{method:'HEAD'}).then(r=>r.status).catch(()=>0); if(c===200)alive++; else dead++; }
console.log('sample of '+b.length+': alive='+alive+' dead='+dead);
process.exit(0);
