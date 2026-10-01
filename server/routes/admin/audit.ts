import express from 'express';
import { productDbPool } from '../../db';

const router = express.Router();

const AUDIT_DDL =
  'CREATE TABLE IF NOT EXISTS bunon_audit_logs (' +
  'id INT AUTO_INCREMENT PRIMARY KEY, ' +
  'actor_id INT NULL, actor_role VARCHAR(50) NULL, ' +
  'action VARCHAR(100) NOT NULL, module VARCHAR(100) NOT NULL, ' +
  'target VARCHAR(255) NULL, detail TEXT NULL, ' +
  'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, ' +
  'INDEX (module), INDEX (actor_id), INDEX (created_at))';
productDbPool.execute(AUDIT_DDL).catch(() => { /* best-effort */ });

// GET /api/admin/audit?module&actor&from&to&page — super_admin only
router.get('/', async (req: any, res) => {
  try {
    if (req?.user?.role !== 'super_admin')
      return res.status(403).json({ ok: false, msg: 'Super admin only' });
    await productDbPool.execute(AUDIT_DDL);
    const where: string[] = [];
    const params: any[] = [];
    if (req.query.module) { where.push('module = ?'); params.push(req.query.module); }
    if (req.query.actor) { where.push('actor_id = ?'); params.push(Number(req.query.actor)); }
    if (req.query.from) { where.push('DATE(created_at) >= ?'); params.push(req.query.from); }
    if (req.query.to) { where.push('DATE(created_at) <= ?'); params.push(req.query.to); }
    const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));
    const offset = (page - 1) * limit;
    const [rows]: any = await productDbPool.execute(
      'SELECT id, actor_id, actor_role, action, module, target, detail, created_at' +
      ' FROM bunon_audit_logs ' + whereStr + ' ORDER BY id DESC LIMIT ' + limit + ' OFFSET ' + offset,
      params
    );
    const [cnt]: any = await productDbPool.execute(
      'SELECT COUNT(*) AS total FROM bunon_audit_logs ' + whereStr, params
    );
    res.json({ ok: true, logs: rows, total: (cnt as any[])[0]?.total || 0, page, limit });
  } catch (e: any) {
    console.error('[Admin Audit] List error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
