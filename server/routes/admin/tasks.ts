import express from 'express';
import { dbPool } from '../../db';

const router = express.Router();

async function ensureTable() {
  await dbPool.execute(
    `CREATE TABLE IF NOT EXISTS tasks (
      id INT(11) NOT NULL AUTO_INCREMENT PRIMARY KEY,
      task_name TEXT NOT NULL,
      priority VARCHAR(20) NOT NULL DEFAULT 'medium',
      deadline DATE NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_by VARCHAR(50) NULL,
      assigned_to VARCHAR(100) NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'daily',
      completed_by VARCHAR(50) NULL,
      completed_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      sort_order INT(11) DEFAULT 0
    )`
  );
}
ensureTable().catch((e) => console.error('[tasks] ensureTable:', e.message));

const actorOf = (req: any): string =>
  String(req.user?.phone || req.user?.name || 'staff');
const isPrivileged = (req: any): boolean =>
  ['admin', 'super_admin'].includes(req.user?.role);

// Default deadline: +7 days (YYYY-MM-DD). POST without a valid deadline
// must not 500 (live tasks.deadline may be NOT NULL) — frontend sends ''.
const isValidDateStr = (v: any): boolean =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) && !isNaN(Date.parse(v.trim()));
const defaultDeadline = (): string =>
  new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);

// GET /api/admin/tasks — টাস্ক তালিকা (?status= ?assigned_to=)
router.get('/', async (req: any, res) => {
  try {
    await ensureTable();
    const where: string[] = [];
    const params: any[] = [];
    const status = String(req.query?.status || '').trim();
    const assignee = String(req.query?.assigned_to || '').trim();
    if (status) { where.push('status = ?'); params.push(status); }
    if (assignee) { where.push('assigned_to = ?'); params.push(assignee); }
    const [rows]: any = await dbPool.execute(
      `SELECT id, task_name, priority, deadline, status, created_by, assigned_to, type, completed_by, completed_at, created_at, sort_order
       FROM tasks${where.length ? ' WHERE ' + where.join(' AND ') : ''}
       ORDER BY sort_order ASC, created_at DESC LIMIT 500`,
      params
    );
    res.json({ ok: true, tasks: rows });
  } catch (e: any) {
    console.error('[tasks] list:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

// POST /api/admin/tasks — নতুন টাস্ক
router.post('/', async (req: any, res) => {
  try {
    const taskName = String(req.body?.task_name || '').trim();
    if (!taskName) return res.status(400).json({ ok: false, msg: 'টাস্কের নাম দিন' });
    const priority = ['low', 'medium', 'high'].includes(req.body?.priority) ? req.body.priority : 'medium';
    const type = ['daily', 'weekly', 'once'].includes(req.body?.type) ? req.body.type : 'daily';
    await ensureTable();
    const deadline = isValidDateStr(req.body?.deadline) ? String(req.body.deadline).trim() : defaultDeadline();
    const [r]: any = await dbPool.execute(
      `INSERT INTO tasks (task_name, priority, deadline, created_by, assigned_to, type)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [taskName, priority, deadline, actorOf(req), req.body?.assigned_to || null, type]
    );
    res.json({ ok: true, msg: 'টাস্ক তৈরি হয়েছে', id: r.insertId });
  } catch (e: any) {
    console.error('[tasks] create:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

// PATCH /api/admin/tasks/:id — এডিট
router.patch('/:id', async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: 'ভুল ID' });
    const sets: string[] = [];
    const params: any[] = [];
    for (const k of ['task_name', 'priority', 'type']) {
      if (req.body?.[k] !== undefined) { sets.push(`${k} = ?`); params.push(req.body[k]); }
    }
    // deadline: '' would 500 under strict DATE mode — normalize '' to NULL, reject garbage
    if (req.body?.deadline !== undefined) {
      const dl = req.body.deadline;
      if (dl === '' || dl === null) { sets.push('deadline = ?'); params.push(defaultDeadline()); }
      else if (isValidDateStr(dl)) { sets.push('deadline = ?'); params.push(String(dl).trim()); }
      else return res.status(400).json({ ok: false, msg: 'ভুল তারিখ (YYYY-MM-DD)' });
    }
    if (!sets.length) return res.status(400).json({ ok: false, msg: 'কিছুই বদলায়নি' });
    params.push(id);
    await dbPool.execute(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, params);
    res.json({ ok: true, msg: 'টাস্ক আপডেট হয়েছে' });
  } catch (e: any) {
    console.error('[tasks] patch:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

// POST /api/admin/tasks/:id/assign — অ্যাসাইন
router.post('/:id/assign', async (req: any, res) => {
  try {
    if (!isPrivileged(req)) return res.status(403).json({ ok: false, msg: 'অনুমতি নেই' });
    const id = Number(req.params.id);
    const to = String(req.body?.assigned_to || '').trim();
    if (!id || !to) return res.status(400).json({ ok: false, msg: 'ID ও assigned_to দিন' });
    await dbPool.execute(`UPDATE tasks SET assigned_to = ? WHERE id = ?`, [to, id]);
    res.json({ ok: true, msg: 'টাস্ক অ্যাসাইন হয়েছে' });
  } catch (e: any) {
    console.error('[tasks] assign:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

// POST /api/admin/tasks/:id/status — স্ট্যাটাস (pending/doing/done)
router.post('/:id/status', async (req: any, res) => {
  try {
    const id = Number(req.params.id);
    const status = String(req.body?.status || '').trim();
    if (!id || !['pending', 'doing', 'done'].includes(status)) {
      return res.status(400).json({ ok: false, msg: 'ভুল ID/স্ট্যাটাস' });
    }
    if (status === 'done') {
      await dbPool.execute(
        `UPDATE tasks SET status = 'done', completed_by = ?, completed_at = NOW() WHERE id = ?`,
        [actorOf(req), id]
      );
    } else {
      await dbPool.execute(`UPDATE tasks SET status = ?, completed_by = NULL, completed_at = NULL WHERE id = ?`, [status, id]);
    }
    res.json({ ok: true, msg: 'স্ট্যাটাস আপডেট হয়েছে' });
  } catch (e: any) {
    console.error('[tasks] status:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

// DELETE /api/admin/tasks/:id — মুছুন (admin/super_admin)
router.delete('/:id', async (req: any, res) => {
  try {
    if (!isPrivileged(req)) return res.status(403).json({ ok: false, msg: 'অনুমতি নেই' });
    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ ok: false, msg: 'ভুল ID' });
    await dbPool.execute(`DELETE FROM tasks WHERE id = ?`, [id]);
    res.json({ ok: true, msg: 'টাস্ক মুছে ফেলা হয়েছে' });
  } catch (e: any) {
    console.error('[tasks] delete:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

export default router;
