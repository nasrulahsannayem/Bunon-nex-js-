import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const like='%zzzznope%';
// FULL SELECT exactly as the service builds it
const SEL = 'SELECT c.id FROM omnichannel_conversations c LEFT JOIN omnichannel_customers cu ON cu.id=c.customer_id WHERE ';
const SEARCH = `(
    cu.display_name LIKE ?
    OR cu.primary_phone LIKE ?
    OR cu.primary_email LIKE ?
    OR c.last_message_preview LIKE ?
    OR c.external_conversation_id LIKE ?
    OR c.platform LIKE ?
    OR EXISTS (SELECT 1 FROM omnichannel_conversation_tags t2 WHERE t2.conversation_id=c.id AND t2.tag LIKE ?)
    OR EXISTS (SELECT 1 FROM omnichannel_customer_identities ci WHERE ci.customer_id=c.customer_id AND (ci.external_username LIKE ? OR ci.external_id LIKE ?))
    OR EXISTS (SELECT 1 FROM bf_orders bo WHERE COALESCE(bo.phone,'')<>'' AND COALESCE(cu.primary_phone,'')<>'' AND CAST(REPLACE(REPLACE(REPLACE(bo.phone,'+',''),'-',''),' ','') AS BINARY)=CAST(REPLACE(REPLACE(REPLACE(cu.primary_phone,'+',''),'-',''),' ','') AS BINARY) AND (CAST(bo.id AS CHAR) LIKE ? OR bo.invoice LIKE ?))
  )`;
const base='(c.snoozed_until IS NULL OR c.snoozed_until <= NOW())';
const sql = SEL + base + ' AND ' + SEARCH;
console.log('? count in final sql:', (sql.match(/\?/g)||[]).length);
const args=new Array(11).fill(like);
try {
  const [r]: any = await dbPool.query(sql, args);
  console.log('rows:', r.length);
} catch(e:any){ console.log('ERR:', String(e.message).slice(0,200)); }
// now try WITHOUT the base snooze predicate
const sql2 = SEL + SEARCH;
console.log('? count without base:', (sql2.match(/\?/g)||[]).length);
const [r2]: any = await dbPool.query(sql2, args);
console.log('rows without base predicate:', r2.length);
process.exit(0);
