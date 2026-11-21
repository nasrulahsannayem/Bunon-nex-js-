/**
 * Migration 0003 — make media and people visible in the inbox.
 *
 * The screenshots showed three concrete failures:
 *   1. image messages render as blank bubbles
 *   2. Facebook senders show a numeric ID instead of a name
 *   3. nobody has a profile photo
 *
 * All three are storage gaps, not rendering bugs:
 *
 *   - `omnichannel_messages` had no column for media. 241 image messages exist
 *     and their FB CDN URL sits buried inside `raw_payload`, so the UI had
 *     nothing to read. That URL is signed and expires, which is why the plan
 *     below also stores the media id so it can be re-resolved on demand.
 *   - `omnichannel_customer_identities` had no avatar column at all.
 *   - `external_username` is NULL for every Facebook row, because the FB
 *     webhook never populated it and the profile lookup is lazy.
 *
 * Adds:
 *   omnichannel_messages.media_url / media_id / media_mime / media_size
 *   omnichannel_customer_identities.avatar_url
 *   omnichannel_customer_identities.profile_fetched_at
 */

import type { Migration } from './index';

const M: Migration = {
  id: '0003',
  name: 'omnichannel_media_and_avatar',
  notes:
    'Media columns on messages so image/audio/video bubbles can render, and ' +
    'avatar_url on customer identities so profile photos appear.',

  up: [
    // ── media on messages ─────────────────────────────────────────────
    // `media_url` holds the provider CDN link as delivered (works immediately,
    // expires later). `media_id` is the durable handle (FB mid / IG media id)
    // so a dead URL can be refreshed through the Graph API instead of the
    // message degrading to a permanent blank bubble.
    `ALTER TABLE omnichannel_messages
       ADD COLUMN media_url TEXT NULL,
       ADD COLUMN media_id VARCHAR(255) NULL,
       ADD COLUMN media_mime VARCHAR(120) NULL,
       ADD COLUMN media_size BIGINT NULL,
       ADD COLUMN media_width INT NULL,
       ADD COLUMN media_height INT NULL,
       ADD COLUMN media_duration INT NULL,
       ADD COLUMN media_error VARCHAR(255) NULL`,

    // conversations need it too: the list shows an attachment indicator, and
    // counting per message would be a correlated subquery on every row
    `ALTER TABLE omnichannel_conversations
       ADD COLUMN attachment_count INT NOT NULL DEFAULT 0,
       ADD COLUMN last_media_url TEXT NULL`,

    // ── avatar on identities ──────────────────────────────────────────
    `ALTER TABLE omnichannel_customer_identities
       ADD COLUMN avatar_url TEXT NULL,
       ADD COLUMN profile_fetched_at DATETIME NULL`,

    // ── backfill ──────────────────────────────────────────────────────
    // Lift the first image/video/audio attachment URL out of raw_payload for
    // every media message that predates these columns. The payload shape
    // differs per provider, so this covers the two that are actually stored:
    // Facebook Messenger (`message.attachments[].payload.url`) and Instagram
    // (`message.attachments[].payload.url`), which share the shape.
    `UPDATE omnichannel_messages
        SET media_url = JSON_UNQUOTE(JSON_EXTRACT(
              raw_payload, '$.message.attachments[0].payload.url'))
      WHERE media_url IS NULL
        AND message_type IN ('image','video','audio','reel','sticker')
        AND raw_payload IS NOT NULL
        AND JSON_EXTRACT(raw_payload, '$.message.attachments[0].payload.url') IS NOT NULL`,

    `UPDATE omnichannel_conversations c
        SET c.attachment_count = (
              SELECT COUNT(*) FROM omnichannel_messages m
               WHERE m.conversation_id = c.id
                 AND m.media_url IS NOT NULL
                 AND m.media_url <> ''
            ),
            c.last_media_url = (
              SELECT m.media_url FROM omnichannel_messages m
               WHERE m.conversation_id = c.id AND m.media_url IS NOT NULL AND m.media_url <> ''
               ORDER BY m.sent_at DESC LIMIT 1
            )`,

    // ── reporting indexes ─────────────────────────────────────────────
    `ALTER TABLE omnichannel_messages
       ADD KEY idx_msg_media (conversation_id, message_type)`,
  ],

  down: [
    `ALTER TABLE omnichannel_messages
       DROP KEY idx_msg_media,
       DROP COLUMN media_duration,
       DROP COLUMN media_height,
       DROP COLUMN media_width,
       DROP COLUMN media_size,
       DROP COLUMN media_mime,
       DROP COLUMN media_id,
       DROP COLUMN media_url,
       DROP COLUMN media_error`,
    `ALTER TABLE omnichannel_conversations
       DROP COLUMN last_media_url,
       DROP COLUMN attachment_count`,
    `ALTER TABLE omnichannel_customer_identities
       DROP COLUMN profile_fetched_at,
       DROP COLUMN avatar_url`,
  ],
};

export default M;