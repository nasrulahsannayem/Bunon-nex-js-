import express from 'express';
import { dbPool, productDbPool } from '../../db';
import { requireAnyPermission, requirePermission } from '../../middleware/auth';
import { bestImageFor, toAbsoluteImageUrl, isLocalImageUrl, parseMaybeJSON } from '../../services/imageUrl';

const router = express.Router();

// GET /api/admin/reports/sales?from=YYYY-MM-DD&to=YYYY-MM-DD — per-day revenue/orders/AOV from bf_orders
router.get('/sales', requirePermission('view_kpi_sales'), async (req, res) => {
  try {
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const from = (req.query.from as string) || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
    const [rows]: any = await dbPool.execute(
      'SELECT DATE(created_at) AS day, COUNT(id) AS orders,' +
      ' COALESCE(SUM(total_payable),0) AS revenue, COALESCE(AVG(total_payable),0) AS aov' +
      ' FROM bf_orders WHERE DATE(created_at) BETWEEN ? AND ?' +
      ' GROUP BY DATE(created_at) ORDER BY day ASC',
      [from, to]
    );
    const days = (rows as any[]).map((r: any) => ({
      day: r.day instanceof Date ? r.day.toISOString().slice(0, 10) : String(r.day),
      orders: Number(r.orders || 0),
      revenue: Number(r.revenue || 0),
      aov: Number(r.aov || 0),
    }));
    const totals = days.reduce(
      (a: any, d: any) => ({ orders: a.orders + d.orders, revenue: a.revenue + d.revenue }),
      { orders: 0, revenue: 0 }
    );
    res.json({ ok: true, from, to, days, totals, aov: totals.orders ? totals.revenue / totals.orders : 0 });
  } catch (e: any) {
    console.error('[Admin Reports] Sales error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/reports/courier — by courier_code: count, delivered rate, revenue
router.get('/courier', requirePermission('view_kpi_orders'), async (_req, res) => {
  try {
    const [rows]: any = await dbPool.execute(
      "SELECT COALESCE(NULLIF(courier_code,''),'manual') AS courier," +
      ' COUNT(id) AS orders, COALESCE(SUM(total_payable),0) AS revenue,' +
      " COUNT(CASE WHEN status IN ('delivered','completed','complete','courier_complete') THEN 1 END) AS delivered" +
      " FROM bf_orders GROUP BY COALESCE(NULLIF(courier_code,''),'manual') ORDER BY orders DESC"
    );
    const couriers = (rows as any[]).map((r: any) => ({
      courier: r.courier,
      orders: Number(r.orders || 0),
      delivered: Number(r.delivered || 0),
      delivered_rate: r.orders ? Number(r.delivered || 0) / Number(r.orders) : 0,
      revenue: Number(r.revenue || 0),
    }));
    res.json({ ok: true, couriers });
  } catch (e: any) {
    console.error('[Admin Reports] Courier error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/reports/returns — bunon_returns count by status + rate vs total orders
router.get('/returns', requirePermission('view_kpi_orders'), async (_req, res) => {
  try {
    const [byStatus]: any = await dbPool.execute('SELECT status, COUNT(id) AS n FROM bunon_returns GROUP BY status');
    const [tot]: any = await dbPool.execute('SELECT COUNT(id) AS total_orders FROM bf_orders');
    const [retTot]: any = await dbPool.execute('SELECT COUNT(id) AS total_returns FROM bunon_returns');
    const totalOrders = Number((tot as any[])[0]?.total_orders || 0);
    const totalReturns = Number((retTot as any[])[0]?.total_returns || 0);
    res.json({
      ok: true,
      by_status: (byStatus as any[]).map((r: any) => ({ status: r.status, count: Number(r.n || 0) })),
      total_returns: totalReturns,
      total_orders: totalOrders,
      return_rate: totalOrders ? totalReturns / totalOrders : 0,
    });
  } catch (e: any) {
    console.error('[Admin Reports] Returns error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/reports/coupons — used_count + estimated discount liability
router.get('/coupons', requirePermission('view_coupons'), async (_req, res) => {
  try {
    const [rows]: any = await productDbPool.execute(
      'SELECT id, code, type, value, usage_limit, used_count, status FROM bunon_coupons ORDER BY id DESC LIMIT 200'
    );
    const coupons = (rows as any[]).map((c: any) => {
      const used = Number(c.used_count || 0);
      const remaining = c.usage_limit != null ? Math.max(0, Number(c.usage_limit) - used) : null;
      const est_liability = c.type === 'flat' && remaining != null ? Number(c.value || 0) * remaining : null;
      return {
        id: c.id, code: c.code, type: c.type, value: Number(c.value || 0),
        usage_limit: c.usage_limit, used_count: used, remaining, est_liability, status: c.status,
      };
    });
    const totalUsed = coupons.reduce((a: number, c: any) => a + c.used_count, 0);
    const totalLiability = coupons.reduce((a: number, c: any) => a + (c.est_liability || 0), 0);
    res.json({ ok: true, coupons, total_used: totalUsed, total_estimated_liability: totalLiability });
  } catch (e: any) {
    console.error('[Admin Reports] Coupons error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// GET /api/admin/reports/export?from&to — orders CSV download
router.get('/export', requirePermission('view_kpi_sales'), async (req, res) => {
  try {
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const from = (req.query.from as string) || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
    const [rows]: any = await dbPool.execute(
      'SELECT id, invoice, customer_name, phone, city, subtotal, delivery_fee, discount,' +
      ' total_payable, payment_method, status, courier_code, created_at' +
      ' FROM bf_orders WHERE DATE(created_at) BETWEEN ? AND ? ORDER BY id ASC LIMIT 10000',
      [from, to]
    );
    const esc = (v: any) => {
      if (v == null) return '';
      const s = v instanceof Date ? v.toISOString() : String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const head = 'id,invoice,customer_name,phone,city,subtotal,delivery_fee,discount,total_payable,payment_method,status,courier_code,created_at';
    const lines = (rows as any[]).map((r: any) =>
      [r.id, r.invoice, r.customer_name, r.phone, r.city, r.subtotal, r.delivery_fee, r.discount,
       r.total_payable, r.payment_method, r.status, r.courier_code, r.created_at].map(esc).join(',')
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders_' + from + '_' + to + '.csv"');
    res.send(head + '\n' + lines.join('\n'));
  } catch (e: any) {
    console.error('[Admin Reports] Export error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});


// GET /api/admin/reports/top-products?from&to&limit — per-product orders/sales/cancelled%/return% + image
router.get('/top-products', requirePermission('view_kpi_products'), async (req, res) => {
  try {
    const to = (req.query.to as string) || new Date().toISOString().slice(0, 10);
    const from = (req.query.from as string) || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
    const limit = Math.min(Number(req.query.limit) || 10, 50);
    const [rows]: any = await dbPool.execute(
      'SELECT i.product_name AS name,' +
      " MAX(COALESCE(NULLIF(i.image,''),NULLIF(i.product_thumb,''),NULLIF(i.thumb,''))) AS image," +
      ' COUNT(DISTINCT i.order_id) AS orders,' +
      ' COALESCE(SUM(i.line_total),0) AS sales,' +
      " SUM(CASE WHEN o.status IN ('cancelled','cancell') THEN 1 ELSE 0 END) AS cancelled," +
      " SUM(CASE WHEN o.status IN ('return','returned','partial_returned') THEN 1 ELSE 0 END) AS returned" +
      ' FROM bf_order_items i LEFT JOIN bf_orders o ON o.id = i.order_id' +
      ' WHERE DATE(o.created_at) BETWEEN ? AND ?' +
      ' GROUP BY i.product_name ORDER BY orders DESC LIMIT ' + limit,
      [from, to]
    );
    const products = (rows as any[]).map((r: any) => ({ name: r.name, image: r.image ? toAbsoluteImageUrl(r.image) : null,
      orders: Number(r.orders || 0), sales: Number(r.sales || 0),
      cancelled: Number(r.cancelled || 0), returned: Number(r.returned || 0),
      cancelled_pct: r.orders ? +(Number(r.cancelled || 0) * 100 / Number(r.orders)).toFixed(1) : 0,
      return_pct: r.orders ? +(Number(r.returned || 0) * 100 / Number(r.orders)).toFixed(1) : 0 }));
    // Fallback: order items rarely store images — fill blanks from shop product catalog by name
    try {
      const missing = products.filter(p => !p.image).map(p => p.name);
      if (missing.length) {
        const [cats]: any = await productDbPool.execute(
          'SELECT name, thumbnail, local_images FROM bunon_products WHERE name IN (' + missing.map(() => '?').join(',') + ')',
          missing
        );
        const byName: Record<string, any> = {};
        for (const c of (cats as any[])) {
          // Shared normalizer: parses the raw JSON column, absolutises relative
          // paths, prefers a local /uploads file over a dead WP hotlink.
          byName[String(c.name)] = bestImageFor(c.local_images, c.thumbnail);
        }
        for (const p of products) {
          const local = byName[p.name];
          if (!local) { if (p.image) p.image = toAbsoluteImageUrl(p.image); continue; }
          // Replace a remote/order-item image with the local catalog file.
          if (!p.image || !isLocalImageUrl(p.image)) p.image = local;
        }
      }
    } catch {}
    res.json({ ok: true, from, to, products });
  } catch (e: any) {
    console.error('[Admin Reports] Top-products error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

export default router;
