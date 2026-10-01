import express from 'express';
import { dbPool } from '../../db';
import { requirePermission } from '../../middleware/auth';
import { bestImageFor, toAbsoluteImageUrl, isLocalImageUrl, parseMaybeJSON } from '../../services/imageUrl';

const router = express.Router();

// GET /api/admin/kpi/advanced?from=YYYY-MM-DD&to=YYYY-MM-DD&status=
router.get('/advanced', requirePermission('view_kpi_advanced'), async (req, res) => {
  const from = (req.query.from as string) || '';
  const to = (req.query.to as string) || '';
  const status = (req.query.status as string) || '';

  const where: string[] = [];
  const params: any[] = [];
  if (from) { where.push('created_at >= ?'); params.push(from + ' 00:00:00'); }
  if (to) { where.push('created_at <= ?'); params.push(to + ' 23:59:59'); }
  if (status && status !== 'all') { where.push('status = ?'); params.push(status); }
  const W = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const num = (v: any) => Number(v || 0);

  const out: any = { ok: true };

  // ---- funnel ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT status, COUNT(id) AS c FROM bf_orders ' + W + ' GROUP BY status', params);
    const m: Record<string, number> = {};
    for (const r of rows) m[String(r.status || '').toLowerCase()] = num(r.c);
    const pending = m['pending'] || 0, confirmed = m['confirmed'] || 0,
      ready = m['ready'] || 0, in_transit = (m['in_transit'] || 0) + (m['shipped'] || 0),
      delivered = m['delivered'] || 0;
    const total = Object.values(m).reduce((a, b) => a + b, 0);
    let avg_delay_hours = 0, slow_stage = '';
    try {
      const [d]: any = await dbPool.execute(
        'SELECT AVG(TIMESTAMPDIFF(HOUR, created_at, updated_at)) AS h FROM bf_orders ' +
        (W ? W + ' AND' : 'WHERE') + ' status = \'delivered\'', params);
      avg_delay_hours = num(d[0]?.h);
    } catch { /* best-effort */ }
    const stages = { pending, confirmed, ready, in_transit };
    slow_stage = Object.entries(stages).sort((a, b) => b[1] - a[1])[0]?.[0] || '';
    out.funnel = { pending, confirmed, ready, in_transit, delivered,
      conversion_pct: total ? +(delivered * 100 / total).toFixed(1) : 0,
      avg_delay_hours: +avg_delay_hours.toFixed(1), slow_stage };
  } catch (e: any) { out.funnel = { error: 'unavailable' }; }

  // ---- velocity (orders per hour, today or  date) ----
  try {
    const day = to || new Date().toISOString().slice(0, 10);
    const [rows]: any = await dbPool.execute(
      'SELECT HOUR(created_at) AS hour, COUNT(id) AS c FROM bf_orders WHERE DATE(created_at) = ? GROUP BY HOUR(created_at) ORDER BY hour',
      [day]);
    const points = (rows as any[]).map((r) => ({ hour: num(r.hour), count: num(r.c) }));
    const peak = points.slice().sort((a, b) => b.count - a.count)[0];
    out.velocity = { points, peak_hour: peak ? peak.hour : null,
      summary: points.reduce((a, p) => a + p.count, 0) + ' orders on ' + day };
  } catch { out.velocity = { points: [], peak_hour: null, summary: '' }; }

  // ---- repeat / new vs returning ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT phone, COUNT(id) AS n, AVG(total_payable) AS aov FROM bf_orders ' + W + ' GROUP BY phone', params);
    let nc = 0, rc = 0, raov = 0;
    for (const r of rows) { if (num(r.n) > 1) { rc++; raov += num(r.aov); } else nc++; }
    const tot = nc + rc;
    out.repeat = { new_customers: nc, repeat_customers: rc,
      repeat_rate_pct: tot ? +(rc * 100 / tot).toFixed(1) : 0,
      repeat_aov: rc ? +(raov / rc).toFixed(2) : 0 };
  } catch { out.repeat = { new_customers: 0, repeat_customers: 0, repeat_rate_pct: 0, repeat_aov: 0 }; }

  // ---- cancellation reasons (from notes keyword + status) ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT notes, COUNT(id) AS c FROM bf_orders ' + (W ? W + ' AND' : 'WHERE') + ' status = \'cancelled\' GROUP BY notes LIMIT 50', params);
    const reasons = (rows as any[]).map((r) => ({ label: String(r.notes || 'unspecified').slice(0, 80) || 'unspecified', count: num(r.c) }));
    out.cancellation = { total: reasons.reduce((a, r) => a + r.count, 0), reasons };
  } catch { out.cancellation = { total: 0, reasons: [] }; }

  // ---- courier performance ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT COALESCE(courier_name, courier_code, \'manual\') AS name, COUNT(id) AS total,' +
      ' COUNT(CASE WHEN status = \'delivered\' THEN 1 END) AS delivered,' +
      ' AVG(CASE WHEN status = \'delivered\' THEN DATEDIFF(updated_at, created_at) END) AS avg_days,' +
      ' COUNT(CASE WHEN status IN (\'return\', \'partial_return\') THEN 1 END) AS ret' +
      ' FROM bf_orders ' + W + ' GROUP BY name', params);
    out.courier = (rows as any[]).map((r) => ({ name: r.name, delivered: num(r.delivered),
      avg_delivery_days: +num(r.avg_days).toFixed(1),
      return_rate_pct: num(r.total) ? +(num(r.ret) * 100 / num(r.total)).toFixed(1) : 0 }));
  } catch { out.courier = []; }

  // ---- COD outstanding ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT COALESCE(courier_name, courier_code, \'manual\') AS name,' +
      ' SUM(CASE WHEN payment_status != \'paid\' AND status NOT IN (\'delivered\',\'cancelled\',\'return\') THEN total_payable ELSE 0 END) AS outst,' +
      ' SUM(CASE WHEN payment_status != \'paid\' AND status NOT IN (\'delivered\',\'cancelled\',\'return\') AND DATE(created_at) = CURDATE() THEN total_payable ELSE 0 END) AS today,' +
      ' SUM(CASE WHEN payment_status != \'paid\' AND status NOT IN (\'delivered\',\'cancelled\',\'return\') AND created_at < DATE_SUB(NOW(), INTERVAL 7 DAY) THEN total_payable ELSE 0 END) AS delayed' +
      ' FROM bf_orders ' + W + ' GROUP BY name', params);
    const by_courier: Record<string, number> = {};
    let ot = 0, et = 0, da = 0;
    for (const r of rows) { by_courier[String(r.name)] = num(r.outst); ot += num(r.outst); et += num(r.today); da += num(r.delayed); }
    out.cod = { outstanding_total: ot, expected_today: et, delayed_amount: da, by_courier };
  } catch { out.cod = { outstanding_total: 0, expected_today: 0, delayed_amount: 0, by_courier: {} }; }

  // ---- top products (thumb via wc_products name match) ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT i.product_name AS name, COUNT(DISTINCT i.order_id) AS orders, COALESCE(SUM(i.line_total),0) AS sales,' +
      ' COUNT(DISTINCT CASE WHEN o.status = \'cancelled\' THEN i.order_id END) AS cx,' +
      ' COUNT(DISTINCT CASE WHEN o.status IN (\'return\',\'partial_return\',\'returned\') THEN i.order_id END) AS rx,' +
      ' MAX(w.thumbnail) AS thumb' +
      ' FROM bf_order_items i LEFT JOIN bf_orders o ON o.id = i.order_id' +
      ' LEFT JOIN wc_products w ON w.name COLLATE utf8mb4_general_ci = i.product_name COLLATE utf8mb4_general_ci' +
      ' GROUP BY i.product_name ORDER BY sales DESC LIMIT 10');
    try {
      // Look up EVERY name, not just the ones missing a thumb: the LEFT JOIN
      // pulls wc_products.thumbnail, which is a WordPress hotlink. The local
      // /uploads file must win, so we always prefer the catalog image.
      const allNames = (rows as any[]).map((r) => r.name).filter(Boolean);
      if (allNames.length) {
        const { productDbPool: pdb } = await import('../../db');
        const [cats]: any = await pdb.execute(
          'SELECT name, thumbnail, local_images FROM bunon_products WHERE name IN (' + allNames.map(() => '?').join(',') + ')', allNames);
        const byName: Record<string, string> = {};
        for (const c of (cats as any[])) {
          // Shared normalizer: parses the raw JSON column, absolutises relative
          // paths, prefers a local /uploads file over a dead WP hotlink.
          byName[String(c.name)] = bestImageFor(c.local_images, c.thumbnail);
        }
        for (const r of (rows as any[])) {
          const local = byName[r.name];
          if (!local) continue;
          // Replace whenever we have a local file, or when the WC thumb is remote.
          if (!r.thumb || !isLocalImageUrl(r.thumb)) r.thumb = local;
        }
      }
    } catch {}
    out.products = (rows as any[]).map((r) => ({ name: r.name, orders: num(r.orders), sales: num(r.sales),
      thumb: r.thumb ? toAbsoluteImageUrl(r.thumb) : null,
      cancelled_pct: num(r.orders) ? +(num(r.cx) * 100 / num(r.orders)).toFixed(1) : 0,
      return_pct: num(r.orders) ? +(num(r.rx) * 100 / num(r.orders)).toFixed(1) : 0 }));
  } catch { out.products = []; }

  // ---- refunds (bunon_returns if present) ----
  try {
    const [rows]: any = await dbPool.execute('SELECT COALESCE(reason, status, \'unspecified\') AS reason, COUNT(id) AS c, COALESCE(SUM(amount),0) AS amt FROM bunon_returns GROUP BY reason');
    out.refunds = { total: (rows as any[]).reduce((a: number, r: any) => a + num(r.c), 0),
      reasons: (rows as any[]).map((r: any) => ({ label: String(r.reason), count: num(r.c), amount: num(r.amt) })) };
  } catch { out.refunds = { total: 0, reasons: [] }; }

  // ---- CLV top5 ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT phone, customer_name, COUNT(id) AS orders, SUM(total_payable) AS ltv, AVG(DATEDIFF(updated_at, created_at)) AS adb' +
      ' FROM bf_orders ' + W + ' GROUP BY phone, customer_name ORDER BY ltv DESC LIMIT 5', params);
    const adb = rows.length ? (rows as any[]).reduce((a: number, r: any) => a + num(r.adb), 0) / rows.length : 0;
    out.clv = { customers: (rows as any[]).map((r: any) => ({ phone: r.phone, name: r.customer_name, orders: num(r.orders), ltv: num(r.ltv) })),
      avg_days_between: +adb.toFixed(1) };
  } catch { out.clv = { customers: [], avg_days_between: 0 }; }

  // ---- SLA ----
  try {
    const [a]: any = await dbPool.execute('SELECT COUNT(id) AS c FROM bf_orders WHERE status = \'pending\' AND created_at < DATE_SUB(NOW(), INTERVAL 6 HOUR)');
    const [b]: any = await dbPool.execute('SELECT COUNT(id) AS c FROM bf_orders WHERE status IN (\'confirmed\',\'ready\') AND created_at < DATE_SUB(NOW(), INTERVAL 24 HOUR)');
    const warnings: string[] = [];
    if (num(a[0]?.c)) warnings.push(num(a[0].c) + ' orders pending over 6h');
    if (num(b[0]?.c)) warnings.push(num(b[0].c) + ' orders unshipped over 24h');
    out.sla = { stages: ['pending>6h', 'unshipped>24h'], pending_over_6h: num(a[0]?.c), unshipped_over_24h: num(b[0]?.c), warnings };
  } catch { out.sla = { stages: [], pending_over_6h: 0, unshipped_over_24h: 0, warnings: [] }; }

  // ---- segments (by source) ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT COALESCE(source, \'unknown\') AS seg, COUNT(id) AS orders, COALESCE(SUM(total_payable),0) AS revenue FROM bf_orders ' + W + ' GROUP BY seg ORDER BY revenue DESC', params);
    out.segments = (rows as any[]).map((r: any) => ({ segment: r.seg, orders: num(r.orders), revenue: num(r.revenue) }));
  } catch { out.segments = []; }

  // ---- districts (by city) top10 ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT COALESCE(city, \'unknown\') AS district, COUNT(id) AS orders, COALESCE(SUM(total_payable),0) AS revenue FROM bf_orders ' + W + ' GROUP BY district ORDER BY orders DESC LIMIT 10', params);
    out.districts = (rows as any[]).map((r: any) => ({ district: r.district, orders: num(r.orders), revenue: num(r.revenue) }));
  } catch { out.districts = []; }

  // ---- profit summary ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT COALESCE(SUM(total_payable),0) AS revenue,' +
      ' COALESCE(SUM(discount_amount),0) + COALESCE(SUM(discount),0) AS discounts,' +
      ' COALESCE(SUM(delivery_fee),0) + COALESCE(SUM(courier_charge),0) AS delivery,' +
      ' COALESCE(SUM(CASE WHEN status IN (\'return\',\'returned\',\'partial_return\',\'partial_returned\') THEN total_payable ELSE 0 END),0) AS returns_loss' +
      ' FROM bf_orders ' + W, params);
    const r: any = (rows as any[])[0] || {};
    const revenue = num(r.revenue), discounts = num(r.discounts), delivery = num(r.delivery), returns_loss = num(r.returns_loss);
    out.profit = { revenue, discounts, delivery, returns_loss, net: +(revenue - discounts - delivery - returns_loss).toFixed(2) };
  } catch { out.profit = { revenue: 0, discounts: 0, delivery: 0, returns_loss: 0, net: 0 }; }

  // ---- customer segments: new vs returning + high value (>=2000) ----
  try {
    const [rows]: any = await dbPool.execute(
      'SELECT COALESCE(customer_type,\'new\') AS t, COUNT(id) AS orders, COALESCE(SUM(total_payable),0) AS revenue' +
      ' FROM bf_orders ' + W + ' GROUP BY t', params);
    const m: Record<string, any> = {};
    for (const r of rows) m[String(r.t)] = { orders: num(r.orders), revenue: num(r.revenue) };
    let hv = { orders: 0, revenue: 0 };
    try {
      const [h]: any = await dbPool.execute(
        'SELECT COUNT(id) AS orders, COALESCE(SUM(total_payable),0) AS revenue FROM bf_orders ' +
        (W ? W + ' AND' : 'WHERE') + ' total_payable >= 2000', params);
      hv = { orders: num(h[0]?.orders), revenue: num(h[0]?.revenue) };
    } catch { /* best-effort */ }
    out.segments_ex = { new_vs_returning: { new: m['new'] || { orders: 0, revenue: 0 }, returning: m['returning'] || { orders: 0, revenue: 0 } }, high_value: hv };
  } catch { out.segments_ex = { new_vs_returning: { new: { orders: 0, revenue: 0 }, returning: { orders: 0, revenue: 0 } }, high_value: { orders: 0, revenue: 0 } }; }

  // ---- team: per-actor confirm/pack/ship counts from bf_order_logs ----
  try {
    const lw: string[] = [];
    const lp: any[] = [];
    if (from) { lw.push('l.created_at >= ?'); lp.push(from + ' 00:00:00'); }
    if (to) { lw.push('l.created_at <= ?'); lp.push(to + ' 23:59:59'); }
    const LW = lw.length ? 'WHERE ' + lw.join(' AND ') : '';
    const [rows]: any = await dbPool.execute(
      'SELECT l.created_by AS actor,' +
      " COUNT(CASE WHEN l.message LIKE '% to confirmed%' THEN 1 END) AS confirmed," +
      " COUNT(CASE WHEN l.message LIKE '% to ready%' OR l.message LIKE '% to pack%' THEN 1 END) AS packed," +
      " COUNT(CASE WHEN l.message LIKE '% to shipped%' OR l.message LIKE '% to in_transit%' THEN 1 END) AS shipped," +
      ' COUNT(*) AS total' +
      ' FROM bf_order_logs l ' + LW + ' GROUP BY actor ORDER BY total DESC LIMIT 20', lp);
    out.team = (rows as any[]).map((r: any) => ({ actor: r.actor || 'unknown', confirmed: num(r.confirmed), packed: num(r.packed), shipped: num(r.shipped), total: num(r.total) }));
  } catch { out.team = []; }

  // ---- no-source sections: empty ----
  out.fraud = {};
  out.attendance = [];
  out.ai_insights = [];

  res.json(out);
});

export default router;
