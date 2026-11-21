/**
 * Workflow additions to the omnichannel service: snooze, SLA clock, the
 * audit timeline, and the three lookup tables (saved views, quick replies,
 * canned responses).
 *
 * Everything here is deliberately small and additive so the existing 0001
 * tables and the already-verified list/detail paths stay untouched.
 */
import { dbPool, productDbPool } from '../db';

// ── audit timeline ──────────────────────────────────────────────────────

/** Record a state change so Panel 3 can show when/who, not just what. */
export async function logEvent(
  conversationId: number,
  eventType: string,
  actorUserId: number | null = null,
  fromValue?: string | null,
  toValue?: string | null,
  meta?: unknown
): Promise<void> {
  await dbPool.execute(
    `INSERT INTO omnichannel_conversation_events
       (conversation_id, event_type, actor_user_id, from_value, to_value, meta)
     VALUES (?,?,?,?,?,?)`,
    [conversationId, eventType, actorUserId, fromValue ?? null, toValue ?? null,
     meta ? JSON.stringify(meta) : null]
  );
}

/** Timeline for one conversation, newest first, with actor names resolved. */
export async function getTimeline(conversationId: number) {
  const [rows]: any = await dbPool.query(
    `SELECT e.id, e.event_type, e.from_value, e.to_value, e.meta, e.created_at,
            e.actor_user_id
       FROM omnichannel_conversation_events e
      WHERE e.conversation_id = ?
      ORDER BY e.id DESC LIMIT 60`,
    [conversationId]
  );
  // bunon_users lives in the OTHER database, so resolve names separately
  // rather than with a cross-DB join (which returns zero rows).
  const ids = [...new Set(rows.map((r: any) => r.actor_user_id).filter(Boolean))] as number[];
  const names = new Map<number, string>();
  if (ids.length) {
    const ph = ids.map(() => '?').join(',');
    const [u]: any = await productDbPool.query(
      `SELECT id, username, name FROM bunon_users WHERE id IN (${ph})`, ids);
    for (const r of u) names.set(r.id, r.username || r.name || `#${r.id}`);
  }
  return rows.map((r: any) => ({
    id: r.id,
    type: r.event_type,
    from: r.from_value,
    to: r.to_value,
    meta: r.meta ? JSON.parse(r.meta) : null,
    at: r.created_at,
    actor: r.actor_user_id ? (names.get(r.actor_user_id) || `#${r.actor_user_id}`) : null,
  }));
}

// ── snooze ──────────────────────────────────────────────────────────────

export async function snooze(conversationId: number, until: string | null) {
  await dbPool.execute(
    'UPDATE omnichannel_conversations SET snoozed_until = ?, updated_at = NOW() WHERE id = ?',
    [until, conversationId]
  );
}

/** Snapshots that are currently hidden by an active snooze. */
export async function snoozedIds(): Promise<number[]> {
  const [rows]: any = await dbPool.query(
    'SELECT id FROM omnichannel_conversations WHERE snoozed_until IS NOT NULL AND snoozed_until > NOW()'
  );
  return rows.map((r: any) => r.id);
}

// ── SLA ─────────────────────────────────────────────────────────────────

/**
 * Stamp first_response_at the first time an agent answers a conversation.
 * Idempotent by construction: COALESCE keeps the earliest value, so a second
 * reply never resets the clock.
 */
export async function stampFirstResponse(conversationId: number): Promise<void> {
  await dbPool.execute(
    `UPDATE omnichannel_conversations
        SET first_response_at = COALESCE(first_response_at, NOW())
      WHERE id = ?`,
    [conversationId]
  );
}

export interface SlaState {
  policyMinutes: number | null;
  firstResponseMinutes: number | null;
  /** minutes since the oldest unanswered inbound message */
  waitingMinutes: number | null;
  breached: boolean;
  label: string;
}

export async function slaFor(conversationId: number): Promise<SlaState | null> {
  const [rows]: any = await dbPool.query(
    `SELECT c.platform, c.first_response_at, c.last_inbound_at, c.status,
            p.first_response_minutes
       FROM omnichannel_conversations c
       -- omnichannel_sla_policies was created with utf8mb4_unicode_ci while
      -- omnichannel_conversations uses utf8mb4_general_ci. Comparing them
      -- directly raises ER_CANT_AGGREGATE_2COLLATIONS. An explicit COLLATE
      -- on both sides is query-local, so it cannot break other callers and
      -- avoids an ALTER TABLE on live data.
      LEFT JOIN omnichannel_sla_policies p
             ON p.channel COLLATE utf8mb4_general_ci
              = c.platform COLLATE utf8mb4_general_ci
      WHERE c.id = ?`,
    [conversationId]
  );
  const c = rows[0];
  if (!c) return null;
  const target = c.first_response_minutes ?? null;
  const answered = !!c.first_response_at;
  const base = answered ? c.first_response_at : c.last_inbound_at;
  if (!base) return { policyMinutes: target, firstResponseMinutes: target, waitingMinutes: null, breached: false, label: 'No messages yet' };

  const mins = Math.max(0, Math.round((Date.now() - new Date(base).getTime()) / 60000));
  const breached = target != null && mins > target;
  return {
    policyMinutes: target,
    firstResponseMinutes: target,
    waitingMinutes: mins,
    breached,
    label: answered
      ? `First reply after ${mins}m`
      : breached
        ? `Breached — waiting ${mins}m`
        : `Waiting ${mins}m`,
  };
}

// ── saved views ─────────────────────────────────────────────────────────

export async function listSavedViews() {
  const [rows]: any = await dbPool.query(
    `SELECT id, name, description, query_json, scope, is_shared, sort_order, created_at
       FROM omnichannel_saved_views ORDER BY sort_order, name`
  );
  return rows.map((r: any) => ({
    id: r.id, name: r.name, description: r.description,
    query: safeJson(r.query_json), scope: r.scope,
    shared: !!r.is_shared, sortOrder: r.sort_order, createdAt: r.created_at,
  }));
}

export async function saveView(input: {
  name: string; description?: string; query: unknown;
  scope?: string; shared?: boolean; ownerUserId?: number | null;
}) {
  await dbPool.execute(
    `INSERT INTO omnichannel_saved_views
       (name, description, query_json, scope, is_shared, owner_user_id)
     VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       description = VALUES(description),
       query_json = VALUES(query_json),
       scope      = VALUES(scope),
       is_shared  = VALUES(is_shared)`,
    [input.name, input.description ?? null, JSON.stringify(input.query ?? {}),
     input.scope ?? 'conversations', input.shared === false ? 0 : 1,
     input.ownerUserId ?? null]
  );
}

export async function deleteView(id: number) {
  await dbPool.execute('DELETE FROM omnichannel_saved_views WHERE id = ?', [id]);
}

// ── quick replies + canned responses ────────────────────────────────────

export async function listQuickReplies(channel?: string) {
  const [rows]: any = await dbPool.query(
    `SELECT id, title, body, shortcut, channel, usage_count
       FROM omnichannel_quick_replies
      WHERE channel IS NULL OR channel = ?
      ORDER BY usage_count DESC, title`,
    // An empty/undefined channel means "all channels"; passing '' would make
    // the `channel = ''` branch match nothing useful and hide global rows.
    [channel && channel !== 'all' ? channel : '__none__']
  );
  return rows;
}

export async function listCannedResponses(channel?: string) {
  const [rows]: any = await dbPool.query(
    `SELECT id, title, body, channel, usage_count
       FROM omnichannel_canned_responses
      WHERE channel IS NULL OR channel = ?
      ORDER BY usage_count DESC, title`,
    [channel && channel !== 'all' ? channel : '__none__']
  );
  return rows;
}

/** Count a canned/quick reply use so the useful ones float to the top. */
export async function bumpUsage(table: 'quick_replies' | 'canned_responses', id: number) {
  const t = table === 'quick_replies' ? 'omnichannel_quick_replies' : 'omnichannel_canned_responses';
  await dbPool.execute(`UPDATE ${t} SET usage_count = usage_count + 1 WHERE id = ?`, [id]);
}

export async function saveQuickReply(input: {
  id?: number; title: string; body: string; shortcut?: string;
  channel?: string | null; createdBy?: number | null;
}) {
  if (input.id) {
    await dbPool.execute(
      'UPDATE omnichannel_quick_replies SET title=?, body=?, shortcut=?, channel=? WHERE id=?',
      [input.title, input.body, input.shortcut ?? null, input.channel ?? null, input.id]
    );
    return input.id;
  }
  // title is UNIQUE, so a plain INSERT makes re-saving an existing reply
  // fail with a duplicate-key error — editing a reply was impossible.
  // Upsert on title instead.
  await dbPool.execute(
    `INSERT INTO omnichannel_quick_replies (title, body, shortcut, channel, created_by)
     VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
       body     = VALUES(body),
       shortcut = VALUES(shortcut),
       channel  = VALUES(channel)`,
    [input.title, input.body, input.shortcut ?? null, input.channel ?? null, input.createdBy ?? null]
  );
  const [sel]: any = await dbPool.execute(
    'SELECT id FROM omnichannel_quick_replies WHERE title = ?', [input.title]
  );
  return (sel[0] as any)?.id ?? null;
}

export async function deleteQuickReply(id: number) {
  await dbPool.execute('DELETE FROM omnichannel_quick_replies WHERE id = ?', [id]);
}

// ── helpers ─────────────────────────────────────────────────────────────

function safeJson(v: unknown): any {
  if (v && typeof v === 'object') return v;
  try { return JSON.parse(String(v)); } catch { return {}; }
}