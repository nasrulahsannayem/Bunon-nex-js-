import express from 'express';
import { dbPool } from '../../db';

const router = express.Router();

/**
 * Steadfast rider notes.
 *
 * The courier webhook lives on the separate dash host
 * (dash.bunonfabrics.com/planner/api/orders/steadfast_webhook.php) and already
 * writes every tracking step into bf_notifications as type='courier'. This
 * router is only the read side for the bunonfabrics.com admin panel, so the two
 * apps share one table rather than duplicating courier events.
 *
 * 18,963 rows have accumulated here, and staff work through them, so the
 * unread badge and the popup must never miss a note that arrives mid-shift.
 */

/** Longest rider note we render before the popup itself gets unwieldy. */
const POPUP_MAX = 220;

router.get('/', async (req: any, res: any) => {
  try {
    const sinceId = Math.max(0, parseInt(String(req.query.since_id ?? '0'), 10) || 0);
    const onlyUnread = String(req.query.unread ?? '') === '1';
    const sinceSec = Math.max(0, parseInt(String(req.query.since_sec ?? '0'), 10) || 0);

    const where: string[] = [];
    const params: any[] = [];
    if (sinceId > 0) {
      where.push('id > ?');
      params.push(sinceId);
    } else if (onlyUnread) {
      where.push('is_read = 0');
    }

    // A client that opened after a note was written still needs to be told
    // about it. Filtering purely on id > cursor meant anything that arrived
    // between the page load and the first poll was skipped forever, so an
    // id-based window is used when the client supplies one and a recency
    // window otherwise.
    if (sinceId === 0 && sinceSec > 0) {
      where.push('created_at >= DATE_SUB(NOW(), INTERVAL ? SECOND)');
      params.push(sinceSec);
    }

    // Only rider notes trigger the popup/bell. System courier events
    // (tracking updates) are surfaced by the orders screen, not here.
    where.push("type = 'rider_note'");
    const clause = `WHERE ${where.join(' AND ')}`;

    const [rows]: any = await dbPool.execute(
      `SELECT id, order_id, invoice, consignment_id, type, title, message, is_read, created_at
         FROM bf_notifications ${clause}
        ORDER BY id DESC LIMIT 30`,
      params
    );

    const [unreadRows]: any = await dbPool.execute(
      `SELECT COUNT(*) AS c FROM bf_notifications
        WHERE is_read = 0 AND type = 'rider_note'`
    );

    // Highest id is what the client stores as its cursor, so a note that lands
    // between two polls is still delivered on the next one.
    const [maxRows]: any = await dbPool.execute(
      `SELECT COALESCE(MAX(id), 0) AS m FROM bf_notifications`
    );

    res.json({
      ok: true,
      unread: Number(unreadRows?.[0]?.c || 0),
      maxId: Number(maxRows?.[0]?.m || 0),
      notifications: (rows || []).map((n: any) => ({
        id: Number(n.id),
        orderId: n.order_id ? Number(n.order_id) : null,
        invoice: n.invoice || '',
        consignmentId: n.consignment_id || '',
        type: n.type,
        title: n.title || 'Rider Note',
        message: String(n.message || '').slice(0, POPUP_MAX),
        isRead: Number(n.is_read) === 1,
        createdAt: n.created_at,
      })),
    });
  } catch (e: any) {
    console.error('[admin/notifications] Error:', e?.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching notifications' });
  }
});

router.post('/read', async (req: any, res: any) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isInteger) : [];
    if (ids.length === 0) {
      const [r]: any = await dbPool.execute(
        `UPDATE bf_notifications SET is_read = 1 WHERE is_read = 0 AND type = 'rider_note'`
      );
      return res.json({ ok: true, updated: r?.affectedRows ?? 0 });
    }
    const ph = ids.map(() => '?').join(',');
    const [r]: any = await dbPool.execute(
      `UPDATE bf_notifications SET is_read = 1 WHERE id IN (${ph})`, ids
    );
    res.json({ ok: true, updated: r?.affectedRows ?? 0 });
  } catch (e: any) {
    console.error('[admin/notifications/read] Error:', e?.message);
    res.status(500).json({ ok: false, msg: 'Server error marking notifications read' });
  }
});

// The dash dashboard already has a working "reply to rider" flow
// (planner/api/orders/reply_to_rider.php) that forwards a note to Steadfast
// over their rider-messaging API. Reimplementing that flow here would create a
// second source of truth for rider replies, so this route forwards to the same
// endpoint with the same payload shape instead.
const DASH_REPLY_URL =
  process.env.DASH_REPLY_URL ||
  'https://dash.bunonfabrics.com/api/orders/reply_to_rider.php';

router.post('/reply', async (req: any, res: any) => {
  try {
    const consignmentId = String(req.body?.consignment_id || '').trim();
    const note = String(req.body?.note || '').trim();
    if (!consignmentId || !note) {
      return res.status(400).json({ ok: false, msg: 'consignment_id and note are required' });
    }
    if (note.length > 500) {
      return res.status(400).json({ ok: false, msg: 'নোট ৫০০ অক্ষরের মধ্যে লিখুন' });
    }

    const r = await fetch(DASH_REPLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consignment_id: consignmentId, note }),
    });
    const txt = await r.text();
    let j: any = {};
    try { j = JSON.parse(txt); } catch { j = { status: 'error', message: txt.slice(0, 200) }; }

    if (j?.status === 'success') return res.json({ ok: true });
    res.status(502).json({ ok: false, msg: j?.message || 'রাইডারের কাছে মেসেজ পাঠানো যায়নি' });
  } catch (e: any) {
    console.error('[admin/notifications/reply] Error:', e?.message);
    res.status(500).json({ ok: false, msg: 'Server error sending rider reply' });
  }
});

export default router;