import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [cols]: any = await dbPool.query('SHOW COLUMNS FROM omnichannel_messages');
console.log('message columns:', cols.map((c:any)=>c.Field).join(', '));
const [img]: any = await dbPool.query("SELECT * FROM omnichannel_messages WHERE message_type='image' LIMIT 2");
console.log('\nimage rows:', JSON.stringify(img, null, 1).slice(0, 1400));
process.exit(0);
