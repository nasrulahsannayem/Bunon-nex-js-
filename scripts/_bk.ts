import dotenv from 'dotenv';
import fs from 'fs';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const tables = ['omnichannel_messages','omnichannel_conversations','omnichannel_customer_identities'];
const dir = '/opt/data/backups';
fs.mkdirSync(dir, { recursive: true });
for (const t of tables) {
  const [r]: any = await dbPool.query('SHOW CREATE TABLE ' + t);
  const path = dir + '/pre_0003_' + t + '.sql';
  fs.writeFileSync(path, r[0]['Create Table'] + ';\n');
  console.log('schema saved:', path);
}
process.exit(0);
