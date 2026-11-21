/**
 * Backfill media_url for the 90 WhatsApp image messages that have none.
 *
 * Their raw_payload stores `media_path` (a local relative path), not a URL:
 *   {"media_path":"uploads/wa/in_1790394611775_g2h4i0.jpg", ...}
 *
 * The files live in dash.bunonfabrics.com/planner/uploads/wa, which is a
 * different vhost, so the path cannot simply be prefixed with this app's
 * origin. Two options exist:
 *
 *   1. rewrite to that origin directly — simplest, but couples this app's
 *      message history to another site's document root, and breaks if that
 *      vhost moves;
 *   2. serve them through this app's own existing media route.
 *
 * Go with (1) but store the absolute URL, since the file already exists and
 * re-hosting 90 files to gain isolation is not worth it now. The durable fix
 * is a migration that copies the directory under this app — noted below.
 */

import dotenv from 'dotenv';
import { dbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as true as any });

const WA_ORIGIN = 'https://dash.bunonfabrics.com/planner';

const [rows]: any = await dbPool.query(
  `SELECT id, raw_payload FROM omnichannel_messages
    WHERE (media_url IS NULL OR media_url = '')
      AND message_type IN ('image','video','audio','document','sticker')
      AND raw_payload IS NOT NULL
      AND JSON_EXTRACT(raw_payload, '$.media_path') IS NOT NULL`);

console.log('rows to backfill:', rows.length);

let ok = 0;
let bad = 0;
for (const r of rows) {
  let rel: string | null = null;
  try {
    const p = JSON.parse(r.raw_payload);
    rel = typeof p?.media_path === 'string' ? p.media_path : null;
  } catch { rel = null; }
  if (!rel) { bad++; continue; }

  const url = rel.startsWith('http') ? rel : `${WA_ORIGIN}/${rel.replace(/^\/+/, '')}`;
  await dbPool.query('UPDATE omnichannel_messages SET media_url = ? WHERE id = ?', [url, r.id]);
  ok++;
}
console.log(`backfilled ${ok}, skipped ${bad}`);

// refresh the conversation rollups so the list badges match
const [upd]: any = await dbPool.query(
  `UPDATE omnichannel_conversations c
      SET c.attachment_count = (
            SELECT COUNT(*) FROM omnichannel_messages m
             WHERE m.conversation_id = c.id AND m.media_url IS NOT NULL AND m.media_url <> ''),
          c.last_media_url = (
            SELECT m.media_url FROM omnichannel_messages m
             WHERE m.conversation_id = c.id AND m.media_url IS NOT NULL AND m.media_url <> ''
             ORDER BY m.sent_at DESC LIMIT 1)`);
console.log('conversation rollups updated:', (upd as any)?.affectedRows);

const [check]: any = await dbPool.query(
  `SELECT message_type,
          COUNT(*) n,
          SUM(media_url IS NOT NULL AND media_url <> '') with_url
     FROM omnichannel_messages
    WHERE message_type <> 'text'
    GROUP BY message_type`);
console.log('final media coverage:', JSON.stringify(check));

const [conv]: any = await dbPool.query(
  'SELECT SUM(attachment_count > 0) convs_with_media, COUNT(*) total FROM omnichannel_conversations');
console.log('conversations with media:', JSON.stringify(conv));

process.exit(0);