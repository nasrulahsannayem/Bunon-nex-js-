import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
// reproduce the EXACT where block from the service
const f = { search: 'zzzznope' };
const where: string[] = ["c.snoozed_until IS NULL OR c.snoozed_until <= NOW()"];
const args: any[] = [];
if (f.search) {
  where.push(`(
    cu.display_name LIKE ?
    OR cu.primary_phone LIKE ?
    OR cu.primary_email LIKE ?
    OR c.last_message_preview LIKE ?
    OR c.external_conversation_id LIKE ?
    OR c.platform LIKE ?
    OR EXISTS (SELECT 1 FROM omnichannel_conversation_tags t2
                WHERE t2.conversation_id = c.id AND t2.tag LIKE ?)
    OR EXISTS (SELECT 1 FROM omnichannel_customer_identities ci
                WHERE ci.customer_id = c.customer_id
                  AND (ci.external_username LIKE ? OR ci.external_id LIKE ?))
    OR EXISTS (SELECT 1 FROM bf_orders bo
                WHERE COALESCE(bo.phone,'') <> '' AND COALESCE(cu.primary_phone,'') <> '' AND CAST(REPLACE(REPLACE(REPLACE(bo.phone,'+',''),'-',''),' ','') AS BINARY) =
                      CAST(REPLACE(REPLACE(REPLACE(cu.primary_phone,'+',''),'-',''),' ','') AS BINARY)
                  AND (CAST(bo.id AS CHAR) LIKE ? OR bo.invoice LIKE ?))
  )`);
  const like = `%${f.search}%`;
  args.push(like, like, like, like, like, like, like, like, like, like, like);
}
console.log('placeholders in WHERE:', where.join(' AND ').split('?').length - 1);
console.log('args provided        :', args.length);
try {
  const [r]: any = await dbPool.query(
    `SELECT c.id FROM omnichannel_conversations c LEFT JOIN omnichannel_customers cu ON cu.id=c.customer_id WHERE ${where.join(' AND ')} LIMIT 5`, args);
  console.log('QUERY OK, rows:', r.length);
} catch(e:any){ console.log('QUERY ERROR:', String(e.message).slice(0,300)); }
process.exit(0);
