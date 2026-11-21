import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const [r]: any = await dbPool.query("SELECT display_name, primary_phone FROM omnichannel_customers WHERE primary_phone IS NOT NULL AND primary_phone<>'' AND (display_name REGEXP '^[0-9]{9,}$' OR display_name IS NULL) LIMIT 3");
console.log(JSON.stringify(r));
process.exit(0);
