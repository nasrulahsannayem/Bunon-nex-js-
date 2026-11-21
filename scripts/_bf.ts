import dotenv from 'dotenv';
import { backfillProfiles } from '../server/services/channelProfile';
dotenv.config({ override: true, quiet: true as true as any });
console.log(JSON.stringify(await backfillProfiles({ batch: 25, delayMs: 300 })));
process.exit(0);
