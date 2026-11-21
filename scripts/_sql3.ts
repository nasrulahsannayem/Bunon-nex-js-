import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const like='%zzzznope%';
const where=`(cu.display_name LIKE ? OR cu.primary_phone LIKE ?)`;
const [r]: any = await dbPool.query(
  \`SELECT c.id, cu.display_name, cu.primary_phone, cu.primary_email FROM omnichannel_conversations c
     LEFT JOIN omnichannel_customers cu ON cu.id=c.customer_id
     WHERE ${where} LIMIT 3\`, [like,like]);
console.log('display_name+phone matches:', r.length, JSON.stringify(r));
const [r2]: any = await dbPool.query(
  \`SELECT COUNT(*) n FROM omnichannel_conversations c LEFT JOIN omnichannel_customers cu ON cu.id=c.customer_id
     WHERE (c.snoozed_until IS NULL OR c.snoozed_until<=NOW())
       AND (cu.display_name LIKE ? OR cu.primary_phone LIKE ? OR cu.primary_email LIKE ?)`, [like,like,like]);
console.log('with email too:', r2[0].n);
// which branch actually matches?
const [r3]: any = await dbPool.query(
  \`SELECT cu.display_name, cu.primary_phone, cu.primary_email FROM omnichannel_conversations c
     LEFT JOIN omnichannel_customers cu ON cu.id=c.customer_id
     WHERE (c.snoozed_until IS NULL OR c.snoozed_until<=NOW()) AND cu.primary_phone LIKE ? LIMIT 3\`, [like]);
console.log('phone branch:', JSON.stringify(r3));
process.exit(0);
