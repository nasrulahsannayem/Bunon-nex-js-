/**
 * scripts/backfill_omnichannel.ts
 *
 * One-off, idempotent backfill of the two already-productive legacy sources
 * into the new omnichannel tables. Safe to re-run: every insert goes through
 * the service's dedupe path, which is backed by a DB UNIQUE key on
 * (platform, external_message_id).
 *
 *   bunon_inbox_log   → facebook  (messenger + comments + posts)
 *   bf_wa_messages    → whatsapp (in/out, text + media)
 */
import dotenv from 'dotenv';
import { dbPool, productDbPool } from '../server/db';

dotenv.config({ override: true, quiet: true as any });

const DRY = process.argv.includes('--dry-run') || process.env.DRY_RUN === '1';

// main = the NEW omnichannel store + legacy WhatsApp (bunonfabrics_dash_db)
// fb    = legacy Facebook inbox log                              (bunon_shop_db)
const main = dbPool;
const fb = productDbPool;

const normPhone = (raw: unknown): string | null => {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (/^01\d{9}$/.test(d)) d = '880' + d.slice(1);
  else if (/^1\d{9}$/.test(d)) d = '880' + d;
  return /^8801\d{9}$/.test(d) ? d : null;
};

const PLACEHOLDER_PAGE = '117184704704594';
const CHANNEL_LABEL: Record<string, { platform: string; label: string; messageType: string }> = {
  facebook:          { platform: 'facebook', label: 'Facebook',        messageType: 'text' },
  messenger:         { platform: 'facebook', label: 'Facebook',        messageType: 'text' },
  facebook_comment:  { platform: 'facebook', label: 'FB Comment',      messageType: 'text' },
  facebook_post:     { platform: 'facebook', label: 'FB Post',         messageType: 'text' },
  instagram:         { platform: 'instagram', label: 'Instagram',      messageType: 'text' },
  instagram_comment: { platform: 'instagram', label: 'IG Comment',      messageType: 'text' },
  whatsapp:          { platform: 'whatsapp', label: 'WhatsApp',        messageType: 'text' },
};

/* ── read helpers ─────────────────────────────────────────────────── */

const [fbRows] = await fb.query(
  'SELECT * FROM bunon_inbox_log WHERE sender_id IS NOT NULL AND sender_id <> "" ORDER BY id ASC'
);
const [waRows] = await main.query(
  'SELECT * FROM bf_wa_messages WHERE phone IS NOT NULL AND phone <> "" ORDER BY id ASC'
);

console.log(`legacy: facebook ${(fbRows as any[]).length} rows, whatsapp ${(waRows as any[]).length} rows`);
if (DRY) { console.log('DRY RUN — nothing written'); process.exit(0); }

const [[before]]: any = await main.query('SELECT COUNT(*) c FROM omnichannel_messages');
console.log('omnichannel_messages before =', before.c);

/* ── upsert customer ──────────────────────────────────────────────── */

const customerByIdentity = new Map<string, number>();
const [existingIds] = await main.query(
  'SELECT customer_id, platform, external_id FROM omnichannel_customer_identities'
);
for (const e of existingIds as any[]) customerByIdentity.set(`${e.platform}:${e.external_id}`, e.customer_id);

const customerCache = new Map<string, number>(); // phone -> customer_id

async function upsertCustomer(
  platform: string, externalId: string, phone: string | null, displayName: string | null
): Promise<number> {
  const key = `${platform}:${externalId}`;
  const hit = customerByIdentity.get(key);
  if (hit) return hit;

  const cKey = phone || `id:${externalId}`;
  const cached = customerCache.get(cKey);
  if (cached) {
    await linkIdentity(cached, platform, externalId, displayName);
    return cached;
  }

  const [ins]: any = await main.query(
    `INSERT INTO omnichannel_customers (display_name, primary_phone, created_at, updated_at)
     VALUES (?,?,NOW(),NOW())`,
    [displayName || phone || externalId.slice(0, 12), phone]
  );
  const id = ins.insertId;
  customerCache.set(cKey, id);
  await linkIdentity(id, platform, externalId, displayName);
  return id;
}

async function linkIdentity(customerId: number, platform: string, externalId: string, displayName?: string | null) {
  await main.query(
    `INSERT INTO omnichannel_customer_identities
       (customer_id, platform, external_id, display_name, is_primary, first_seen_at, last_seen_at)
     VALUES (?,?,?,?,1,NOW(),NOW())
     ON DUPLICATE KEY UPDATE
       last_seen_at = NOW(),
       display_name = COALESCE(VALUES(display_name), display_name)`,
    [customerId, platform, externalId, displayName || null]
  );
  customerByIdentity.set(`${platform}:${externalId}`, customerId);
}


/* ── conversations ────────────────────────────────────────────────────
 * A conversation is the (customer, platform) pair on Facebook/WhatsApp —
 * those platforms have no native thread id for DMs. The conversation row
 * MUST exist before messages, because messages.conversation_id is NOT NULL.
 */
const convCache = new Map<string, number>();

async function upsertConversation(
  customerId: number, platform: string, label: string
): Promise<number> {
  const key = `${customerId}:${platform}`;
  const hit = convCache.get(key);
  if (hit) return hit;

  // Deterministic external id keeps the whole thing re-runnable.
  const extId = `conv_${platform}_${customerId}`;
  await main.query(
    `INSERT INTO omnichannel_conversations
       (platform, customer_id, external_conversation_id, status, priority,
        unread_count, meta, created_at, updated_at)
     VALUES (?,?,?,'open','normal',0,?,NOW(),NOW())
     ON DUPLICATE KEY UPDATE updated_at = NOW(),
       meta = COALESCE(VALUES(meta), meta)`,
    [platform, customerId, extId, JSON.stringify({ label, migrated: 1 })]
  );
  const [rows]: any = await main.query(
    'SELECT id FROM omnichannel_conversations WHERE platform = ? AND external_conversation_id = ? LIMIT 1',
    [platform, extId]
  );
  const id = rows[0].id;
  convCache.set(key, id);
  return id;
}

/* ── message insert ───────────────────────────────────────────────── */

let fbDone = 0, waDone = 0, skipped = 0;

for (const r of fbRows as any[]) {
  const meta = CHANNEL_LABEL[String(r.channel)] || CHANNEL_LABEL.facebook;
  const externalId = String(r.sender_id);
  let payload: any = {};
  try { payload = JSON.parse(r.payload || '{}'); } catch { payload = {}; }
  const text = String(r.message_text || '').trim()
    || (payload?.message?.text ? String(payload.message.text) : '');

  // A real message id keeps dedupe stable across re-runs.
  const extMsg = payload?.message?.mid
    ? String(payload.message.mid)
    : `fb_${r.id}`;

  let msgType = meta.messageType;
  const att = payload?.message?.attachments?.[0];
  if (att?.type && att.type !== 'fallback') msgType = String(att.type);
  if (!text && msgType === 'text') msgType = 'unknown';

  const phone = normPhone(r.sender_phone);
  const customerId = await upsertCustomer(meta.platform, externalId, phone, r.sender_name || null);

  try {
    const convId = await upsertConversation(customerId, meta.platform, meta.label);
    const [r2]: any = await main.query(
      `INSERT IGNORE INTO omnichannel_messages
         (conversation_id, platform, external_message_id, direction, message_type,
          sender_type, sender_identity, body, raw_payload, sent_at, created_at)
       VALUES (?,?,?,'inbound',?,'customer',?,?,?,?,NOW())`,
      [convId, meta.platform, extMsg, msgType, externalId, text,
       r.payload ? String(r.payload).slice(0, 4000) : null, r.created_at]
    );
    if (r2.affectedRows) fbDone++;
    else skipped++;
  } catch (e: any) {
    skipped++;
    if (fbDone < 3) console.log('  fb insert err:', e.message);
  }
}
console.log(`facebook: ${fbDone} inserted, ${skipped} skipped`);

for (const r of waRows as any[]) {
  const phone = normPhone(r.phone);
  if (!phone) { skipped++; continue; }
  const customerId = await upsertCustomer('whatsapp', phone, phone, null);

  const extMsg = String(r.wa_msg_id || `wa_${r.id}`);
  const outbound = r.direction === 'out';
  const msgType = r.msg_type === 'text' ? 'text' : String(r.msg_type || 'other');

  try {
    const convId = await upsertConversation(customerId, 'whatsapp', 'WhatsApp');
    const [r2]: any = await main.query(
      `INSERT IGNORE INTO omnichannel_messages
         (conversation_id, platform, external_message_id, direction, message_type,
          sender_type, sender_identity, body, raw_payload, sent_at, created_at)
       VALUES (?,?,?,?,?,'agent',?,?,?,?,NOW())`,
      [convId, 'whatsapp', extMsg, outbound ? 'outbound' : 'inbound', msgType,
       phone, r.body || '',
       r.media_path ? JSON.stringify({ media_path: r.media_path, order_id: r.order_id, invoice: r.invoice }) : null,
       r.created_at]
    );
    if (r2.affectedRows) waDone++;
    else skipped++;
  } catch (e: any) {
    skipped++;
    if (waDone < 3) console.log('  wa insert err:', e.message);
  }
}
console.log(`whatsapp: ${waDone} inserted, ${skipped} skipped`);

/* ── roll up message stats onto each conversation ───────────────── */
await main.query(
  `UPDATE omnichannel_conversations c
     JOIN (
       SELECT conversation_id,
              MAX(sent_at)                          AS last_at,
              MAX(CASE WHEN direction='inbound'  THEN sent_at END) AS last_in,
              MAX(CASE WHEN direction='outbound' THEN sent_at END) AS last_out,
              SUM(direction='inbound')             AS unread
         FROM omnichannel_messages GROUP BY conversation_id
     ) m ON m.conversation_id = c.id
   SET c.last_message_at = GREATEST(COALESCE(c.last_message_at, '1970-01-01'), COALESCE(m.last_at, '1970-01-01')),
       c.last_inbound_at  = COALESCE(m.last_in,  c.last_inbound_at),
       c.last_outbound_at = COALESCE(m.last_out, c.last_outbound_at),
       c.unread_count     = m.unread,
       c.updated_at = NOW()`
);

/* last_message_preview from the newest row */
await main.query(
  `UPDATE omnichannel_conversations c
     JOIN (
       SELECT mm.conversation_id, mm.body
         FROM omnichannel_messages mm
         JOIN (
           SELECT conversation_id, MAX(sent_at) AS mx
             FROM omnichannel_messages GROUP BY conversation_id
         ) t ON t.conversation_id = mm.conversation_id AND t.mx = mm.sent_at
        WHERE mm.body <> '' GROUP BY mm.conversation_id
     ) p ON p.conversation_id = c.id
   SET c.last_message_preview = LEFT(p.body, 220)`
);


/* final safety net: no conversation may be left without a recency value,
   because the inbox list sorts on it. */
await main.query(
  `UPDATE omnichannel_conversations c
     LEFT JOIN (
       SELECT conversation_id, MAX(sent_at) AS mx
         FROM omnichannel_messages GROUP BY conversation_id
     ) m ON m.conversation_id = c.id
     SET c.last_message_at = COALESCE(m.mx, c.created_at)
   WHERE c.last_message_at IS NULL`
);

console.log('conversations rebuilt');

const [[after]]: any = await main.query('SELECT COUNT(*) c FROM omnichannel_messages');
const [stats] = await main.query(
  `SELECT m.platform, COUNT(*) msgs, COUNT(DISTINCT c.customer_id) customers
     FROM omnichannel_messages m
     JOIN omnichannel_conversations c ON c.id = m.conversation_id
     GROUP BY m.platform`
);
const [convs] = await main.query(
  `SELECT platform, COUNT(*) c FROM omnichannel_conversations GROUP BY platform`
);
console.log('\nomnichannel_messages before =', before.c, ' after =', after.c);
console.log('by platform:', JSON.stringify(stats));
console.log('conversations:', JSON.stringify(convs));

process.exit(0);