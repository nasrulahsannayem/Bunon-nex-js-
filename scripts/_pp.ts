/**
 * The individual OR branches each return 0 for a nonsense term, yet the whole
 * parenthesised group returns every row. That means the SQL text itself is
 * different from what the branch test used — most likely an unbalanced paren
 * making the bf_orders EXISTS escape the OR group and become its own AND-ed
 * predicate that is true for every conversation.
 *
 * Print the assembled clause and count the parens.
 */
import dotenv from 'dotenv';
import { dbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as true as any });

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
    /* Orders live in the EXISTING bf_orders table. Matching on phone keeps
       this to a correlated subquery — no join, no second order system. */
    OR EXISTS (SELECT 1 FROM bf_orders bo
                WHERE COALESCE(bo.phone,'') <> '' AND COALESCE(cu.primary_phone,'') <> '' AND CAST(REPLACE(REPLACE(REPLACE(bo.phone,'+',''),'-',''),' ','') AS BINARY) =
                      CAST(REPLACE(REPLACE(REPLACE(cu.primary_phone,'+',''),'-',''),' ','') AS BINARY)
                  AND (CAST(bo.id AS CHAR) LIKE ? OR bo.invoice LIKE ?))
  )`);
  const like = `%${f.search}%`;
  args.push(like, like, like, like, like, like, like, like, like, like, like);
}

const joined = where.join(' AND ');
const paren = (s: string) => (s.match(/\(/g) || []).length - (s.match(/\)/g) || []).length;
console.log('outer paren balance:', paren(joined));

const [rows]: any = await dbPool.query(
  `SELECT c.id FROM omnichannel_conversations c
     LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id
    WHERE ${joined}
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.unread_count DESC,
             FIELD(c.priority,'urgent','high','normal','low')
    LIMIT 60`,
  args);
console.log('full block rows:', rows.length, '(expected 0)');

// bisect: drop the bf_orders branch only
const noOrders = joined.replace(/OR EXISTS \(SELECT 1 FROM bf_orders[\s\S]*?bo\.invoice LIKE \?\)\)/, '');
console.log('bf_orders removed -> paren balance:', paren(noOrders));
const [r2]: any = await dbPool.query(
  `SELECT c.id FROM omnichannel_conversations c
     LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id
    WHERE ${noOrders} LIMIT 60`,
  args.slice(0, 9));
console.log('without bf_orders rows:', r2.length, '(expected 0)');

process.exit(0);