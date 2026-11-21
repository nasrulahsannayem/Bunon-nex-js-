/**
 * Admin API for the WhatsApp order-status automation.
 *
 * Everything the admin UI needs in one place:
 *   GET    /automation/templates          list status templates
 *   PUT    /automation/templates/:status  edit one template
 *   POST   /automation/preview            render a message without sending
 *   POST   /automation/send               send for one order + status
 *   GET    /automation/log                recent sends with real errors
 *   GET    /automation/optin              list opt-in state
 *   POST   /automation/optin              set opt-in / opt-out
 */
import { Router } from 'express';
import { requirePermission } from '../../middleware/auth';
import { notifyOrderStatus, previewOrderStatus, normPhone } from '../../services/waOrderStatus';
import { dbPool } from '../../db';

const r = Router();

const can = requirePermission('view_marketing');

/* ── templates ─────────────────────────────────────────────────────────── */

r.get('/automation/templates', can, async (_req, res) => {
  try {
    const [rows]: any = await dbPool.query(
      `SELECT t.status, t.title, t.body, t.enabled, t.updated_at,
              (SELECT COUNT(*) FROM bf_wa_order_events e WHERE e.status = t.status) AS sent_count
       FROM bf_wa_status_templates t ORDER BY t.status`
    );
    res.json({ ok: true, templates: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

r.put('/automation/templates/:status', can, async (req, res) => {
  try {
    const { status } = req.params;
    const { title, body, enabled } = req.body || {};
    if (body !== undefined && String(body).trim().length < 5) {
      return res.status(422).json({ ok: false, error: 'Template body is too short' });
    }
    const sets: string[] = [];
    const params: any[] = [];
    if (title !== undefined) { sets.push('title = ?'); params.push(String(title).slice(0, 120)); }
    if (body !== undefined) { sets.push('body = ?'); params.push(String(body)); }
    if (enabled !== undefined) { sets.push('enabled = ?'); params.push(enabled ? 1 : 0); }
    if (!sets.length) return res.status(400).json({ ok: false, error: 'Nothing to update' });
    params.push(String(status).toLowerCase());
    await dbPool.query('UPDATE bf_wa_status_templates SET ' + sets.join(', ') + ' WHERE status = ?', params);
    res.json({ ok: true });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

/* ── preview / send ────────────────────────────────────────────────────── */

r.post('/automation/preview', can, async (req, res) => {
  const { order_id, status } = req.body || {};
  if (!order_id || !status) return res.status(400).json({ ok: false, error: 'order_id and status are required' });
  const p = await previewOrderStatus(order_id, status);
  res.status(p.ok ? 200 : 422).json(p);
});

r.post('/automation/send', can, async (req, res) => {
  const { order_id, status, force } = req.body || {};
  if (!order_id || !status) return res.status(400).json({ ok: false, error: 'order_id and status are required' });
  const out = await notifyOrderStatus(order_id, status, { force: !!force });
  res.status(out.sent ? 200 : 422).json({ ok: out.sent, ...out });
});

/* ── log ───────────────────────────────────────────────────────────────── */

r.get('/automation/log', can, async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number((req.query as any).limit) || 60));
    const [rows]: any = await dbPool.query(
      `SELECT e.id, e.order_id, e.status, e.phone, e.state, e.error, e.created_at, e.sent_at,
              o.invoice, o.customer_name
       FROM bf_wa_order_events e
       LEFT JOIN bf_orders o ON o.id = e.order_id
       ORDER BY e.id DESC LIMIT ?`,
      [String(limit)]
    );
    const [counts]: any = await dbPool.query(
      `SELECT state, COUNT(*) AS c FROM bf_wa_order_events GROUP BY state`
    );
    res.json({ ok: true, events: rows, counts });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

/* ── opt-in ────────────────────────────────────────────────────────────── */

r.get('/automation/optin', can, async (_req, res) => {
  try {
    const [rows]: any = await dbPool.query(
      `SELECT o.phone, COALESCE(w.opted_in, 1) AS opted_in, w.source, w.updated_at
       FROM (SELECT DISTINCT phone FROM bf_orders WHERE phone IS NOT NULL AND phone <> '') o
       LEFT JOIN bf_wa_opt_in w ON w.phone = o.phone
       ORDER BY o.phone LIMIT 500`
    );
    res.json({ ok: true, contacts: rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

r.post('/automation/optin', can, async (req, res) => {
  try {
    const phone = normPhone((req.body || {}).phone);
    const opted = (req.body || {}).opted_in ? 1 : 0;
    if (!phone) return res.status(422).json({ ok: false, error: 'Invalid Bangladeshi phone number' });
    await dbPool.query(
      `INSERT INTO bf_wa_opt_in (phone, opted_in, source) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE opted_in = VALUES(opted_in), source = VALUES(source)`,
      [phone, opted, String((req.body || {}).source || 'admin')]
    );
    res.json({ ok: true, phone, opted_in: opted });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message });
  }
});

export default r;