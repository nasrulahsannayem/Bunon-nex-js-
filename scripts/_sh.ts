import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [r]: any = await dbPool.query("SELECT LEFT(raw_payload,420) p FROM omnichannel_messages WHERE message_type='image' AND (media_url IS NULL OR media_url='') LIMIT 2");
r.forEach((x:any,i:number)=>console.log('--- payload '+i+' ---\n'+x.p+'\n'));
const [c]: any = await dbPool.query("SELECT platform, COUNT(*) n FROM omnichannel_messages WHERE message_type='image' AND (media_url IS NULL OR media_url='') GROUP BY platform");
console.log('missing by platform:', JSON.stringify(c));
process.exit(0);
