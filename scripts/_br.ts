/**
 * Which OR branch is letting a nonsense term through? Isolate them one at a
 * time against the real tables.
 */
import dotenv from 'dotenv';
import { dbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as true as any });
const like = '%zzzznope%';

const branches: [string, string, number][] = [
  ['display_name', 'cu.display_name LIKE ?', 1],
  ['primary_phone', 'cu.primary_phone LIKE ?', 1],
  ['primary_email', 'cu.primary_email LIKE ?', 1],
  ['preview', 'c.last_message_preview LIKE ?', 1],
  ['ext_conv_id', 'c.external_conversation_id LIKE ?', 1],
  ['platform', 'c.platform LIKE ?', 1],
];

for (const [name, cond, n] of branches) {
  const [r]: any = await dbPool.query(
    `SELECT COUNT(*) n FROM omnichannel_conversations c
       LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id
      WHERE (c.snoozed_until IS NULL OR c.snoozed_until <= NOW()) AND ${cond}`,
    new Array(n).fill(like));
  console.log(`  ${name.padEnd(14)} -> ${r[0].n} rows`);
}

// the two EXISTS branches
const [e1]: any = await dbPool.query(
  `SELECT COUNT(*) n FROM omnichannel_conversations c
     LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id
    WHERE (c.snoozed_until IS NULL OR c.snoozed_until <= NOW())
      AND EXISTS (SELECT 1 FROM omnichannel_conversation_tags t2
                   WHERE t2.conversation_id = c.id AND t2.tag LIKE ?)`,
  [like]);
console.log(`  ${'tag EXISTS'.padEnd(14)} -> ${e1[0].n} rows`);

const [e2]: any = await dbPool.query(
  `SELECT COUNT(*) n FROM omnichannel_conversations c
     LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id
    WHERE (c.snoozed_until IS NULL OR c.snoozed_until <= NOW())
      AND EXISTS (SELECT 1 FROM omnichannel_customer_identities ci
                   WHERE ci.customer_id = c.customer_id
                     AND (ci.external_username LIKE ? OR ci.external_id LIKE ?))`,
  [like, like]);
console.log(`  ${'identity EXISTS'.padEnd(14)} -> ${e2[0].n} rows`);

// the bf_orders branch — the suspect: it matches by phone EQUALITY, and the
// LIKE only applies to the order id/invoice, so a nonsense term should not
// match... unless the phone-normalised equality is matching everything.
const [e3]: any = await dbPool.query(
  `SELECT COUNT(*) n FROM omnichannel_conversations c
     LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id
    WHERE (c.snoozed_until IS NULL OR c.snoozed_until <= NOW())
      AND EXISTS (SELECT 1 FROM bf_orders bo
                   WHERE COALESCE(bo.phone,'') <> '' AND COALESCE(cu.primary_phone,'') <> ''
                     AND CAST(REPLACE(REPLACE(REPLACE(bo.phone,'+',''),'-',''),' ','') AS BINARY) =
                           CAST(REPLACE(REPLACE(REPLACE(cu.primary_phone,'+',''),'-',''),' ','') AS BINARY)
                     AND (CAST(bo.id AS CHAR) LIKE ? OR bo.invoice LIKE ?))`,
  [like, like]);
console.log(`  ${'bf_orders EXISTS'.padEnd(14)} -> ${e3[0].n} rows`);

console.log('\n--- bf_orders shape ---');
const [cols]: any = await dbPool.query('SHOW COLUMNS FROM bf_orders');
console.log('  columns:', cols.map((c: any) => c.Field).join(', '));
const [n]: any = await dbPool.query('SELECT COUNT(*) n FROM bf_orders');
console.log('  rows:', n[0].n);

process.exit(0);