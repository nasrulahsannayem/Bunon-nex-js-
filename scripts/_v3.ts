import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
const q = async (l: string, sql: string) => { const [r]: any = await dbPool.query(sql); console.log(l+':', JSON.stringify(r).slice(0,300)); };
await q('media backfilled', "SELECT message_type, COUNT(*) n, SUM(media_url IS NOT NULL AND media_url<>'') with_url FROM omnichannel_messages WHERE message_type<>'text' GROUP BY message_type");
await q('conv attachments', 'SELECT SUM(attachment_count>0) convs_with_media, COUNT(*) total FROM omnichannel_conversations');
await q('sample url', "SELECT LEFT(media_url,80) u FROM omnichannel_messages WHERE media_url IS NOT NULL LIMIT 1");
process.exit(0);
