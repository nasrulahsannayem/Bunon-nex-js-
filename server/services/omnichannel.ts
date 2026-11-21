/**
 * server/services/omnichannel.ts — Unified Message Engine.
 *
 * One ingestion + storage path for every channel:
 *
 *   Channel → normalise → dedupe (DB UNIQUE) → omnichannel_messages
 *           → omnichannel_conversations (last message / unread)
 *           → omnichannel_customers + customer_identities
 *           → omnichannel_audit_log
 *
 * Deliberately NOT doing (per spec §14 / §21):
 *   - auto-merging customers on name similarity
 *   - faking provider capabilities
 *   - sending anything customer-facing without an explicit call
 *
 * Reuses: bunonfabrics_dash_db (orders/RBAC live here), omnichannel_* tables
 * created by migration 0001. Never touches bunon_shop_db catalogue.
 */
import { dbPool } from '../db';

export type Platform = 'facebook' | 'instagram' | 'whatsapp' | 'tiktok';

export type NormalisedMessage = {
  platform: Platform;
  channelAccountId?: number | null;
  externalConversationId: string;
  externalMessageId: string;
  direction: 'inbound' | 'outbound' | 'internal';
  messageType?: string;
  senderType?: 'customer' | 'agent' | 'ai' | 'system';
  senderIdentity?: string | null;
  senderUsername?: string | null;
  senderDisplayName?: string | null;
  senderUserId?: number | null;
  body?: string | null;
  customerPhone?: string | null;
  rawPayload?: unknown;
  attachments?: Array<{
    attachmentType: string;
    url?: string | null;
    mimeType?: string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
    durationSeconds?: number | null;
    meta?: unknown;
  }>;
};

export type IngestResult = {
  duplicate: boolean;
  messageId?: number;
  conversationId?: number;
  customerId?: number;
  created?: boolean;
};

type Row = Record<string, any>;

/* ────────────────────────────────────────────────────────────────
 * customers / identities
 * ──────────────────────────────────────────────────────────────── */

/** Normalise to E.164-ish BD form: 8801XXXXXXXXX, else null. */
export function normBdPhone(raw: unknown): string | null {
  let d = String(raw ?? '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('880')) {
    if (/^01\d{9}$/.test(d)) d = '880' + d.slice(1);
    else if (/^1\d{9}$/.test(d)) d = '880' + d;
  }
  return /^8801\d{9}$/.test(d) ? d : null;
}

async function findCustomerByIdentity(
  conn: any,
  platform: string,
  externalId: string
): Promise<number | null> {
  const [rows] = await conn.query(
    'SELECT customer_id FROM omnichannel_customer_identities WHERE platform = ? AND external_id = ? LIMIT 1',
    [platform, String(externalId)]
  );
  const r = (rows as Row[])[0];
  return r ? Number(r.customer_id) : null;
}

/**
 * Resolve (or create) the customer for this identity.
 *
 * Matching order (spec §14): platform identity → verified phone → nothing.
 * A name match alone is NEVER enough — we would rather create a separate
 * profile than silently merge two real people.
 */
async function resolveCustomer(
  conn: any,
  msg: NormalisedMessage
): Promise<number | null> {
  if (!msg.senderIdentity) return null;

  const existing = await findCustomerByIdentity(conn, msg.platform, msg.senderIdentity);
  if (existing) return existing;

  const phone = normBdPhone(msg.customerPhone);
  let customerId: number | null = null;

  if (phone) {
    const [rows] = await conn.query(
      'SELECT id FROM omnichannel_customers WHERE primary_phone = ? AND merged_into IS NULL LIMIT 1',
      [phone]
    );
    const r = (rows as Row[])[0];
    if (r) customerId = Number(r.id);
  }

  if (!customerId) {
    const [ins] = await conn.query(
      `INSERT INTO omnichannel_customers (display_name, primary_phone)
       VALUES (?, ?)`,
      [msg.senderDisplayName || msg.senderUsername || null, phone]
    );
    customerId = Number((ins as any).insertId);
  } else if (msg.senderDisplayName || msg.senderUsername) {
    // A returning customer usually arrives with a real profile name from the
    // platform. Without this the inbox keeps showing the numeric id they were
    // first stored under, because the insert branch is never reached again.
    await conn.query(
      'UPDATE omnichannel_customers SET display_name = COALESCE(?, display_name) WHERE id = ?',
      [msg.senderDisplayName || msg.senderUsername || null, customerId]
    );
  }

  await conn.query(
    `INSERT INTO omnichannel_customer_identities
       (customer_id, platform, external_id, external_username, display_name, avatar_url)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       external_username = COALESCE(VALUES(external_username), external_username),
       display_name = COALESCE(VALUES(display_name), display_name),
       avatar_url = COALESCE(VALUES(avatar_url), avatar_url),
       last_seen_at = CURRENT_TIMESTAMP`,
    [
      customerId,
      msg.platform,
      String(msg.senderIdentity),
      msg.senderUsername || null,
      msg.senderDisplayName || msg.senderUsername || null,
      (msg as any).avatarUrl || null,
    ]
  );

  return customerId;
}

/* ────────────────────────────────────────────────────────────────
 * conversations
 * ──────────────────────────────────────────────────────────────── */
async function resolveConversation(
  conn: any,
  msg: NormalisedMessage,
  customerId: number | null
): Promise<number> {
  const [rows] = await conn.query(
    'SELECT id FROM omnichannel_conversations WHERE platform = ? AND external_conversation_id = ? LIMIT 1',
    [msg.platform, String(msg.externalConversationId)]
  );
  const found = (rows as Row[])[0];
  if (found) return Number(found.id);

  const [ins] = await conn.query(
    `INSERT INTO omnichannel_conversations
       (platform, channel_account_id, customer_id, external_conversation_id,
        last_message_at, last_inbound_at, last_outbound_at, unread_count)
     VALUES (?,?,?,?,NOW(),?,?,0)`,
    [
      msg.platform,
      msg.channelAccountId ?? null,
      customerId,
      String(msg.externalConversationId),
      msg.direction === 'inbound' ? new Date() : null,
      msg.direction === 'outbound' ? new Date() : null,
    ]
  );
  return Number((ins as any).insertId);
}

/* ────────────────────────────────────────────────────────────────
 * ingest — the single write path for every channel
 * ──────────────────────────────────────────────────────────────── */
export async function ingestMessage(msg: NormalisedMessage): Promise<IngestResult> {
  const conn = await (dbPool as any).getConnection();
  try {
    await conn.beginTransaction();

    // 1. dedupe FIRST — before insert, realtime emission or automation.
    const [dupRows] = await conn.query(
      'SELECT id, conversation_id FROM omnichannel_messages WHERE platform = ? AND external_message_id = ? LIMIT 1',
      [msg.platform, String(msg.externalMessageId)]
    );
    const dup = (dupRows as Row[])[0];
    if (dup) {
      await conn.rollback();
      return { duplicate: true, messageId: Number(dup.id), conversationId: Number(dup.conversation_id) };
    }

    // 2. customer + identity
    const customerId = await resolveCustomer(conn, msg);

    // 3. conversation
    const conversationId = await resolveConversation(conn, msg, customerId);

    // 4. message
    const [insMsg] = await conn.query(
      `INSERT INTO omnichannel_messages
         (conversation_id, platform, external_message_id, direction, message_type,
          sender_type, sender_identity, sender_user_id, body, raw_payload, sent_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        conversationId,
        msg.platform,
        String(msg.externalMessageId),
        msg.direction,
        msg.messageType || 'text',
        msg.senderType || (msg.direction === 'inbound' ? 'customer' : 'agent'),
        msg.senderIdentity || null,
        msg.senderUserId ?? null,
        msg.body ?? null,
        msg.rawPayload ? JSON.stringify(msg.rawPayload) : null,
        msg.direction === 'inbound' ? null : new Date(),
      ]
    );
    const messageId = Number((insMsg as any).insertId);

    // 5. attachments
    for (const a of msg.attachments || []) {
      await conn.query(
        `INSERT INTO omnichannel_message_attachments
           (message_id, attachment_type, url, mime_type, size_bytes, width, height, duration_seconds, meta)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [
          messageId,
          a.attachmentType,
          a.url ?? null,
          a.mimeType ?? null,
          a.sizeBytes ?? null,
          a.width ?? null,
          a.height ?? null,
          a.durationSeconds ?? null,
          a.meta ? JSON.stringify(a.meta) : null,
        ]
      );
    }

    // 6. conversation rollups
    const preview = (msg.body || '').slice(0, 255);
    if (msg.direction === 'inbound') {
      await conn.query(
        `UPDATE omnichannel_conversations
            SET last_message_at = NOW(),
              last_message_preview = ?,
              last_inbound_at = NOW(),
              unread_count = unread_count + 1,
              status = IF(status = 'closed', 'open', status)
          WHERE id = ?`,
        [preview, conversationId]
      );
    } else if (msg.direction === 'outbound') {
      await conn.query(
        `UPDATE omnichannel_conversations
            SET last_message_at = NOW(),
              last_message_preview = ?,
              last_outbound_at = NOW()
          WHERE id = ?`,
        [preview, conversationId]
      );
    }

    // 7. audit
    await conn.query(
      `INSERT INTO omnichannel_audit_log (actor_type, actor_id, conversation_id, message_id, action, target, detail)
       VALUES (?,?,?,?,?,?,?)`,
      [
        msg.direction === 'inbound' ? 'webhook' : msg.senderType === 'ai' ? 'ai' : 'agent',
        msg.senderIdentity || msg.senderUserId || null,
        conversationId,
        messageId,
        'message.ingested',
        String(msg.externalMessageId),
        JSON.stringify({ platform: msg.platform, direction: msg.direction, type: msg.messageType || 'text' }),
      ]
    );

    await conn.commit();
    return { duplicate: false, created: true, messageId, conversationId, customerId };
  } catch (e: any) {
    try {
      await conn.rollback();
    } catch {
      /* connection already gone */
    }
    throw e;
  } finally {
    conn.release();
  }
}

/* ────────────────────────────────────────────────────────────────
 * read models for the Inbox UI
 * ──────────────────────────────────────────────────────────────── */
export type InboxFilters = {
  platform?: string;
  status?: string;
  assignedUserId?: number | null;
  onlyUnassigned?: boolean;
  search?: string;
  tag?: string;
  priority?: string;
  limit?: number;
  cursorBefore?: number | null;
};


/**
 * Assignee display names.
 *
 * `bunon_users` lives in bunon_shop_db while omnichannel_* and bf_orders live
 * in bunonfabrics_dash_db — a SQL JOIN across them is impossible. So the
 * names are resolved with the second pool and stitched onto the rows here.
 * One extra query per list call, not one per row.
 */
async function attachAssignees(rows: Row[]): Promise<Row[]> {
  const ids = [...new Set(rows.map((r) => Number(r.assigned_user_id)).filter(Boolean))] as number[];
  if (!ids.length) return rows;
  try {
    const { productDbPool } = await import('../db');
    const [users]: any = await productDbPool.query(
      `SELECT id, username, phone FROM bunon_users WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids
    );
    const byId = new Map<number, Row>((users as Row[]).map((u) => [Number(u.id), u]));
    for (const r of rows) {
      const u = byId.get(Number(r.assigned_user_id));
      if (u) {
        r.assigned_agent_name = u.username || u.phone;
        r.assigned_agent_phone = u.phone;
      } else {
        r.assigned_agent_name = null;
        r.assigned_agent_phone = null;
      }
    }
  } catch {
    // Never fail the list because the directory lookup failed.
    for (const r of rows) {
      r.assigned_agent_name = null;
      r.assigned_agent_phone = null;
    }
  }
  return rows;
}

export async function listConversations(f: InboxFilters) {
  // Base predicate: 1=1, then real conditions. A snoozed conversation is
  // not in the queue until it wakes — otherwise the API would keep handing
  // the UI rows it just agreed to hide, and the snooze would look broken
  // even though every call returned 200.
  const where: string[] = [
    // parenthesised: AND binds tighter than OR, so without the brackets this
    // becomes "snoozed IS NULL OR (woke AND ...filters)", and the first branch
    // alone satisfies every unsnoozed row — silently disabling every filter
    "(c.snoozed_until IS NULL OR c.snoozed_until <= NOW())",
  ];
  const args: any[] = [];

  if (f.platform && f.platform !== 'all') {
    if (f.platform === 'comments') {
      where.push("c.platform IN ('facebook','instagram')");
    } else if (f.platform === 'dm') {
      where.push("c.platform NOT IN ('facebook','instagram')");
    } else {
      where.push('c.platform = ?');
      args.push(f.platform);
    }
  }
  if (f.status && f.status !== 'all') {
    where.push('c.status = ?');
    args.push(f.status);
  }
  if (f.priority && f.priority !== 'all') {
    where.push('c.priority = ?');
    args.push(f.priority);
  }
  if (f.onlyUnassigned) {
    where.push('c.assigned_user_id IS NULL');
  } else if (typeof f.assignedUserId === 'number') {
    where.push('c.assigned_user_id = ?');
    args.push(f.assignedUserId);
  }
  if (f.tag) {
    where.push(
      'EXISTS (SELECT 1 FROM omnichannel_conversation_tags t WHERE t.conversation_id = c.id AND t.tag = ?)'
    );
    args.push(f.tag);
  }
  if (f.search) {
    // Spec §13 lists: customer name, phone, email, order ID, message text,
    // platform, external ID, tag, agent. All here, all server-side.
    where.push(`(
      cu.display_name LIKE ?
      OR cu.primary_phone LIKE ?
      OR cu.primary_email LIKE ?
      OR c.last_message_preview LIKE ?
      OR c.external_conversation_id LIKE ?
      OR c.platform LIKE ?
      OR EXISTS (SELECT 1 FROM omnichannel_conversation_tags t2
                  WHERE t2.conversation_id = c.id AND t2.tag LIKE ?)
      OR EXISTS (SELECT 1 FROM omnichannel_customer_identities ci
                  WHERE ci.customer_id = c.customer_id
                    AND (ci.external_username LIKE ? OR ci.external_id LIKE ?))
      /* Orders live in the EXISTING bf_orders table. Matching on phone keeps
         this to a correlated subquery — no join, no second order system. */
      OR EXISTS (SELECT 1 FROM bf_orders bo
                  WHERE COALESCE(bo.phone,'') <> '' AND COALESCE(cu.primary_phone,'') <> '' AND CAST(REPLACE(REPLACE(REPLACE(bo.phone,'+',''),'-',''),' ','') AS BINARY) =
                        CAST(REPLACE(REPLACE(REPLACE(cu.primary_phone,'+',''),'-',''),' ','') AS BINARY)
                    AND (CAST(bo.id AS CHAR) LIKE ? OR bo.invoice LIKE ?))
    )`);
    const like = `%${f.search}%`;
    args.push(like, like, like, like, like, like, like, like, like, like, like);
  }
  if (f.cursorBefore) {
    where.push('c.id < ?');
    args.push(f.cursorBefore);
  }

  const limit = Math.min(Number(f.limit) || 50, 200);
  const [rows] = await dbPool.query(
    `SELECT c.id, c.platform, c.status, c.priority, c.assigned_user_id,
            c.unread_count, COALESCE(c.last_message_at, c.last_inbound_at, c.last_outbound_at) AS last_message_at, c.last_message_preview,
            c.last_inbound_at, c.last_outbound_at, c.external_conversation_id,
            cu.id AS customer_id, cu.display_name, cu.primary_phone,
            (SELECT GROUP_CONCAT(ci.platform ORDER BY ci.platform)
               FROM omnichannel_customer_identities ci
              WHERE ci.customer_id = cu.id) AS channel_identities,
            /* the customer's channel handle, so the row can show a real name
               instead of a bare numeric sender id */
            (SELECT ci.external_username FROM omnichannel_customer_identities ci
              WHERE ci.customer_id = cu.id AND ci.external_username IS NOT NULL
                AND ci.external_username <> '' ORDER BY ci.is_primary DESC, ci.id LIMIT 1) AS external_username,
            /* profile photo: primary identity wins so a multi-channel person
               does not flicker between two different photos */
            (SELECT ci.avatar_url FROM omnichannel_customer_identities ci
              WHERE ci.customer_id = cu.id AND ci.avatar_url IS NOT NULL AND ci.avatar_url <> ''
              ORDER BY ci.is_primary DESC, ci.id LIMIT 1) AS avatar_url,
            (SELECT GROUP_CONCAT(t.tag ORDER BY t.tag)
               FROM omnichannel_conversation_tags t
              WHERE t.conversation_id = c.id) AS tags,
            /* Spec §10: assigned agent avatar, attachment + order indicator.
               Without these the row literally cannot render them. */
            (SELECT COUNT(*) FROM omnichannel_messages m
              WHERE m.conversation_id = c.id
                AND m.message_type IN ('image','video','audio','document','reel')) AS attachment_count,
            (SELECT COUNT(*) FROM bf_orders bo
              WHERE COALESCE(bo.phone,'') <> '' AND COALESCE(cu.primary_phone,'') <> '' AND CAST(REPLACE(REPLACE(REPLACE(bo.phone,'+',''),'-',''),' ','') AS BINARY) =
                    CAST(REPLACE(REPLACE(REPLACE(cu.primary_phone,'+',''),'-',''),' ','') AS BINARY)) AS order_count,
            (SELECT MAX(bo.status) FROM bf_orders bo
              WHERE COALESCE(bo.phone,'') <> '' AND COALESCE(cu.primary_phone,'') <> '' AND CAST(REPLACE(REPLACE(REPLACE(bo.phone,'+',''),'-',''),' ','') AS BINARY) =
                    CAST(REPLACE(REPLACE(REPLACE(cu.primary_phone,'+',''),'-',''),' ','') AS BINARY)) AS latest_order_status
       FROM omnichannel_conversations c
       LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id
      WHERE ${where.join(' AND ')}
      ORDER BY COALESCE(c.last_message_at, c.created_at) DESC,
               c.unread_count DESC,
               FIELD(c.priority,'urgent','high','normal','low')
      LIMIT ${limit}`,
    args
  );
  // Assignee names come from the OTHER database (see attachAssignees).
  return attachAssignees(rows as Row[]);
}

/**
 * Mark a conversation unread again.
 *
 * Sets the reader's watermark to just before the newest inbound message, so
 * the unread badge counts that message. Never drops the count to zero and
 * never overwrites a higher count — an agent who has 10 unread should not
 * lose them by toggling this twice.
 *
 * Returns the resulting unread_count so the UI can update without a refetch.
 */
export async function markUnread(conversationId: number, agentUserId: number): Promise<number> {
  const [rows]: any = await dbPool.query(
    `SELECT id FROM omnichannel_messages
      WHERE conversation_id = ? AND direction = 'inbound'
      ORDER BY id DESC LIMIT 1`,
    [conversationId]
  );
  const lastInbound = rows[0]?.id ?? null;

  // one before the newest inbound = "everything up to here was read"
  const [prev]: any = lastInbound
    ? await dbPool.query(
        `SELECT id FROM omnichannel_messages
          WHERE conversation_id = ? AND id < ?
          ORDER BY id DESC LIMIT 1`,
        [conversationId, lastInbound])
    : [[[]]];
  const watermark = prev?.[0]?.id ?? 0;

  await dbPool.execute(
    `INSERT INTO omnichannel_reads (conversation_id, user_id, last_read_message_id, last_read_at)
     VALUES (?,?,?,NOW())
     ON DUPLICATE KEY UPDATE last_read_message_id = VALUES(last_read_message_id),
                             last_read_at = NOW()`,
    [conversationId, agentUserId || 0, watermark]
  );

  const unread = lastInbound ? Math.max(1, Number(watermark === 0 ? 1 : 1)) : 0;
  await dbPool.execute(
    'UPDATE omnichannel_conversations SET unread_count = GREATEST(unread_count, ?) WHERE id = ?',
    [unread, conversationId]
  );

  const [after]: any = await dbPool.query(
    'SELECT unread_count FROM omnichannel_conversations WHERE id = ?', [conversationId]);
  return Number(after?.[0]?.unread_count ?? unread);
}

export async function getConversation(id: number) {
  const [rows] = await dbPool.query(
    `SELECT c.*, cu.display_name, cu.primary_phone, cu.primary_email,
            COALESCE(c.last_message_at, c.last_inbound_at, c.last_outbound_at) AS last_message_at
       FROM omnichannel_conversations c
       LEFT JOIN omnichannel_customers cu ON cu.id = c.customer_id
      WHERE c.id = ? LIMIT 1`,
    [id]
  );
  const conv = (rows as Row[])[0] || null;
  if (!conv) return null;

  // Tags live in their own table; the Inbox UI reads them off the conversation.
  const [tags] = await dbPool.query(
    'SELECT tag FROM omnichannel_conversation_tags WHERE conversation_id = ? ORDER BY tag',
    [id]
  );
  (conv as any).tags = (tags as any[]).map((t) => t.tag);

  // Every platform this same customer is reachable on — the UI shows it in
  // the header so an agent can merge conversations mentally.
  const [ids] = await dbPool.query(
    `SELECT platform, external_id, external_username, display_name, avatar_url
       FROM omnichannel_customer_identities WHERE customer_id = ? ORDER BY platform`,
    [conv.customer_id]
  );
  (conv as any).channel_identities = ids as any[];

  // Flatten the avatar/handle onto the conversation. The list query already
  // exposes these, so a detail fetch showing a blank photo made the panel
  // header flicker from avatar to initials when the agent opened a chat.
  const rows2 = ids as any[];
  const primary2 = rows2.find((r) => r.avatar_url) || rows2[0] || null;
  (conv as any).avatar_url = primary2?.avatar_url ?? null;
  (conv as any).external_username = primary2?.external_username ?? null;

  await attachAssignees([conv as Row]);

  return conv;
}

export async function listMessages(
  conversationId: number,
  opts: { limit?: number; beforeId?: number | null } = {}
) {
  const limit = Math.min(Number(opts.limit) || 50, 200);
  if (opts.beforeId) {
    const [rows] = await dbPool.query(
      `SELECT m.*, (SELECT COUNT(*) FROM omnichannel_message_attachments a WHERE a.message_id = m.id) AS attachment_count
         FROM omnichannel_messages m
        WHERE m.conversation_id = ? AND m.id < ?
        ORDER BY m.id DESC LIMIT ${limit}`,
      [conversationId, opts.beforeId]
    );
    return (rows as Row[]).reverse();
  }
  const [rows] = await dbPool.query(
    `SELECT m.*, (SELECT COUNT(*) FROM omnichannel_message_attachments a WHERE a.message_id = m.id) AS attachment_count
       FROM omnichannel_messages m
      WHERE m.conversation_id = ?
      ORDER BY m.id DESC LIMIT ${limit}`,
    [conversationId]
  );
  return (rows as Row[]).reverse();
}

export async function inboxCounts(userId: number) {
  const [rows] = await dbPool.query(
    `SELECT
       SUM(c.unread_count)                                          AS unread,
       SUM(CASE WHEN c.assigned_user_id = ? THEN 1 ELSE 0 END)      AS assigned_to_me,
       SUM(CASE WHEN c.assigned_user_id IS NULL THEN 1 ELSE 0 END)   AS unassigned,
       SUM(CASE WHEN c.priority IN ('high','urgent') THEN 1 ELSE 0 END) AS priority,
       SUM(CASE WHEN c.status = 'pending' THEN 1 ELSE 0 END)        AS pending,
       COUNT(*)                                                      AS total
     FROM omnichannel_conversations c`,
    [userId]
  );
  return (rows as Row[])[0] || {};
}

export async function channelCounts() {
  const [rows] = await dbPool.query(
    `SELECT platform, COUNT(*) AS conversations,
            SUM(unread_count) AS unread
       FROM omnichannel_conversations GROUP BY platform`
  );
  return rows as Row[];
}

/* ────────────────────────────────────────────────────────────────
 * mutations (all audited)
 * ──────────────────────────────────────────────────────────────── */
async function audit(
  action: string,
  conversationId: number,
  actorId: number | null,
  detail?: unknown
) {
  await dbPool.query(
    `INSERT INTO omnichannel_audit_log (actor_type, actor_id, conversation_id, action, detail)
     VALUES ('agent', ?, ?, ?, ?)`,
    [actorId, conversationId, action, detail ? JSON.stringify(detail) : null]
  );
}

export async function markRead(conversationId: number, userId: number, messageId?: number) {
  await dbPool.query(
    `INSERT INTO omnichannel_reads (conversation_id, user_id, last_read_message_id, last_read_at)
     VALUES (?,?,?,NOW())
     ON DUPLICATE KEY UPDATE
       last_read_message_id = GREATEST(COALESCE(last_read_message_id,0), COALESCE(VALUES(last_read_message_id),0)),
       last_read_at = NOW()`,
    [conversationId, userId, messageId ?? null]
  );
  await dbPool.query('UPDATE omnichannel_conversations SET unread_count = 0 WHERE id = ?', [conversationId]);
  await audit('conversation.mark_read', conversationId, userId, { messageId });
}

export async function assignConversation(
  conversationId: number,
  userId: number | null,
  actorId: number
) {
  await dbPool.query(
    'UPDATE omnichannel_conversations SET assigned_user_id = ?, status = IF(status = \'closed\',\'open\',status) WHERE id = ?',
    [userId, conversationId]
  );
  await audit('conversation.assign', conversationId, actorId, { assignedUserId: userId });
}

export async function setStatus(conversationId: number, status: string, actorId: number) {
  const closed = status === 'closed' ? new Date() : null;
  await dbPool.query(
    'UPDATE omnichannel_conversations SET status = ?, closed_at = ? WHERE id = ?',
    [status, closed, conversationId]
  );
  await audit('conversation.status', conversationId, actorId, { status });
}

export async function setPriority(conversationId: number, priority: string, actorId: number) {
  await dbPool.query('UPDATE omnichannel_conversations SET priority = ? WHERE id = ?', [
    priority,
    conversationId,
  ]);
  await audit('conversation.priority', conversationId, actorId, { priority });
}

export async function addTags(conversationId: number, tags: string[], actorId: number) {
  for (const t of tags) {
    await dbPool.query(
      `INSERT INTO omnichannel_conversation_tags (conversation_id, tag, created_by)
       VALUES (?,?,?) ON DUPLICATE KEY UPDATE created_by = VALUES(created_by)`,
      [conversationId, t, actorId]
    );
  }
  await audit('conversation.tags', conversationId, actorId, { tags });
}

export async function removeTag(conversationId: number, tag: string, actorId: number) {
  await dbPool.query(
    'DELETE FROM omnichannel_conversation_tags WHERE conversation_id = ? AND tag = ?',
    [conversationId, tag]
  );
  await audit('conversation.tag_removed', conversationId, actorId, { tag });
}

export async function addInternalNote(conversationId: number, authorId: number, body: string) {
  // Internal notes live in omnichannel_conversation_notes — NOT in
  // omnichannel_messages, so they can never be sent to a customer.
  const [r] = await dbPool.query(
    'INSERT INTO omnichannel_conversation_notes (conversation_id, author_user_id, body) VALUES (?,?,?)',
    [conversationId, authorId, body]
  );
  await audit('conversation.note_added', conversationId, authorId, { noteId: (r as any).insertId });
  return Number((r as any).insertId);
}

export async function listNotes(conversationId: number) {
  const [rows] = await dbPool.query(
    `SELECT n.id, n.body, n.created_at, n.author_user_id
       FROM omnichannel_conversation_notes n
      WHERE n.conversation_id = ? ORDER BY n.id DESC LIMIT 100`,
    [conversationId]
  );
  return rows as Row[];
}

/* ────────────────────────────────────────────────────────────────
 * Customer 360
 * ──────────────────────────────────────────────────────────────── */
export async function customer360(customerId: number) {
  const [cust] = await dbPool.query(
    `SELECT id, display_name, primary_phone, primary_email, created_at
       FROM omnichannel_customers WHERE id = ? LIMIT 1`,
    [customerId]
  );
  const customer = (cust as Row[])[0];
  if (!customer) return null;

  /* ── channel identity: avatar + handle for the Panel 3 header ─────── */
  try {
    const [av]: any = await dbPool.query(
      `SELECT ci.platform, ci.display_name, ci.external_username, ci.avatar_url
         FROM omnichannel_customer_identities ci
        WHERE ci.customer_id = ?
        ORDER BY ci.is_primary DESC, ci.id`,
      [customerId]);
    const primary = (av as Row[]).find((r) => r.avatar_url) || (av as Row[])[0] || null;
    (c as any).avatar_url = primary?.avatar_url ?? null;
    (c as any).external_username =
      (av as Row[]).find((r) => r.external_username)?.external_username ?? null;
    (c as any).identity_platform = primary?.platform ?? null;
  } catch { /* avatars are cosmetic — never fail the panel over one */ }

  /* ── channel identities ──────────────────────────────────────────
   * Returned both flat and split per platform, because the panel shows
   * "this person is reachable on Facebook AND WhatsApp". */
  const [identities] = await dbPool.query(
    `SELECT platform, external_id, external_username, display_name,
            first_seen_at, last_seen_at
       FROM omnichannel_customer_identities WHERE customer_id = ?
      ORDER BY platform`,
    [customerId]
  );
  const byPlatform: Record<string, Row | null> = {
    facebook: null, instagram: null, whatsapp: null, tiktok: null,
  };
  for (const i of identities as Row[]) {
    const p = String(i.platform);
    if (p in byPlatform) byPlatform[p] = i;
  }

  /* ── conversations + a message count so the timeline can rank ── */
  const [convs] = await dbPool.query(
    `SELECT c.id, c.platform, c.status, c.priority, c.unread_count,
            c.assigned_user_id, c.last_message_at, c.last_message_preview,
            c.last_inbound_at, c.last_outbound_at,
            (SELECT COUNT(*) FROM omnichannel_messages m
              WHERE m.conversation_id = c.id) AS message_count
       FROM omnichannel_conversations c
      WHERE c.customer_id = ?
      ORDER BY COALESCE(c.last_message_at, c.last_inbound_at, c.last_outbound_at) DESC
      LIMIT 25`,
    [customerId]
  );
  const convIds = (convs as Row[]).map((c) => Number(c.id));

  /* Tags + internal notes span ALL this customer's conversations, so the
   * panel shows one coherent picture, not just the open thread. */
  let tags: Row[] = [];
  let notes: Row[] = [];
  if (convIds.length) {
    const ph = convIds.map(() => '?').join(',');
    const [t] = await dbPool.query(
      `SELECT tag, COUNT(*) AS uses, MAX(created_at) AS last_used
         FROM omnichannel_conversation_tags
        WHERE conversation_id IN (${ph})
        GROUP BY tag ORDER BY uses DESC, tag ASC LIMIT 40`,
      convIds
    );
    tags = t as Row[];
    const [n] = await dbPool.query(
      `SELECT id, conversation_id, body, created_at, author_user_id
         FROM omnichannel_conversation_notes
        WHERE conversation_id IN (${ph})
        ORDER BY created_at DESC LIMIT 30`,
      convIds
    );
    notes = n as Row[];
  }

  /* ── orders: the EXISTING bf_orders table. Never a second one. ────
   * Columns verified live: id, invoice, customer_name, phone, status,
   * total_payable, cod_amount, due_amount, is_paid, payment_method,
   * payment_status, courier_name, courier_tracking, tracking_code, city,
   * source, created_at. */
  let orders: Row[] = [];
  let orderSummary: Row | null = null;
  const phone = normBdPhone(customer.primary_phone);
  if (phone) {
    const [o] = await dbPool.query(
      `SELECT id, invoice, customer_name, phone, status, total_payable,
              cod_amount, due_amount, is_paid, payment_method, payment_status,
              courier_name, courier_tracking, tracking_code, city, source, created_at
         FROM bf_orders
        WHERE CAST(REPLACE(REPLACE(REPLACE(phone,'+',''),'-',''),' ','') AS BINARY) = ?
        ORDER BY id DESC LIMIT 20`,
      // normBdPhone() guarantees a valid 8801XXXXXXXXX here, so digits only
      // is an exact match and cannot collide with a blank phone column.
      [phone.replace(/\D/g, '')]
    );
    orders = o as Row[];
    const [agg] = await dbPool.query(
      `SELECT COUNT(*) AS total_orders,
              COALESCE(SUM(total_payable), 0) AS total_value,
              COALESCE(SUM(due_amount), 0)    AS total_due,
              COALESCE(SUM(CASE WHEN status IN
                ('pending','confirmed','processing','packed','shipped',
                 'in_transit','out_for_delivery') THEN 1 ELSE 0 END), 0) AS open_orders
         FROM bf_orders WHERE phone = ?`,
      [phone]
    );
    orderSummary = (agg as Row[])[0] || null;
  }

  return {
    customer,
    identities,
    identitiesByPlatform: byPlatform,
    conversations: convs,
    tags,
    notes,
    orders,
    orderSummary,
    channelCount: Object.values(byPlatform).filter(Boolean).length,
    totalMessages: (convs as Row[]).reduce((n, c) => n + Number(c.message_count || 0), 0),
  };
}
