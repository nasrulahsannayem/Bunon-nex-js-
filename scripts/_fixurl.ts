import dotenv from 'dotenv';
import { dbPool } from '../server/db';
dotenv.config({ override: true, quiet: true as true as any });
// nginx root for dash.bunonfabrics.com is /planner, so the public path has no
// /planner prefix -- it was in the stored URL and 404'd on every request
const [r]: any = await dbPool.query(
  "UPDATE omnichannel_messages SET media_url = REPLACE(media_url, 'https://dash.bunonfabrics.com/planner/uploads/', 'https://dash.bunonfabrics.com/uploads/') WHERE media_url LIKE 'https://dash.bunonfabrics.com/planner/uploads/%'");
console.log('rows fixed:', (r as any).affectedRows);
await dbPool.query("UPDATE omnichannel_conversations c SET c.last_media_url = (SELECT m.media_url FROM omnichannel_messages m WHERE m.conversation_id=c.id AND m.media_url IS NOT NULL AND m.media_url<>'' ORDER BY m.sent_at DESC LIMIT 1)");
const [s]: any = await dbPool.query("SELECT media_url FROM omnichannel_messages WHERE platform='whatsapp' AND media_url LIKE '%/uploads/wa/%' LIMIT 4");
for (const x of s) {
  const code = await fetch(x.media_url, { method: 'HEAD' }).then(r=>r.status).catch(()=>0);
  console.log(' ', code, x.media_url.slice(-46));
}
process.exit(0);
