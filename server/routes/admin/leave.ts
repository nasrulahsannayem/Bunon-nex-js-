import express from 'express';
import { dbPool } from '../../db';

const router = express.Router();

// Additive safety: table already exists in dash DB; keep idempotent.
async function ensureTable() {
  await dbPool.execute(
    `CREATE TABLE IF NOT EXISTS leave_requests (
      id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_name VARCHAR(100) NOT NULL,
      leave_type ENUM('Casual','Sick','Emergency') NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      reason TEXT NULL,
      admin_comment TEXT NULL,
      status ENUM('Pending','Approved','Rejected') DEFAULT 'Pending',
      reviewed_by VARCHAR(100) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`
  );
}
ensureTable().catch((e) => console.error('[leave] ensureTable:', e.message));

const actorOf = (req: any): string =>
  String(req.user?.phone || req.user?.name || req.body?.user_name || req.query?.user || 'staff');

// POST /api/admin/leave/apply — ছুটির আবেদন
router.post('/apply', async (req: any, res) => {
  try {
    const userName = String(req.body?.user_name || actorOf(req)).trim();
    const leaveType = String(req.body?.leave_type || '').trim();
    const startDate = String(req.body?.start_date || '').trim();
    const endDate = String(req.body?.end_date || '').trim();
    const reason = String(req.body?.reason || '').trim();
    if (!userName || !leaveType || !startDate || !endDate) {
      return res.status(400).json({ ok: false, msg: 'প্রয়োজনীয় তথ্য দিন (user/leave_type/start/end)' });
    }
    if (!['Casual', 'Sick', 'Emergency'].includes(leaveType)) {
      return res.status(400).json({ ok: false, msg: 'ভুল ছুটির ধরন' });
    }
    await ensureTable();
    const [r]: any = await dbPool.execute(
      `INSERT INTO leave_requests (user_name, leave_type, start_date, end_date, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [userName, leaveType, startDate, endDate, reason || null]
    );
    res.json({ ok: true, msg: 'ছুটির আবেদন জমা হয়েছে', id: r.insertId });
  } catch (e: any) {
    console.error('[leave] apply:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

// GET /api/admin/leave — তালিকা (?mine=1 | ?status=Pending)
router.get('/', async (req: any, res) => {
  try {
    await ensureTable();
    const role = req.user?.role;
    const mine = String(req.query?.mine || '') === '1';
    const status = String(req.query?.status || '').trim();
    const where: string[] = [];
    const params: any[] = [];
    if (mine || role === 'staff') {
      where.push('user_name = ?');
      params.push(actorOf(req));
    }
    if (['Pending', 'Approved', 'Rejected'].includes(status)) {
      where.push('status = ?');
      params.push(status);
    }
    const sql =
      `SELECT id, user_name, leave_type, start_date, end_date, reason, admin_comment, status, reviewed_by, created_at
       FROM leave_requests${where.length ? ' WHERE ' + where.join(' AND ') : ''}
       ORDER BY created_at DESC LIMIT 500`;
    const [rows]: any = await dbPool.execute(sql, params);
    res.json({ ok: true, requests: rows });
  } catch (e: any) {
    console.error('[leave] list:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

// POST /api/admin/leave/:id/approve — অনুমোদন (admin/super_admin)
router.post('/:id/approve', async (req: any, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user?.role)) {
      return res.status(403).json({ ok: false, msg: 'অনুমতি নেই' });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: 'ভুল ID' });
    await dbPool.execute(
      `UPDATE leave_requests SET status = 'Approved', admin_comment = ?, reviewed_by = ? WHERE id = ?`,
      [req.body?.comment || null, actorOf(req), id]
    );
    res.json({ ok: true, msg: 'ছুটি অনুমোদিত' });
  } catch (e: any) {
    console.error('[leave] approve:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

// POST /api/admin/leave/:id/reject — বাতিল (admin/super_admin)
router.post('/:id/reject', async (req: any, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user?.role)) {
      return res.status(403).json({ ok: false, msg: 'অনুমতি নেই' });
    }
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: 'ভুল ID' });
    await dbPool.execute(
      `UPDATE leave_requests SET status = 'Rejected', admin_comment = ?, reviewed_by = ? WHERE id = ?`,
      [req.body?.comment || null, actorOf(req), id]
    );
    res.json({ ok: true, msg: 'ছুটি বাতিল হয়েছে' });
  } catch (e: any) {
    console.error('[leave] reject:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

export default router;
