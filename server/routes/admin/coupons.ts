import express from 'express';
import { productDbPool } from '../../db';
import { logAudit, auditCtx } from '../../utils/audit';

const router = express.Router();

// GET /api/admin/coupons — list all
router.get('/', async (_req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      'SELECT id, code, type, value, min_order, usage_limit, used_count, per_user_limit, starts_at, ends_at, status, created_at, updated_at FROM bunon_coupons ORDER BY id DESC LIMIT 200'
    );
    res.json({ ok: true, coupons: rows });
  } catch (e: any) {
    console.error('[Admin Coupons] List error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/coupons/:id
router.get('/:id', async (req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      'SELECT id, code, type, value, min_order, usage_limit, used_count, per_user_limit, starts_at, ends_at, status, created_at, updated_at FROM bunon_coupons WHERE id = ? LIMIT 1',
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Coupon not found' });
    res.json({ ok: true, coupon: rows[0] });
  } catch (e: any) {
    console.error('[Admin Coupons] Get error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/coupons — create
router.post('/', async (req, res) => {
  try {
    const { code, type, value, min_order, usage_limit, per_user_limit, starts_at, ends_at, status } = req.body || {};
    if (!code || !String(code).trim()) return res.status(400).json({ ok: false, msg: 'code required' });
    if (type && !['percent', 'flat'].includes(type)) return res.status(400).json({ ok: false, msg: 'type must be percent|flat' });
    const [r]: any = await productDbPool.execute(
      'INSERT INTO bunon_coupons (code, type, value, min_order, usage_limit, per_user_limit, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        String(code).trim().toUpperCase(),
        type || 'percent',
        value ?? 0,
        min_order ?? 0,
        usage_limit ?? null,
        per_user_limit ?? null,
        starts_at || null,
        ends_at || null,
        status || 'active',
      ]
    );
    res.json({ ok: true, id: r.insertId });
    void logAudit({ ...auditCtx(req), action: 'coupon_create', module: 'coupons', target: r.insertId, detail: String(code).trim().toUpperCase() });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, msg: 'Coupon code already exists' });
    console.error('[Admin Coupons] Create error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// PUT /api/admin/coupons/:id — update
router.put('/:id', async (req, res) => {
  try {
    const { code, type, value, min_order, usage_limit, per_user_limit, starts_at, ends_at, status } = req.body || {};
    if (type && !['percent', 'flat'].includes(type)) return res.status(400).json({ ok: false, msg: 'type must be percent|flat' });
    await productDbPool.execute(
      'UPDATE bunon_coupons SET code = COALESCE(?, code), type = COALESCE(?, type), value = COALESCE(?, value), min_order = COALESCE(?, min_order), usage_limit = ?, per_user_limit = ?, starts_at = ?, ends_at = ?, status = COALESCE(?, status) WHERE id = ?',
      [
        code ? String(code).trim().toUpperCase() : null,
        type ?? null,
        value ?? null,
        min_order ?? null,
        usage_limit ?? null,
        per_user_limit ?? null,
        starts_at || null,
        ends_at || null,
        status ?? null,
        req.params.id,
      ]
    );
    res.json({ ok: true });
    void logAudit({ ...auditCtx(req), action: 'coupon_update', module: 'coupons', target: req.params.id });
  } catch (e: any) {
    if (e.code === 'ER_DUP_ENTRY') return res.status(409).json({ ok: false, msg: 'Coupon code already exists' });
    console.error('[Admin Coupons] Update error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// DELETE /api/admin/coupons/:id
router.delete('/:id', async (req, res) => {
  try {
    await productDbPool.execute('DELETE FROM bunon_coupons WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
    void logAudit({ ...auditCtx(req), action: 'coupon_delete', module: 'coupons', target: req.params.id });
  } catch (e: any) {
    console.error('[Admin Coupons] Delete error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// POST /api/admin/coupons/validate { code, subtotal } -> { ok, discount }
router.post('/validate', async (req, res) => {
  try {
    const { code, subtotal } = req.body || {};
    if (!code) return res.status(400).json({ ok: false, msg: 'code required' });
    const sub = Number(subtotal || 0);
    const [rows]: any = await productDbPool.execute(
      'SELECT id, code, type, value, min_order, usage_limit, used_count, starts_at, ends_at, status FROM bunon_coupons WHERE code = ? LIMIT 1',
      [String(code).trim().toUpperCase()]
    );
    if (!rows.length) return res.status(404).json({ ok: false, msg: 'Invalid coupon code' });
    const c = rows[0];
    if (c.status !== 'active') return res.status(400).json({ ok: false, msg: 'Coupon is not active' });
    const now = new Date();
    if (c.starts_at && new Date(c.starts_at) > now) return res.status(400).json({ ok: false, msg: 'Coupon not yet valid' });
    if (c.ends_at && new Date(c.ends_at) < now) return res.status(400).json({ ok: false, msg: 'Coupon expired' });
    if (c.usage_limit != null && Number(c.used_count) >= Number(c.usage_limit)) {
      return res.status(400).json({ ok: false, msg: 'Coupon usage limit reached' });
    }
    if (sub < Number(c.min_order)) {
      return res.status(400).json({ ok: false, msg: 'Minimum order ' + c.min_order + ' required' });
    }
    let discount = 0;
    if (c.type === 'percent') discount = Math.round((sub * Number(c.value)) / 100 * 100) / 100;
    else discount = Math.min(Number(c.value), sub);
    res.json({ ok: true, discount, coupon: { code: c.code, type: c.type, value: Number(c.value) } });
  } catch (e: any) {
    console.error('[Admin Coupons] Validate error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
