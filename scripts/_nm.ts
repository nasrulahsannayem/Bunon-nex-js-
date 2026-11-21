import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
// do message raw_payloads contain any sender name we discarded?
const [r]: any = await dbPool.query("SELECT raw_payload FROM omnichannel_messages WHERE raw_payload IS NOT NULL AND raw_payload LIKE '%sender%' LIMIT 3");
r.forEach((x:any,i:number)=>console.log('--- payload '+i+' ---\n'+String(x.raw_payload).slice(0,300)+'\n'));
const [s]: any = await dbPool.query('SHOW COLUMNS FROM omnichannel_messages LIKE "%name%"');
console.log('name columns on messages:', JSON.stringify(s));
process.exit(0);
