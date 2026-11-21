/**
 * Print the WHERE and args listConversations actually hands to the pool.
 * The earlier probe showed where.length = 2 and args.length = 11, which is
 * correct — so the remaining suspect is the template itself: whether the
 * `${where.join(' AND ')}` interpolation survives into dist, or whether an
 * interpolated fragment shadows the prepared-statement args.
 */
import dotenv from 'dotenv';
import { dbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as true as any });

// rebuild the query exactly as the service does, then run it for real
const { listConversations } = await import('/www/wwwroot/bunon.shop/server/services/omnichannel.ts');
const rows = await listConversations({ search: 'zzzznope', limit: 60 });
console.log('service rows:', rows.length, '| first ids:', rows.slice(0, 3).map((r: any) => r.id));

// Now the SAME where clause, hand-built, against the pool
const like = '%zzzznope%';
const where = [
  'c.snoozed_until IS NULL OR c.snoozed_until <= NOW()',
  `(cu.display_name LIKE ? OR cu.primary_phone LIKE ? OR cu.primary_email LIKE ? OR
     c.last_message_preview LIKE ? OR c.external_conversation_id LIKE ? OR c.platform LIKE ?)`,
].join(' AND ');
const [a]: any = await dbPool.query(
  `SELECT c.id FROM omnichannel_conversations c
     LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id
    WHERE ${where} LIMIT 60`,
  [like, like, like, like, like, like]);
console.log('hand-built rows:', a.length);

// Compare against the service's own conversation set
console.log('service rows all id=30?', rows.every((r: any) => r.id === 30));

// Does the service maybe run a SECOND query and return that?
const [all]: any = await dbPool.query(
  `SELECT c.id FROM omnichannel_conversations c
     LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id
    WHERE (c.snoozed_until IS NULL OR c.snoozed_until <= NOW())
    ORDER BY COALESCE(c.last_message_at, c.created_at) DESC, c.unread_count DESC,
             FIELD(c.priority,'urgent','high','normal','low')
    LIMIT 60`);
console.log('unfiltered ordered rows:', all.length, '| ids:', all.slice(0, 3).map((r: any) => r.id));

process.exit(0);