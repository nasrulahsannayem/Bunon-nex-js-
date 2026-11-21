import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const q = async (label: string, sql: string) => {
  try { const [r]: any = await dbPool.query(sql); console.log('== '+label); console.log(JSON.stringify(r, null, 1).slice(0, 1200)); }
  catch (e: any) { console.log('== '+label+' ERROR: '+String(e.message).slice(0,140)); }
};
await q('identity columns', 'SHOW COLUMNS FROM omnichannel_customer_identities');
await q('fb identity sample', "SELECT * FROM omnichannel_customer_identities WHERE platform='facebook' LIMIT 3");
process.exit(0);
