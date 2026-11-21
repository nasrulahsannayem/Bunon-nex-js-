import dotenv from 'dotenv';
import { dbPool } from '../server/db';
import { fetchProfile } from '../server/services/channelProfile';
dotenv.config({ override: true, quiet: true as true as any });
const [r]: any = await dbPool.query("SELECT platform, external_id FROM omnichannel_customer_identities WHERE platform='facebook' AND display_name IS NOT NULL LIMIT 2");
for (const x of r) {
  console.log('---', x.platform, x.external_id);
  console.log('   ', JSON.stringify(await fetchProfile(x.platform, x.external_id)));
}
process.exit(0);
