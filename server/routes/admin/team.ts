import express from 'express';
import { dbPool, productDbPool } from '../../db';
import { requirePermission } from '../../middleware/auth';

const router = express.Router();

// GET /api/admin/team/summary — টিম KPI (confirm/pack/ship per actor, bf_order_logs parsing)
// ?days=30 (default 30)
router.get('/summary', requirePermission('view_kpi_orders'), async (req: any, res) => {
  try {
    const days = Math.min(Math.max(Number(req.query?.days) || 30, 1), 365);
    const [rows]: any = await dbPool.execute(
      `SELECT created_by AS actor,
        SUM(CASE WHEN message LIKE '%to confirmed%' THEN 1 ELSE 0 END) AS confirmed,
        SUM(CASE WHEN message LIKE '%to ready_to_ship%' THEN 1 ELSE 0 END) AS packed,
        SUM(CASE WHEN message LIKE '%to in_transit%' THEN 1 ELSE 0 END) AS shipped,
        SUM(CASE WHEN message LIKE '%to delivered%' THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN message LIKE '%to cancelled%' THEN 1 ELSE 0 END) AS cancelled,
        COUNT(*) AS total_logs
       FROM bf_order_logs
       WHERE log_type IN ('status', 'status_update')
         AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY created_by
       ORDER BY confirmed DESC`,
      [String(days)]
    );
    const perActor = (rows as any[]).map((r) => ({
      actor: r.actor,
      confirmed: Number(r.confirmed) || 0,
      packed: Number(r.packed) || 0,
      shipped: Number(r.shipped) || 0,
      delivered: Number(r.delivered) || 0,
      cancelled: Number(r.cancelled) || 0,
      total_logs: Number(r.total_logs) || 0,
    }));
    const totals = perActor.reduce(
      (a, r) => ({
        confirmed: a.confirmed + r.confirmed,
        packed: a.packed + r.packed,
        shipped: a.shipped + r.shipped,
        delivered: a.delivered + r.delivered,
        cancelled: a.cancelled + r.cancelled,
        total_logs: a.total_logs + r.total_logs,
      }),
      { confirmed: 0, packed: 0, shipped: 0, delivered: 0, cancelled: 0, total_logs: 0 }
    );
    res.json({ ok: true, days, totals, per_actor: perActor });
  } catch (e: any) {
    console.error('[team] summary:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

// GET /api/admin/team/active — সক্রিয় ইউজার (bunon_users.last_login)
router.get('/active', requirePermission('view_kpi_orders'), async (req: any, res) => {
  try {
    await productDbPool.execute(
      `ALTER TABLE bunon_users ADD COLUMN IF NOT EXISTS last_login DATETIME NULL`
    ).catch(() => {});
    let rows: any[];
    try {
      const [r]: any = await productDbPool.execute(
        `SELECT id, name, phone, role, last_login,
           TIMESTAMPDIFF(SECOND, last_login, NOW()) AS seconds_ago
         FROM bunon_users
         WHERE role != 'customer' AND last_login IS NOT NULL
         ORDER BY last_login DESC LIMIT 100`
      );
      rows = r;
    } catch {
      // last_login কলাম না থাকলে updated_at ফলব্যাক
      const [r]: any = await productDbPool.execute(
        `SELECT id, name, phone, role, updated_at AS last_login,
           TIMESTAMPDIFF(SECOND, updated_at, NOW()) AS seconds_ago
         FROM bunon_users
         WHERE role != 'customer'
         ORDER BY updated_at DESC LIMIT 100`
      );
      rows = r;
    }
    const users = (rows as any[]).map((u) => ({
      id: u.id,
      name: u.name,
      phone: u.phone,
      role: u.role,
      last_login: u.last_login,
      online: u.seconds_ago !== null && Number(u.seconds_ago) <= 1200,
    }));
    res.json({ ok: true, count: users.length, users });
  } catch (e: any) {
    console.error('[team] active:', e.message);
    res.status(500).json({ ok: false, msg: 'সার্ভার ত্রুটি' });
  }
});

export default router;
