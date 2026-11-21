import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
for (const sql of [
  "SHOW COLUMNS FROM omnichannel_messages LIKE 'media%'",
  "SHOW COLUMNS FROM omnichannel_conversations LIKE 'attachment%'",
  "SHOW COLUMNS FROM omnichannel_customer_identities LIKE 'avatar%'",
  "SELECT * FROM bunon_schema_migrations WHERE id='0003'",
]) {
  try { const [r]: any = await dbPool.query(sql); console.log('OK ', sql.slice(38,70), '->', r.length, 'rows'); }
  catch (e: any) { console.log('FAIL', sql.slice(38,70), '->', String(e.message).slice(0,120)); }
}
process.exit(0);
