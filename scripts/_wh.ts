import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
// the WhatsApp conversation that shows '· ·7283' -> find its customer
const [r]: any = await dbPool.query("SELECT c.id, c.customer_id, cu.display_name, cu.primary_phone FROM omnichannel_conversations c JOIN omnichannel_customers cu ON cu.id=c.customer_id WHERE c.platform='whatsapp' ORDER BY c.id DESC LIMIT 3");
console.log(JSON.stringify(r, null, 1));
// where does the WA phone actually live?
const [s]: any = await dbPool.query("SELECT external_id, external_username, display_name FROM omnichannel_customer_identities WHERE platform='whatsapp' LIMIT 3");
console.log('WA identities:', JSON.stringify(s));
process.exit(0);
