import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const { listConversations } = await import('../server/services/omnichannel');
const r: any = await listConversations({ search: 'zzzznope', limit: 60 });
console.log('service rows with nonsense search:', r.length);
console.log('sample:', JSON.stringify(r[0]||{}).slice(0,150));
const [m]: any = await dbPool.query(
  "SELECT COUNT(*) n FROM omnichannel_conversations c LEFT JOIN omnichannel_customers cu ON cu.id=c.customer_id WHERE (c.snoozed_until IS NULL OR c.snoozed_until<=NOW()) AND (cu.display_name LIKE '%zzzznope%' OR cu.primary_phone LIKE '%zzzznope%')");
console.log('rows that SHOULD match:', m[0].n);
// what does the filter object look like coming from the route?
const [t]: any = await dbPool.query('SELECT COUNT(*) n FROM omnichannel_conversations');
console.log('total conversations:', t[0].n);
process.exit(0);
