import express from 'express';
import fs from 'fs';
import { dbPool } from '../../db';

const router = express.Router();
const BRIDGE_BASE = process.env.WA_BRIDGE_URL || 'http://127.0.0.1:5402';
const BRIDGE_TOKEN_FILE = '/www/wwwroot/dash.bunonfabrics.com/wa-bridge/.bridge_token';

function bridgeToken(): string {
  if (process.env.WA_BRIDGE_TOKEN) return String(process.env.WA_BRIDGE_TOKEN).trim();
  try {
    return fs.readFileSync(BRIDGE_TOKEN_FILE, 'utf8').trim();
  } catch { return ''; }
}

// Normalize phone: 01XXXXXXXXX / 1XXXXXXXXX -> 880..., must be 13 digits ^8801\d{9}$
export function normPhone(raw: string): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  let p = d;
  if (/^01\d{9}$/.test(d)) p = '880' + d.slice(1);
  else if (/^1\d{9}$/.test(d)) p = '880' + d;
  if (!/^8801\d{9}$/.test(p)) return null;
  return p;
}

let tablesReady = false;
export async function ensureWaTables(): Promise<void> {
  if (tablesReady) return;
  await dbPool.execute(
    'CREATE TABLE IF NOT EXISTS bf_wa_messages (' +
    'id BIGINT AUTO_INCREMENT PRIMARY KEY, phone VARCHAR(20) NOT NULL, ' +
    "direction ENUM('in','out') NOT NULL, " +
    "msg_type ENUM('text','image','audio','video','voice','document','other') DEFAULT 'text', " +
    'body TEXT NULL, media_path VARCHAR(255) NULL, wa_msg_id VARCHAR(128) NULL, ' +
    "status ENUM('queued','sent','delivered','read','failed') DEFAULT 'queued', " +
    'error_code VARCHAR(64) NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP, sent_at DATETIME NULL, ' +
    'UNIQUE KEY uq_wa_msg (wa_msg_id), INDEX ix_phone_created (phone, created_at DESC))'
  );
  await dbPool.execute(
    'CREATE TABLE IF NOT EXISTS bf_wa_templates (' +
    'id INT AUTO_INCREMENT PRIMARY KEY, title VARCHAR(100) NOT NULL, body TEXT NOT NULL, ' +
    'created_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
  );
  await dbPool.execute(
    'CREATE TABLE IF NOT EXISTS bf_wa_autoreply (' +
    'phone VARCHAR(20) PRIMARY KEY, welcome_sent TINYINT DEFAULT 0, last_offhour_at DATETIME NULL)'
  );
  await dbPool.execute(
    'CREATE TABLE IF NOT EXISTS bf_wa_known (' +
    'phone VARCHAR(20) PRIMARY KEY, has_wa TINYINT DEFAULT 0, checked_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
  );
  const [rows]: any = await dbPool.execute('SELECT COUNT(*) AS c FROM bf_wa_templates');
  if (!rows[0].c) {
    const seeds: [string, string][] = [
      ['অর্ডার কনফার্ম', 'আসসালামু আলাইকুম {name}, আপনার অর্ডার {invoice} কনফার্ম হয়েছে। মোট: {amount} টাকা। - বুনন'],
      ['কুরিয়ার আপডেট', 'আসসালামু আলাইকুম {name}, আপনার অর্ডার {invoice} ({status})। - বুনন'],
      ['ক্যাশ রিমাইন্ডার', 'আসসালামু আলাইকুম {name}, {invoice} অর্ডারে {amount} টাকা বকেয়া আছে। - বুনন'],
      ['ফলোআপ', 'আসসালামু আলাইকুম {name}, {invoice} অর্ডারটি এখনো পেন্ডিং। কনফার্ম করবেন? - বুনন'],
      ['AUTO welcome', 'আসসালামু আলাইকুম! বুনন ফ্যাব্রিক্সে স্বাগতম। কীভাবে সাহায্য করতে পারি?'],
      ['AUTO offhour', '[AUTO] আমরা এখন অফলাইন (রাত ১০টা-সকাল ৮টা)। সকালে রিপ্লাই দেব ইনশাআল্লাহ।'],
      ['AUTO courier', '[AUTO] {name}, আপনার অর্ডার {invoice} এখন {status}। মোট: {amount} টাকা। - বুনন'],
      ['AUTO followup', '[AUTO] {name}, {invoice} অর্ডারটি পেন্ডিং আছে।'],
      ['AUTO cancel', '[AUTO] {name}, {invoice} অর্ডারটি বাতিল হয়েছে। দুঃখিত। - বুনন'],
      ['AUTO status', '[AUTO] {name}, {invoice} স্ট্যাটাস: {status}। - বুনন'],
    ];
    for (const [t, b] of seeds) await dbPool.execute('INSERT INTO bf_wa_templates (title, body) VALUES (?, ?)', [t, b]);
  }
  tablesReady = true;
}

async function bridge(path: string, init?: any): Promise<any> {
  const r = await fetch(BRIDGE_BASE + path, {
    ...init,
    headers: { 'Content-Type': 'application/json', 'x-bridge-token': bridgeToken(), ...((init && init.headers) || {}) },
    signal: AbortSignal.timeout(25000),
  });
  return r.json();
}

function fillTpl(body: string, o: any): string {
  return String(body || '').replace('{name}', o.customer_name || '').replace('{invoice}', o.invoice || '')
    .replace('{amount}', String(o.total_payable ?? '')).replace('{status}', o.status || '');
}

// GET /api/admin/whatsapp/status (bridge passthrough)
router.get('/status', async (_req, res) => {
  try { res.json(await bridge('/status')); }
  catch (e: any) { res.status(502).json({ ok: false, connected: false, msg: 'bridge down: ' + e.message }); }
});

// GET /api/admin/whatsapp/conversations?limit=
router.get('/conversations', async (req, res) => {
  try {
    await ensureWaTables();
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const [rows]: any = await dbPool.execute(
      'SELECT m.phone, m.direction, m.msg_type, m.body, m.created_at, ' +
      "(SELECT o.customer_name FROM bf_orders o WHERE REPLACE(REPLACE(REPLACE(o.phone,' ',''),'-',''),'+','') LIKE CONCAT('%', RIGHT(m.phone,10)) ORDER BY o.id DESC LIMIT 1) AS cname " +
      'FROM bf_wa_messages m INNER JOIN (SELECT phone, MAX(id) AS mx FROM bf_wa_messages GROUP BY phone) t ON t.mx = m.id ' +
      'ORDER BY m.id DESC LIMIT ' + Number(limit)
    );
    res.json({ ok: true, conversations: rows });
  } catch (e: any) { res.status(500).json({ ok: false, msg: e.message }); }
});

// GET /api/admin/whatsapp/history?phone=&limit=
router.get('/history', async (req, res) => {
  try {
    await ensureWaTables();
    const phone = normPhone(String(req.query.phone || ''));
    if (!phone) return res.status(400).json({ ok: false, msg: 'invalid phone' });
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const [rows]: any = await dbPool.execute(
      'SELECT direction, msg_type, body, media_path, created_at FROM bf_wa_messages WHERE phone = ? ORDER BY id ASC LIMIT ' + Number(limit), [phone]
    );
    res.json({ ok: true, messages: rows });
  } catch (e: any) { res.status(500).json({ ok: false, msg: e.message }); }
});

// POST /api/admin/whatsapp/check {phone}
router.post('/check', async (req, res) => {
  try {
    const phone = normPhone(String(req.body.phone || ''));
    if (!phone) return res.status(400).json({ ok: false, msg: 'invalid phone' });
    res.json(await bridge('/check-number', { method: 'POST', body: JSON.stringify({ phone }) }));
  } catch (e: any) { res.status(502).json({ ok: false, msg: 'bridge down: ' + e.message }); }
});

// POST /api/admin/whatsapp/send-text {phone, text}
router.post('/send-text', async (req, res) => {
  try {
    await ensureWaTables();
    const phone = normPhone(String(req.body.phone || ''));
    const text = String(req.body.text || '');
    if (!phone) return res.status(400).json({ ok: false, msg: 'invalid phone' });
    if (!text || text.length > 4000) return res.status(400).json({ ok: false, msg: 'text 1..4000 chars' });
    const out: any = await bridge('/send-text', { method: 'POST', body: JSON.stringify({ phone, text }) });
    if (out && out.ok) {
      await dbPool.execute(
        "INSERT INTO bf_wa_messages (phone, direction, msg_type, body, wa_msg_id, status, sent_at) VALUES (?, 'out', 'text', ?, ?, 'sent', NOW()) ON DUPLICATE KEY UPDATE status='sent'", [phone, text, out.wa_msg_id || null]
      );
    }
    res.json(out);
  } catch (e: any) { res.status(502).json({ ok: false, msg: 'bridge down: ' + e.message }); }
});

// POST /api/admin/whatsapp/send-media {phone, caption, mime, data_b64}
router.post('/send-media', async (req, res) => {
  try {
    await ensureWaTables();
    const phone = normPhone(String(req.body.phone || ''));
    const caption = String(req.body.caption || '');
    const mime = String(req.body.mime || '');
    const data_b64 = String(req.body.data_b64 || '');
    if (!phone) return res.status(400).json({ ok: false, msg: 'invalid phone' });
    if (!data_b64 || data_b64.length > 22000000) return res.status(400).json({ ok: false, msg: 'media missing/too large' });
    const out: any = await bridge('/send-media', { method: 'POST', body: JSON.stringify({ phone, caption, mime, data_b64 }) });
    if (out && out.ok) {
      const mt = out.msg_type === 'video' ? 'video' : out.msg_type === 'voice' ? 'voice' : mime.startsWith('image/') ? 'image' : mime.startsWith('audio/') ? 'audio' : 'document';
      await dbPool.execute(
        "INSERT INTO bf_wa_messages (phone, direction, msg_type, body, wa_msg_id, status, sent_at) VALUES (?, 'out', ?, ?, ?, 'sent', NOW()) ON DUPLICATE KEY UPDATE status='sent'", [phone, mt, caption, out.wa_msg_id || null]
      );
    }
    res.json(out);
  } catch (e: any) { res.status(502).json({ ok: false, msg: 'bridge down: ' + e.message }); }
});

// POST /api/admin/whatsapp/send-bulk {phones[], text}
router.post('/send-bulk', async (req, res) => {
  try {
    await ensureWaTables();
    const phones = (Array.isArray(req.body.phones) ? req.body.phones : []).map((p: any) => normPhone(String(p))).filter(Boolean) as string[];
    const text = String(req.body.text || '');
    if (!phones.length || phones.length > 200) return res.status(400).json({ ok: false, msg: 'phones 1..200' });
    if (!text || text.length > 4000) return res.status(400).json({ ok: false, msg: 'text 1..4000 chars' });
    const out: any = await bridge('/send-bulk', { method: 'POST', body: JSON.stringify({ phones, text }) });
    if (out && out.ok && Array.isArray(out.results)) {
      for (const r of out.results) {
        if (r && r.ok) await dbPool.execute("INSERT INTO bf_wa_messages (phone, direction, msg_type, body, status, sent_at) VALUES (?, 'out', 'text', ?, 'sent', NOW())", [r.phone, text]);
      }
    }
    res.json(out);
  } catch (e: any) { res.status(502).json({ ok: false, msg: 'bridge down: ' + e.message }); }
});

// GET/POST/DELETE templates (AUTO* hidden from list; reused by auto-notify)
router.get('/templates', async (_req, res) => {
  try {
    await ensureWaTables();
    const [rows]: any = await dbPool.execute("SELECT id, title, body FROM bf_wa_templates WHERE title NOT LIKE 'AUTO%' ORDER BY id ASC");
    res.json({ ok: true, templates: rows });
  } catch (e: any) { res.status(500).json({ ok: false, msg: e.message }); }
});
router.post('/templates', async (req, res) => {
  try {
    await ensureWaTables();
    const title = String(req.body.title || '').slice(0, 100);
    const body = String(req.body.body || '');
    if (!title || !body) return res.status(400).json({ ok: false, msg: 'title+body required' });
    const [r]: any = await dbPool.execute('INSERT INTO bf_wa_templates (title, body) VALUES (?, ?)', [title, body]);
    res.json({ ok: true, id: (r as any).insertId });
  } catch (e: any) { res.status(500).json({ ok: false, msg: e.message }); }
});
router.delete('/templates/:id', async (req, res) => {
  try {
    await ensureWaTables();
    await dbPool.execute('DELETE FROM bf_wa_templates WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ ok: false, msg: e.message }); }
});

// POST /api/admin/whatsapp/incoming (bridge -> server saver; token-guarded)
router.post('/incoming', async (req, res) => {
  try {
    const tok = String(req.headers['x-bridge-token'] || '');
    const expect = bridgeToken();
    if (expect && tok !== expect) return res.status(403).json({ ok: false, msg: 'bad token' });
    await ensureWaTables();
    const phone = normPhone(String(req.body.phone || ''));
    if (!phone) return res.status(400).json({ ok: false, msg: 'invalid phone' });
    const mt = ['text','image','audio','video','voice','document','other'].includes(req.body.msg_type) ? req.body.msg_type : 'other';
    await dbPool.execute(
      "INSERT INTO bf_wa_messages (phone, direction, msg_type, body, media_path, wa_msg_id, status) VALUES (?, 'in', ?, ?, ?, ?, 'delivered') ON DUPLICATE KEY UPDATE status='delivered'", [phone, mt, req.body.body || null, req.body.media_path || null, req.body.wa_msg_id || null]
    );
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ ok: false, msg: e.message }); }
});

// Status-change auto-notify hook (fail-open: never throws)
export async function waAutoNotifyStatus(orderId: number, status: string): Promise<void> {
  try {
    await ensureWaTables();
    const [rows]: any = await dbPool.execute('SELECT invoice, customer_name, phone, total_payable, status FROM bf_orders WHERE id = ? LIMIT 1', [orderId]);
    if (!rows.length) return;
    const o = rows[0];
    const phone = normPhone(String(o.phone || ''));
    if (!phone) return;
    const s = String(status || o.status || '').toLowerCase();
    // known-WA cache (30-day recheck, fail-open on bridge error)
    let known = false;
    try {
      const [k]: any = await dbPool.execute('SELECT has_wa, checked_at FROM bf_wa_known WHERE phone = ? LIMIT 1', [phone]);
      const stale = !k.length || (Date.now() - new Date(k[0].checked_at).getTime()) > 30 * 864e5;
      if (!stale) known = !!k[0].has_wa;
      else {
        const chk: any = await bridge('/check-number', { method: 'POST', body: JSON.stringify({ phone }) });
        known = !!(chk && (chk.exists || chk.ok));
        await dbPool.execute('INSERT INTO bf_wa_known (phone, has_wa, checked_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE has_wa = VALUES(has_wa), checked_at = NOW()', [phone, known ? 1 : 0]);
      }
    } catch { return; }
    if (!known) return;
    const tplKey = /cancel/.test(s) ? 'AUTO cancel' : /deliver|complete/.test(s) ? 'AUTO delivered' : /transit|ship|ready|courier/.test(s) ? 'AUTO courier' : 'AUTO status';
    let tpl = tplKey;
    try {
      const [t]: any = await dbPool.execute('SELECT body FROM bf_wa_templates WHERE title = ? LIMIT 1', [tplKey]);
      if (!t.length) {
        const [g]: any = await dbPool.execute("SELECT body FROM bf_wa_templates WHERE title = 'AUTO status' LIMIT 1");
        if (!g.length) return;
        tpl = g[0].body;
      } else tpl = t[0].body;
    } catch { return; }
    const text = '[AUTO] ' + fillTpl(tpl, o);
    try {
      const out: any = await bridge('/send-text', { method: 'POST', body: JSON.stringify({ phone, text }) });
      if (out && out.ok) await dbPool.execute("INSERT INTO bf_wa_messages (phone, direction, msg_type, body, wa_msg_id, status, sent_at) VALUES (?, 'out', 'text', ?, ?, 'sent', NOW()) ON DUPLICATE KEY UPDATE status='sent'", [phone, text, out.wa_msg_id || null]);
    } catch { /* fail-open */ }
  } catch { /* fail-open */ }
}

export default router;
