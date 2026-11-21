/**
 * The WhatsApp media_path stored in raw_payload has no file extension, but the
 * file on disk does (in_1790394611775_g2h4i0.jpg). Serving the extension-less
 * path returns 404, which is why every WhatsApp bubble rendered blank.
 *
 * Rebuild media_url by matching the basename against the real directory, so
 * the correct extension is picked up from the filesystem rather than guessed.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { dbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as true as any });

const DIR = '/www/wwwroot/dash.bunonfabrics.com/planner/uploads/wa';
const ORIGIN = 'https://dash.bunonfabrics.com/planner';

// basename -> full filename, so "in_123_abc" resolves to "in_123_abc.jpg"
let index = new Map<string, string>();
try {
  for (const f of fs.readdirSync(DIR)) {
    const ext = path.extname(f);
    index.set(ext ? f.slice(0, -(ext.length)) : f, f);
  }
  console.log('indexed files:', index.size);
} catch (e: any) {
  console.log('CANNOT READ DIR:', String(e.message).slice(0, 120));
  process.exit(1);
}

const [rows]: any = await dbPool.query(
  `SELECT id, media_url, raw_payload FROM omnichannel_messages
    WHERE platform = 'whatsapp'
      AND media_url LIKE '${ORIGIN}/%'`);

console.log('whatsapp rows with a url:', rows.length);

let fixed = 0;
let missing = 0;
for (const r of rows) {
  const url: string = r.media_url;
  let rel = url.replace(ORIGIN + '/', '');
  // rel is 'uploads/wa/<file>' but the index keys on the bare filename
  rel = rel.split('/').pop() || rel;
  // already correct?
  if (fs.existsSync(path.join(DIR, rel))) continue;

  const base = rel.replace(/\.[a-z0-9]{2,5}$/i, '');
  const real = index.get(base);
  if (real) {
    const next = ORIGIN + '/' + real;
    if (next !== url) {
      await dbPool.query('UPDATE omnichannel_messages SET media_url = ? WHERE id = ?', [next, r.id]);
      fixed++;
    }
  } else {
    missing++;
    if (missing <= 3) console.log('  no file for:', rel);
  }
}

console.log(`fixed ${fixed}, still missing ${missing}`);

// refresh conversation rollups
await dbPool.query(
  `UPDATE omnichannel_conversations c
      SET c.last_media_url = (
            SELECT m.media_url FROM omnichannel_messages m
             WHERE m.conversation_id = c.id AND m.media_url IS NOT NULL AND m.media_url <> ''
             ORDER BY m.sent_at DESC LIMIT 1)`);

// verify a sample over HTTP
const [sample]: any = await dbPool.query(
  `SELECT media_url FROM omnichannel_messages
    WHERE platform='whatsapp' AND media_url IS NOT NULL AND media_url <> '' LIMIT 4`);
for (const s of sample) {
  const code = await fetch(s.media_url, { method: 'HEAD' }).then((r) => r.status).catch(() => 0);
  console.log(' ', code, s.media_url.slice(-52));
}
process.exit(0);