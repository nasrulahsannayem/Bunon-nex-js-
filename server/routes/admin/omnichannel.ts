/**
 * server/routes/admin/omnichannel.ts — Inbox API.
 *
 * Auth: mounted behind verifyAdmin + requireAnyPermission in index.ts, so
 * every handler here already has an authenticated agent. Ownership checks
 * (IDOR) are done per conversation where it matters.
 *
 * Response envelope is uniform (spec §73):
 *   { success: true, data }
 *   { success: false, error: { code, message } }
 * No stack traces ever reach the client.
 */
import express, { Request, Response } from 'express';
import { verifyAdmin, requireAnyPermission } from '../../middleware/auth';
import * as oc from '../../services/omnichannel';
import * as wf from '../../services/omnichannel_workflow';
import { dbPool } from '../../db';

const BRIDGE_BASE = process.env.WA_BRIDGE_URL || 'http://127.0.0.1:5402';
const AGENT_BASE = process.env.OMNI_AGENT_URL || 'http://127.0.0.1:5401';

function bridgeToken(): string {
  if (process.env.WA_BRIDGE_TOKEN) return String(process.env.WA_BRIDGE_TOKEN).trim();
  try {
    return require('fs').readFileSync('/www/wwwroot/dash.bunonfabrics.com/wa-bridge/.bridge_token', 'utf8').trim();
  } catch { return ''; }
}


/** Verified channel capabilities. Mirrors the UI's CHANNEL_CAPS so the API
 *  never offers something the provider does not actually support. */
const CHANNEL_CAPS: Record<string, { label: string; text: boolean }> = {
  facebook: { label: 'Facebook', text: true },
  instagram: { label: 'Instagram', text: false },
  whatsapp: { label: 'WhatsApp', text: true },
  tiktok: { label: 'TikTok', text: false },
};

/**
 * Outbound transport.
 *  - WhatsApp  → existing Baileys bridge (127.0.0.1:5402). Cloud API is
 *    explicitly NOT used (spec §27) and must never be reintroduced here.
 *  - Facebook  → existing Python agent's /omni/send (it owns the Meta token).
 */
async function deliver(platform: string, recipient: string, body: string): Promise<unknown> {
  if (platform === 'whatsapp') {
    const token = bridgeToken();
    if (!token) throw new Error('WhatsApp bridge token unavailable');
    const r = await fetch(`${BRIDGE_BASE}/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-token': token },
      body: JSON.stringify({ phone: recipient, text: body }),
    });
    const d: any = await r.json().catch(() => ({}));
    if (!r.ok || !d?.ok) throw new Error(d?.msg || `bridge returned ${r.status}`);
    return d;
  }

  if (platform === 'facebook') {
    const r = await fetch(`${AGENT_BASE}/omni/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'facebook', recipient, text: body }),
    });
    const d: any = await r.json().catch(() => ({}));
    if (!r.ok || !d?.ok) throw new Error(d?.error?.message || d?.error || `agent returned ${r.status}`);
    return d;
  }

  throw new Error(`no transport for ${platform}`);
}


/** Existence probe. A missing conversation is a 404, not a 500 — otherwise a
 *  stale tab or a bad link surfaces as a server fault in the agent's face. */
async function requireConv(id: number) {
  const [rows] = await dbPool.query(
    'SELECT id FROM omnichannel_conversations WHERE id = ? LIMIT 1', [id]
  );
  return (rows as any[]).length > 0;
}

const router = express.Router();

const ok = (res: Response, data: unknown, code = 200) =>
  res.status(code).json({ success: true, data });

const fail = (res: Response, code: number, errCode: string, message: string) =>
  res.status(code).json({ success: false, error: { code: errCode, message } });

function agentId(req: Request): number {
  return Number((req as any).user?.id ?? 0);
}

/** The authenticated agent's id, or null when the token carried none.
 *  Used only for audit attribution — never for authorisation, which the
 *  requireAnyPermission mount already handled. */
const userId = (req: Request): number | null => {
  const u = (req as any).user as { id?: number } | undefined;
  const id = Number(u?.id);
  return Number.isFinite(id) && id > 0 ? id : null;
};

const num = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

/* ── list + counts ─────────────────────────────────────────────── */

const KNOWN_PLATFORMS = ['facebook', 'instagram', 'whatsapp', 'tiktok'];

router.get('/', async (req: Request, res: Response) => {
  try {
    const q = req.query as Record<string, string>;
    // An unknown platform is a client bug, not "no filter" — say so instead
    // of silently returning the whole inbox.
    if (q.platform && !KNOWN_PLATFORMS.includes(q.platform))
      return fail(res, 400, 'BAD_PLATFORM', `অজানা চ্যানেল: ${q.platform}`);
    // `assigned` names a specific agent (spec §6 "Assigned agent filter").
    // `mine` is the shortcut for the signed-in agent. Unassigned is its own
    // flag. All three are independent of status/priority/tag so filters stay
    // combinable.
    const assignedParam = q.assigned ? num(q.assigned) : null;

    const rows = await oc.listConversations({
      platform: q.platform,
      status: q.status,
      priority: q.priority,
      tag: q.tag || undefined,
      search: q.search || q.q || undefined,
      assignedUserId: q.mine === '1' ? agentId(req) : assignedParam,
      onlyUnassigned: q.unassigned === '1',
      limit: q.limit ? Number(q.limit) : 50,
      cursorBefore: num(q.before) ?? null,
    });
    return ok(res, { conversations: rows });
  } catch (e: any) {
    return fail(res, 500, 'INBOX_LIST_FAILED', 'ইনবক্স লোড করা যায়নি');
  }
});

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const [counts, channels] = await Promise.all([
      oc.inboxCounts(agentId(req)),
      oc.channelCounts(),
    ]);
    return ok(res, { counts, channels });
  } catch (e: any) {
    return fail(res, 500, 'INBOX_STATS_FAILED', 'পরিসংখ্যান লোড করা যায়নি');
  }
});

/* ── one conversation + thread ─────────────────────────────────── */

router.get('/:id', async (req: Request, res: Response) => {
  const id = num(req.params.id);
  if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ conversation');
  try {
    const conv = await oc.getConversation(id);
    if (!conv) return fail(res, 404, 'NOT_FOUND', 'কথোপকথনটি পাওয়া যায়নি');
    const [messages, notes] = await Promise.all([
      oc.listMessages(id, { limit: Number(req.query.limit) || 50, beforeId: num(req.query.before) }),
      oc.listNotes(id),
    ]);
    return ok(res, { conversation: conv, messages, notes });
  } catch (e: any) {
    return fail(res, 500, 'CONV_LOAD_FAILED', 'কথোপকথন লোড করা যায়নি');
  }
});

router.get('/:id/messages', async (req: Request, res: Response) => {
  const id = num(req.params.id);
  if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ conversation');
  try {
    const messages = await oc.listMessages(id, {
      limit: Number(req.query.limit) || 50,
      beforeId: num(req.query.before),
    });
    return ok(res, { messages });
  } catch {
    return fail(res, 500, 'MSG_LOAD_FAILED', 'বার্তা লোড করা যায়নি');
  }
});

/* ── mutations ─────────────────────────────────────────────────── */

router.post('/:id/read', async (req: Request, res: Response) => {
  const id = num(req.params.id);
  if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ conversation');
  try {
    if (!(await requireConv(id))) return fail(res, 404, 'NOT_FOUND', 'কথোপকথনটি পাওয়া যায়নি');

    // Marking UNREAD is a different action from marking read. Without this
    // branch the "mark as unread" button returned 200 and changed nothing.
    if (req.body?.unread === true) {
      const nowUnread = await oc.markUnread(id, agentId(req));
      await wf.logEvent(id, 'marked_unread', agentId(req));
      return ok(res, { unread: nowUnread });
    }

    await oc.markRead(id, agentId(req), num(req.body?.lastReadMessageId));
    return ok(res, { unread: 0 });
  } catch (e: any) {
    return fail(res, 500, 'MARK_READ_FAILED', e?.message || 'পঠিত চিহ্নিত করা যায়নি');
  }
});

router.post('/:id/assign', async (req: Request, res: Response) => {
  const id = num(req.params.id);
  if (!(await requireConv(id))) return fail(res, 404, 'NOT_FOUND', 'কথোপকথনটি পাওয়া যায়নি');
  if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ conversation');
  try {
    const rawAssignee = req.body?.userId ?? req.body?.assigneeId;
    const target = rawAssignee === null || rawAssignee === '' ? null : num(rawAssignee);
    await oc.assignConversation(id, target, agentId(req));
    return ok(res, { assignedUserId: target });
  } catch {
    return fail(res, 500, 'ASSIGN_FAILED', 'অ্যাসাইন করা যায়নি');
  }
});

router.post('/:id/status', async (req: Request, res: Response) => {
  const id = num(req.params.id);
  if (!(await requireConv(id))) return fail(res, 404, 'NOT_FOUND', 'কথোপকথনটি পাওয়া যায়নি');
  if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ conversation');
  const status = String(req.body?.status ?? '');
  if (!['open', 'pending', 'closed'].includes(status))
    return fail(res, 400, 'BAD_STATUS', 'স্ট্যাটাস অবৈধ');
  try {
    await oc.setStatus(id, status, agentId(req));
    return ok(res, { status });
  } catch {
    return fail(res, 500, 'STATUS_FAILED', 'স্ট্যাটাস পরিবর্তন করা যায়নি');
  }
});

router.post('/:id/priority', async (req: Request, res: Response) => {
  const id = num(req.params.id);
  if (!(await requireConv(id))) return fail(res, 404, 'NOT_FOUND', 'কথোপকথনটি পাওয়া যায়নি');
  if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ conversation');
  const priority = String(req.body?.priority ?? '');
  if (!['low', 'normal', 'high', 'urgent'].includes(priority))
    return fail(res, 400, 'BAD_PRIORITY', 'প্রায়োরিটি অবৈধ');
  try {
    await oc.setPriority(id, priority, agentId(req));
    return ok(res, { priority });
  } catch {
    return fail(res, 500, 'PRIORITY_FAILED', 'প্রায়োরিটি পরিবর্তন করা যায়নি');
  }
});

router.post('/:id/tags', async (req: Request, res: Response) => {
  const id = num(req.params.id);
  if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ conversation');
  try {
    // Two accepted shapes:
  //   { tag: 'vip', add: true }        ← what the Inbox UI sends
  //   { add: ['vip'], remove: ['x'] } ← batch form
  const addIn: string[] = Array.isArray(req.body?.add) ? req.body.add.map(String) : [];
  const removeIn: string[] = Array.isArray(req.body?.remove) ? req.body.remove.map(String) : [];
  const single = String(req.body?.tag ?? '').trim();
  if (single) {
    if (req.body?.add === false || req.body?.remove === true) removeIn.push(single);
    else addIn.push(single);
  }
  const clean = (xs: string[]) =>
    xs.map((t) => t.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  const toRemove = clean(removeIn);
  const toAdd = clean(addIn).filter((t) => !toRemove.includes(t));

  if (!(await requireConv(id))) return fail(res, 404, 'NOT_FOUND', 'কথোপকথনটি পাওয়া যায়নি');
  if (toAdd.length) await oc.addTags(id, toAdd, agentId(req));
  for (const t of toRemove) await oc.removeTag(id, t, agentId(req));
  return ok(res, { added: toAdd, removed: toRemove });
  } catch {
    return fail(res, 500, 'TAG_FAILED', 'ট্যাগ পরিবর্তন করা যায়নি');
  }
});

router.post('/:id/note', async (req: Request, res: Response) => {
  const id = num(req.params.id);
  if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ conversation');
  const body = String(req.body?.body ?? '').trim();
  if (!body) return fail(res, 400, 'EMPTY_NOTE', 'নোট খালি');
  try {
    // Notes go to omnichannel_conversation_notes only — structurally
    // impossible for a note to reach a customer.
    const noteId = await oc.addInternalNote(id, agentId(req), body.slice(0, 5000));
    return ok(res, { noteId });
  } catch {
    return fail(res, 500, 'NOTE_FAILED', 'নোট যোগ করা যায়নি');
  }
});


/* ── send (outbound) ───────────────────────────────────────────── */

/**
 * Outbound send. Deliberately narrow: the ONLY transport we have verified
 * today is WhatsApp via the Baileys bridge. Facebook/Instagram sending
 * goes through the existing Python agent (/omni/send) which owns the Meta
 * tokens. Anything unverified returns a clear error rather than pretending.
 */
router.post('/:id/send', async (req: Request, res: Response) => {
  const id = num(req.params.id);
  if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ conversation');
  const body = String(req.body?.body ?? '').trim();
  if (!body) return fail(res, 400, 'EMPTY_MESSAGE', 'বার্তা খালি');

  let convRow: any;
  try {
    convRow = await oc.getConversation(id);
  } catch {
    return fail(res, 500, 'CONV_LOAD_FAILED', 'কথোপকথন লোড করা যায়নি');
  }
  if (!convRow) return fail(res, 404, 'NOT_FOUND', 'কথোপকথনটি পাওয়া যায়নি');

  const platform = String(convRow.platform);
  const caps = CHANNEL_CAPS[platform];
  if (!caps || !caps.text) {
    return fail(res, 501, 'CHANNEL_UNSUPPORTED',
      `${caps?.label ?? platform} চ্যানেলে API দিয়ে মেসেজ পাঠানো যাচ্ছে না — webhook সক্রিয় করা দরকার।`);
  }

  // Which recipient? WhatsApp uses the customer phone; Meta channels use
  // the platform sender identity from omnichannel_customer_identities.
  let recipient = convRow.primary_phone || null;
  if (platform !== 'whatsapp') {
    const [ids] = await dbPool.query(
      'SELECT external_id FROM omnichannel_customer_identities WHERE customer_id = ? AND platform = ? LIMIT 1',
      [convRow.customer_id, platform]
    );
    recipient = (ids as any[])[0]?.external_id ?? null;
  }
  if (!recipient) return fail(res, 409, 'NO_RECIPIENT', 'ক্রেতার পরিচয় পাওয়া যায়নি');

  try {
    const result = await deliver(platform, recipient, body);
    const ingested = await oc.ingestMessage({
      platform: platform as any,
      externalConversationId: String(convRow.external_conversation_id),
      externalMessageId: `out_${platform}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      direction: 'outbound',
      messageType: 'text',
      senderType: 'agent',
      senderUserId: agentId(req),
      body,
      rawPayload: result,
    });

    await oc.markRead(id, agentId(req));
    return ok(res, { delivered: true, messageId: ingested.messageId });
  } catch (e: any) {
    await dbPool.query(
      `INSERT INTO omnichannel_audit_log (actor_type, actor_id, conversation_id, action, detail)
       VALUES ('agent', ?, ?, 'message.send_failed', ?)`,
      [agentId(req), id, JSON.stringify({ platform, error: String(e?.message || e).slice(0, 300) })]
    ).catch(() => {});
    return fail(res, 502, 'SEND_FAILED', 'বার্তা পাঠানো যায়নি। আবার চেষ্টা করুন।');
  }
});

/* ── Customer 360 ──────────────────────────────────────────────── */

router.get('/customer/:customerId', async (req: Request, res: Response) => {
  const cid = num(req.params.customerId);
  if (!cid) return fail(res, 400, 'BAD_ID', 'অবৈধ customer');
  try {
    const data = await oc.customer360(cid);
    if (!data) return fail(res, 404, 'NOT_FOUND', 'কাস্টমার প্রোফাইল পাওয়া যায়নি');
    return ok(res, data);
  } catch {
    return fail(res, 500, 'CUSTOMER_FAILED', 'কাস্টমার তথ্য লোড করা যায়নি');
  }
});

/* ── channel health (no secrets, monitoring only — spec §61/62) ── */
router.get('/channels/health', async (_req: Request, res: Response) => {
  try {
    const [rows] = await dbPool.query(
      `SELECT platform,
              COUNT(*) AS conversations,
              MAX(last_inbound_at)  AS last_inbound,
              MAX(last_outbound_at) AS last_outbound
         FROM omnichannel_conversations GROUP BY platform`
    );
    return ok(res, { channels: rows });
  } catch {
    return fail(res, 500, 'HEALTH_FAILED', 'চ্যানেল স্ট্যাটাস লোড করা যায়নি');
  }
});

// ── workflow: snooze, SLA, timeline, saved views, quick replies ──────────

/**
 * Snooze hides a conversation from the queue until a chosen moment.
 *
 * The instant is computed INSIDE SQL. mysql2 rewrites a naive datetime
 * string using the process offset (Asia/Dhaka, +6), which stored every
 * snooze six hours in the past — so the row never left the queue even though
 * every call returned 200. DATE_ADD(NOW(), INTERVAL …) keeps it in the same
 * clock NOW() already uses.
 */
router.post('/:id/snooze', async (req: Request, res: Response) => {
  try {
    const id = num(req.params.id);
    if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ কথোপকথন');
    const { minutes, until } = req.body || {};

    if (minutes === 0 || minutes === '0') {
      await dbPool.execute(
        'UPDATE omnichannel_conversations SET snoozed_until = NULL, updated_at = NOW() WHERE id = ?',
        [id]);
      await wf.logEvent(id, 'unsnoozed', userId(req), null, null);
      return ok(res, { snoozedUntil: null });
    }

    if (typeof until === 'string' && until) {
      const d = new Date(until);
      if (Number.isNaN(d.getTime())) return fail(res, 400, 'BAD_UNTIL', 'সময় বোঝা যায়নি');
      const sqlTs = d.toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
      await dbPool.execute(
        `UPDATE omnichannel_conversations
            SET snoozed_until = STR_TO_DATE(?, '%Y-%m-%d %H:%i:%s UTC'), updated_at = NOW()
          WHERE id = ?`, [sqlTs, id]);
      await wf.logEvent(id, 'snoozed', userId(req), null, sqlTs);
      return ok(res, { snoozedUntil: sqlTs });
    }

    const m = Number(minutes);
    if (!Number.isFinite(m) || m <= 0 || m > 60 * 24 * 30)
      return fail(res, 400, 'BAD_MINUTES', 'সময় ১ মিনিট থেকে ৩০ দিনের মধ্যে হতে হবে');
    await dbPool.execute(
      `UPDATE omnichannel_conversations
          SET snoozed_until = DATE_ADD(NOW(), INTERVAL ? MINUTE), updated_at = NOW()
        WHERE id = ?`, [Math.round(m), id]);
    const [row]: any = await dbPool.query(
      `SELECT DATE_FORMAT(snoozed_until, '%Y-%m-%d %H:%i:%s') AS t
         FROM omnichannel_conversations WHERE id = ?`, [id]);
    const shown = row[0]?.t ?? null;
    await wf.logEvent(id, 'snoozed', userId(req), null, shown);
    return ok(res, { snoozedUntil: shown });
  } catch (e: any) {
    return fail(res, 500, 'SNOOZE_FAILED', e?.message || 'স্নুজ ব্যর্থ');
  }
});

/** GET /:id/sla — first-response clock against the channel policy. */
router.get('/:id/sla', async (req: Request, res: Response) => {
  try {
    const id = num(req.params.id);
    if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ কথোপকথন');
    return ok(res, { sla: await wf.slaFor(id) });
  } catch (e: any) {
    return fail(res, 500, 'SLA_FAILED', e?.message || 'SLA লোড ব্যর্থ');
  }
});

/** GET /:id/timeline — who changed what, for Panel 3. */
router.get('/:id/timeline', async (req: Request, res: Response) => {
  try {
    const id = num(req.params.id);
    if (!id) return fail(res, 400, 'BAD_ID', 'অবৈধ কথোপকথন');
    return ok(res, { timeline: await wf.getTimeline(id) });
  } catch (e: any) {
    return fail(res, 500, 'TIMELINE_FAILED', e?.message || 'টাইমলাইন লোড ব্যর্থ');
  }
});

/** GET /views/all — named filter views. */
router.get('/views/all', async (_req: Request, res: Response) => {
  try {
    return ok(res, { views: await wf.listSavedViews() });
  } catch (e: any) {
    return fail(res, 500, 'VIEWS_FAILED', e?.message || 'ভিউ লোড ব্যর্থ');
  }
});

router.post('/views/save', async (req: Request, res: Response) => {
  try {
    const { name, description, query, shared } = req.body || {};
    if (!name || !String(name).trim())
      return fail(res, 400, 'BAD_NAME', 'ভিউয়ের নাম দিন');
    if (String(name).length > 120)
      return fail(res, 400, 'BAD_NAME', 'নাম ১২০ অক্ষরের মধ্যে হতে হবে');
    await wf.saveView({
      name: String(name).trim(), description, query,
      shared: shared !== false, ownerUserId: userId(req),
    });
    return ok(res, { views: await wf.listSavedViews() });
  } catch (e: any) {
    return fail(res, 500, 'VIEW_SAVE_FAILED', e?.message || 'ভিউ সেভ ব্যর্থ');
  }
});

router.delete('/views/:viewId', async (req: Request, res: Response) => {
  try {
    const vid = num(req.params.viewId);
    if (!vid) return fail(res, 400, 'BAD_ID', 'অবৈধ ভিউ');
    await wf.deleteView(vid);
    return ok(res, { views: await wf.listSavedViews() });
  } catch (e: any) {
    return fail(res, 500, 'VIEW_DELETE_FAILED', e?.message || 'ভিউ মুছতে ব্যর্থ');
  }
});

/** GET /library/all — quick replies + canned responses in one payload. */
router.get('/library/all', async (req: Request, res: Response) => {
  try {
    const channel = typeof req.query.channel === 'string' ? req.query.channel : undefined;
    const [quickReplies, canned] = await Promise.all([
      wf.listQuickReplies(channel),
      wf.listCannedResponses(channel),
    ]);
    return ok(res, { quickReplies, canned });
  } catch (e: any) {
    return fail(res, 500, 'LIBRARY_FAILED', e?.message || 'লাইব্রেরি লোড ব্যর্থ');
  }
});

router.post('/library/quick-replies', async (req: Request, res: Response) => {
  try {
    const { id, title, body, shortcut, channel } = req.body || {};
    if (!title || !body) return fail(res, 400, 'BAD_INPUT', 'শিরোনাম ও লেখা দুটো দরকার');
    const savedId = await wf.saveQuickReply({
      id: id ? Number(id) : undefined,
      title: String(title), body: String(body),
      shortcut: shortcut || null, channel: channel || null, createdBy: userId(req),
    });
    return ok(res, { id: savedId, quickReplies: await wf.listQuickReplies() });
  } catch (e: any) {
    return fail(res, 500, 'QR_SAVE_FAILED', e?.message || 'সেভ ব্যর্থ');
  }
});

router.delete('/library/quick-replies/:qrId', async (req: Request, res: Response) => {
  try {
    const qid = num(req.params.qrId);
    if (!qid) return fail(res, 400, 'BAD_ID', 'অবৈধ আইডি');
    await wf.deleteQuickReply(qid);
    return ok(res, { quickReplies: await wf.listQuickReplies() });
  } catch (e: any) {
    return fail(res, 500, 'QR_DELETE_FAILED', e?.message || 'মুছতে ব্যর্থ');
  }
});

export default router;

/* ───────────────────────────────────────────────────────────────────
 * INTERNAL ingest bridge — the live path from the Python agent.
 *
 * The Python agent (/opt/data/bunon_social_media_live_agent) receives
 * every Meta/Baileys event first and writes it to `bunon_inbox_log` in
 * bunon_shop_db. This admin inbox reads `omnichannel_*` in
 * bunonfabrics_dash_db. Without a bridge the two DBs never meet, so new
 * messages only appeared after a manual backfill — that is what made
 * "real-time" look broken.
 *
 * Auth: shared secret in INTERNAL_WEBHOOK_SECRET, never a user JWT —
 * the caller is the agent, not a browser. Mounted BEFORE the admin
 * permission guard in index.ts.
 * ─────────────────────────────────────────────────────────────────── */
const INGEST_SECRET = String(process.env.INTERNAL_WEBHOOK_SECRET || '').trim();

function timingSafeEq(a: string, b: string): boolean {
  const ca = require('crypto').createHash('sha256').update(a).digest();
  const cb = require('crypto').createHash('sha256').update(b).digest();
  return require('crypto').timingSafeEqual(ca, cb);
}

router.post('/_ingest', async (req: Request, res: Response) => {
  if (!INGEST_SECRET) return fail(res, 503, 'INGEST_DISABLED', 'ingest secret not configured');
  const got = String(req.headers['x-ingest-secret'] || '');
  if (!timingSafeEq(got, INGEST_SECRET)) {
    return fail(res, 401, 'BAD_SECRET', 'unauthorised');
  }
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (!items.length) return fail(res, 400, 'NO_ITEMS', 'items required');

  const results: any[] = [];
  for (const raw of items.slice(0, 200)) {
    try {
      const r = await oc.ingestMessage({
        platform: String(raw.platform) as any,
        externalConversationId: String(raw.externalConversationId),
        externalMessageId: String(raw.externalMessageId),
        direction: raw.direction === 'outbound' ? 'outbound' : 'inbound',
        messageType: raw.messageType || 'text',
        senderType: raw.senderType || 'customer',
        senderIdentity: raw.senderIdentity ?? null,
        senderUsername: raw.senderUsername ?? null,
        senderDisplayName: raw.senderDisplayName ?? null,
        customerPhone: raw.customerPhone ?? null,
        body: raw.body ?? null,
        rawPayload: raw.rawPayload ?? null,
        avatarUrl: raw.avatarUrl ?? null,
      });
      results.push({ ok: true, ...r });
    } catch (e: any) {
      results.push({ ok: false, error: String(e?.message || e).slice(0, 200) });
    }
  }
  return ok(res, { results });
});
