import express from 'express';
import { dbPool, productDbPool } from '../../db';
import { requirePermission } from '../../middleware/auth';

const router = express.Router();

// GET /api/admin/stats/overview
// GET /api/admin/stats/live — visitors active in last 120s (from app locals).
router.get('/live', requirePermission('view_kpi_live'), async (req, res) => {
  try {
    const app: any = (req as any).app;
    const liveMap: Map<string, { path: string; ref: string; cc: string; at: number }> = app?.locals?.liveVisitors;
    if (!liveMap) return res.json({ ok: true, count: 0, visitors: [] });
    const BOT_RE = /(manufacturer-site|product-similar-image|\/product\/category\/\d+|\.php\?|wp-|\.env|xmlrpc)/i;
    const isBot = (v: any) => BOT_RE.test(String(v.path || '')) || (!v.cc || v.cc === '') && /bot|crawl|spider/i.test(String(v.ref || ''));
    const now = Date.now();
    const out: any[] = [];
    for (const [, v] of liveMap) {
      if (now - v.at > 180000) { continue; }
      if (now - v.at <= 120000) out.push({ path: v.path, ref: v.ref || null, cc: v.cc || null, secs_ago: Math.round((now - v.at) / 1000), bot: isBot(v) });
    }
    // prune stale
    if (liveMap.size > 2000) for (const [k, v] of liveMap) if (now - v.at > 180000) liveMap.delete(k);
    const byPage: Record<string, number> = {};
    const byCc: Record<string, number> = {};
    for (const v of out) { byPage[v.path] = (byPage[v.path] || 0) + 1; if (v.cc) byCc[v.cc] = (byCc[v.cc] || 0) + 1; }
    const topPages = Object.entries(byPage).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([path, n]) => ({ path, n }));
    const topCountries = Object.entries(byCc).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([cc, n]) => ({ cc, n }));
    let hourly: any[] = [];
    try {
      const [rows]: any = await productDbPool.execute(
        "SELECT DATE_FORMAT(hour, '%H:00') h, SUM(n) n FROM bf_pageviews WHERE hour >= NOW() - INTERVAL 24 HOUR GROUP BY h ORDER BY h");
      hourly = rows || [];
    } catch { /* table may not exist yet */ }
    const humans = out.filter(v => !(v as any).bot).length;
    res.json({ ok: true, count: out.length, humans, bots: out.length - humans, visitors: out.slice(0, 30), topPages, topCountries, hourly });
  } catch (e: any) {
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

// Snapshot store (GA4/Meta pulls via Hermes cron) — fail-open.
router.get('/snapshots', requirePermission('view_kpi_advanced'), async (_req, res) => {
  try {
    await productDbPool.execute("CREATE TABLE IF NOT EXISTS bf_kpi_snapshots (kind VARCHAR(40) PRIMARY KEY, payload JSON NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)").catch(() => {});
    const [rows]: any = await productDbPool.execute("SELECT kind, payload, updated_at FROM bf_kpi_snapshots");
    const out: Record<string, any> = {};
    for (const r of (rows || [])) { try { out[r.kind] = { data: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload, updated_at: r.updated_at }; } catch { /* skip */ } }
    res.json({ ok: true, snapshots: out });
  } catch { res.json({ ok: true, snapshots: {} }); }
});
router.put('/snapshots/:kind', requirePermission('view_kpi_advanced'), async (req, res) => {
  try {
    const kind = String((req.params as any)?.kind || '').slice(0, 40);
    if (!kind) return res.status(400).json({ ok: false, msg: 'kind required' });
    await productDbPool.execute("CREATE TABLE IF NOT EXISTS bf_kpi_snapshots (kind VARCHAR(40) PRIMARY KEY, payload JSON NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)").catch(() => {});
    await productDbPool.execute("INSERT INTO bf_kpi_snapshots (kind, payload) VALUES (?, ?) ON DUPLICATE KEY UPDATE payload = VALUES(payload)",
      [kind, JSON.stringify((req.body as any)?.data ?? {})]);
    res.json({ ok: true });
  } catch (e: any) { res.status(500).json({ ok: false, msg: 'Server error' }); }
});

// GET /api/admin/stats/sales — days=N (0=yesterday,1=today) or from/to range or year=all-year.
router.get('/sales', requirePermission('view_kpi_sales'), async (req, res) => {
  try {
    const _sd = parseInt(String((req.query as any)?.days ?? '7'), 10);
    const days = isNaN(_sd) ? 7 : Math.min(3650, Math.max(-2, _sd));
    const qFrom = String((req.query as any)?.from ?? '').slice(0, 10);
    const qTo = String((req.query as any)?.to ?? '').slice(0, 10);
    const hasRange = /^\d{4}-\d{2}-\d{2}$/.test(qFrom) && /^\d{4}-\d{2}-\d{2}$/.test(qTo);
    const isYear = days === -2;
    const whereRange = hasRange
      ? 'WHERE DATE(created_at) BETWEEN ? AND ?'
      : isYear ? 'WHERE YEAR(created_at) = YEAR(CURDATE())' : '';
    const rangeParams: any[] = hasRange ? [qFrom, qTo] : [];
    const [rows]: any = days === 0 ? await dbPool.execute(
      "SELECT DATE(created_at) d, COUNT(*) n, SUM(total_payable) rev, SUM(CASE WHEN status IN ('cancelled','return','partial_return') THEN 1 ELSE 0 END) cx FROM bf_orders WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) GROUP BY d ORDER BY d"
      ).catch(() => [[]]) : days === 1 ? await dbPool.execute(
      "SELECT DATE(created_at) d, COUNT(*) n, SUM(total_payable) rev, SUM(CASE WHEN status IN ('cancelled','return','partial_return') THEN 1 ELSE 0 END) cx FROM bf_orders WHERE DATE(created_at) = CURDATE() GROUP BY d ORDER BY d"
      ).catch(() => [[]]) : (hasRange || isYear) ? await dbPool.execute(
      `SELECT DATE(created_at) d, COUNT(*) n, SUM(total_payable) rev, SUM(CASE WHEN status IN ('cancelled','return','partial_return') THEN 1 ELSE 0 END) cx FROM bf_orders ${whereRange} GROUP BY d ORDER BY d`,
      rangeParams).catch(() => [[]]) : await dbPool.execute(
      "SELECT DATE(created_at) d, COUNT(*) n, SUM(total_payable) rev, SUM(CASE WHEN status IN ('cancelled','return','partial_return') THEN 1 ELSE 0 END) cx FROM bf_orders WHERE created_at >= NOW() - INTERVAL ? DAY GROUP BY d ORDER BY d",
      [days]).catch(() => [[]]);
    let orders = 0, revenue = 0, cancelled = 0;
    const byDay = (rows || []).map((r: any) => {
      const n = Number(r.n || 0), rv = Number(r.rev || 0), cx = Number(r.cx || 0);
      orders += n; revenue += rv; cancelled += cx;
      return { d: String(r.d).slice(0, 10), orders: n, revenue: rv, cancelled: cx };
    });
    res.json({ ok: true, days, orders, revenue, aov: orders ? +(revenue / orders).toFixed(0) : 0,
      cancelPct: orders ? +(cancelled * 100 / orders).toFixed(1) : 0, byDay });
  } catch { res.json({ ok: true, days: 7, orders: 0, revenue: 0, aov: 0, cancelPct: 0, byDay: [] }); }
});

// GET /api/admin/stats/funnel — days=N or from/to range or year.
router.get('/funnel', requirePermission('view_kpi_orders'), async (req, res) => {
  try {
    const _fd = parseInt(String((req.query as any)?.days ?? '7'), 10);
    const days = isNaN(_fd) ? 7 : Math.min(3650, Math.max(-2, _fd));
    const qFrom = String((req.query as any)?.from ?? '').slice(0, 10);
    const qTo = String((req.query as any)?.to ?? '').slice(0, 10);
    const hasRange = /^\d{4}-\d{2}-\d{2}$/.test(qFrom) && /^\d{4}-\d{2}-\d{2}$/.test(qTo);
    const isYear = days === -2;
    const pvSql = days === 0
      ? "SELECT SUM(n) pv, 1 d FROM bf_pageviews WHERE DATE(hour) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)"
      : days === 1 ? "SELECT SUM(n) pv, 1 d FROM bf_pageviews WHERE DATE(hour) = CURDATE()"
      : (hasRange || isYear)
        ? `SELECT SUM(n) pv, COUNT(DISTINCT DATE(hour)) d FROM bf_pageviews ${hasRange ? 'WHERE DATE(hour) BETWEEN ? AND ?' : 'WHERE YEAR(hour) = YEAR(CURDATE())'}`
        : "SELECT SUM(n) pv, COUNT(DISTINCT DATE(hour)) d FROM bf_pageviews WHERE hour >= NOW() - INTERVAL ? DAY";
    const pvParams: any[] = (hasRange && days !== 0 && days !== 1) ? [qFrom, qTo] : (!hasRange && !isYear && days !== 0 && days !== 1) ? [days] : [];
    const [pv]: any = await productDbPool.execute(pvSql, pvParams.length ? pvParams : undefined as any);
    const stSql = days === 0
      ? "SELECT status, COUNT(*) n FROM bf_orders WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY) GROUP BY status"
      : days === 1 ? "SELECT status, COUNT(*) n FROM bf_orders WHERE DATE(created_at) = CURDATE() GROUP BY status"
      : (hasRange || isYear)
        ? `SELECT status, COUNT(*) n FROM bf_orders ${hasRange ? 'WHERE DATE(created_at) BETWEEN ? AND ?' : 'WHERE YEAR(created_at) = YEAR(CURDATE())'} GROUP BY status`
        : "SELECT status, COUNT(*) n FROM bf_orders WHERE created_at >= NOW() - INTERVAL ? DAY GROUP BY status";
    const stParams: any[] = (hasRange && days !== 0 && days !== 1) ? [qFrom, qTo] : (!hasRange && !isYear && days !== 0 && days !== 1) ? [days] : [];
    const [st]: any = await dbPool.execute(stSql, stParams.length ? stParams : undefined as any);
    const [ab]: any = await productDbPool.execute(
      "SELECT status, COUNT(*) n FROM wc_cart_recovery_queue GROUP BY status").catch(() => [[]]);
    const visitors = Number(pv?.[0]?.pv || 0);
    const byStatus: Record<string, number> = {};
    for (const r of (st || [])) byStatus[String(r.status)] = Number(r.n);
    const orders = Object.values(byStatus).reduce((a: number, b: number) => a + b, 0);
    const cancelled = (byStatus['cancelled'] || 0) + (byStatus['return'] || 0) + (byStatus['partial_return'] || 0);
    const delivered = byStatus['delivered'] || 0;
    const confirmed = Math.max(0, orders - cancelled);
    const abMap: Record<string, number> = {};
    const abRows: any[] = Array.isArray(ab) ? ab : [];
    for (const r of abRows) if (r?.status) abMap[String(r.status)] = Number(r.n);
    res.json({
      ok: true, days, visitors, orders, confirmed, delivered, cancelled,
      conv: visitors ? +(orders * 100 / visitors).toFixed(2) : 0,
      cancelPct: orders ? +(cancelled * 100 / orders).toFixed(1) : 0,
      deliveryPct: confirmed ? +(delivered * 100 / confirmed).toFixed(1) : 0,
      byStatus, abandoned: abMap,
    });
  } catch (e: any) {
    console.error('[stats] funnel error:', e.message);
    res.status(500).json({ ok: false, msg: 'Server error' });
  }
});

router.get('/overview', requirePermission('view_kpi_sales'), async (req, res) => {
  try {
    const _od = parseInt(String((req.query as any)?.days ?? '1'), 10);
    const days = isNaN(_od) ? 1 : Math.min(3650, Math.max(-2, _od));
    const qFrom = String((req.query as any)?.from ?? '').slice(0, 10);
    const qTo = String((req.query as any)?.to ?? '').slice(0, 10);
    const hasRange = /^\d{4}-\d{2}-\d{2}$/.test(qFrom) && /^\d{4}-\d{2}-\d{2}$/.test(qTo);
    const isYear = days === -2;
    // Single-filter period clause shared by period queries below.
    // NOTE: hasRange first — from/to always wins even when days is missing/default.
    const periodWhere = hasRange ? 'WHERE DATE(created_at) BETWEEN ? AND ?'
      : days === 1 ? 'WHERE DATE(created_at) = CURDATE()'
      : days === 0 ? 'WHERE DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)'
      : isYear ? 'WHERE YEAR(created_at) = YEAR(CURDATE())'
      : 'WHERE created_at >= NOW() - INTERVAL ? DAY';
    const periodParams: any[] = hasRange ? [qFrom, qTo]
      : (!hasRange && !isYear && days !== 0 && days !== 1) ? [days] : [];
    // Total Orders & Revenue
    const [ordersResult]: any = await dbPool.execute(`
      SELECT 
        COUNT(id) as total_orders, 
        SUM(total_payable) as total_revenue,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'in_transit' THEN 1 END) as processing_orders,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_orders,
        COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled_orders
      FROM bf_orders
    `);

    // Abandoned Carts
    const [cartsResult]: any = await productDbPool.execute(`
      SELECT 
        COUNT(id) as total_abandoned,
        COUNT(CASE WHEN status = 'converted' THEN 1 END) as recovered_carts
      FROM wc_cart_recovery_queue
    `);

    // Users
    const [usersResult]: any = await productDbPool.execute(`
      SELECT COUNT(id) as total_users FROM bunon_users
    `);

    // Period Sales (single global filter) — drives top KPI cards.
    const [todaySales]: any = await dbPool.execute(`
      SELECT SUM(total_payable) as today_revenue, COUNT(id) as today_orders
      FROM bf_orders
      ${periodWhere}
    `, periodParams.length ? periodParams : undefined as any);

    // Revenue chart follows the same filter (cap 60 points for readability).
    const chartDays = days === -1 || days === -2 ? 60 : Math.min(60, Math.max(1, days));
    const [last7Days]: any = (hasRange || isYear) ? await dbPool.execute(`
      SELECT DATE(created_at) as date, SUM(total_payable) as revenue, COUNT(id) as orders
      FROM bf_orders
      ${periodWhere}
      GROUP BY DATE(created_at)
      ORDER BY date ASC
      LIMIT 60
    `, periodParams.length ? periodParams : undefined as any) : await dbPool.execute(`
      SELECT DATE(created_at) as date, SUM(total_payable) as revenue, COUNT(id) as orders
      FROM bf_orders
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `, [chartDays - 1]);

    // Top 5 products by qty — period-aware via JOIN bf_orders (best-effort).
    let topProducts: any[] = [];
    try {
      const [tp]: any = await dbPool.execute(
        'SELECT i.product_name, SUM(i.qty) AS qty, COALESCE(SUM(i.line_total),0) AS revenue' +
        ' FROM bf_order_items i JOIN bf_orders o ON o.id = i.order_id' +
        ` ${periodWhere.replace('created_at', 'o.created_at')}` +
        ' GROUP BY i.product_name ORDER BY qty DESC LIMIT 5',
        periodParams.length ? periodParams : undefined as any
      );
      topProducts = (tp as any[]).map((r: any) => ({
        product_name: r.product_name, qty: Number(r.qty || 0), revenue: Number(r.revenue || 0),
      }));
    } catch { /* best-effort */ }

    // Period orders by courier (additive, best-effort)
    let courierToday: any[] = [];
    try {
      const [ct]: any = await dbPool.execute(
        "SELECT COALESCE(NULLIF(courier_code,''),'manual') AS courier, COUNT(id) AS orders" +
        ` FROM bf_orders ${periodWhere}` +
        " GROUP BY COALESCE(NULLIF(courier_code,''),'manual')",
        periodParams.length ? periodParams : undefined as any
      );
      courierToday = (ct as any[]).map((r: any) => ({ courier: r.courier, orders: Number(r.orders || 0) }));
    } catch { /* best-effort */ }

    // Pending returns count (additive, best-effort)
    let pendingReturns = 0;
    try {
      const [pr]: any = await dbPool.execute("SELECT COUNT(id) AS n FROM bunon_returns WHERE status = 'pending'");
      pendingReturns = Number((pr as any[])[0]?.n || 0);
    } catch { /* best-effort */ }

    // Format chart data for frontend
    const salesChartData = last7Days.map((day: any) => ({
      name: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
      sales: Number(day.revenue || 0),
      orders: Number(day.orders || 0)
    }));

    // Pie chart data — period-aware status breakdown.
    let orderStatusData: any[] = [];
    try {
      const [ps]: any = await dbPool.execute(
        `SELECT status, COUNT(id) AS n FROM bf_orders ${periodWhere} GROUP BY status`,
        periodParams.length ? periodParams : undefined as any
      );
      const cmap: Record<string, string> = {
        pending: '#F59E0B', confirmed: '#3B82F6', on_hold: '#F97316',
        ready_to_ship: '#6366F1', in_transit: '#8B5CF6', delivered: '#10B981',
        cancelled: '#EF4444', return: '#F43F5E', returned: '#F43F5E',
      };
      orderStatusData = (ps as any[])
        .map((r: any) => ({ name: String(r.status), value: Number(r.n || 0), color: cmap[String(r.status)] || '#64748B' }))
        .filter(x => x.value > 0);
    } catch { orderStatusData = []; }

    res.json({
      ok: true,
      stats: {
        totalOrders: ordersResult[0].total_orders || 0,
        totalRevenue: ordersResult[0].total_revenue || 0,
        pendingOrders: ordersResult[0].pending_orders || 0,
        completedOrders: ordersResult[0].completed_orders || 0,
        todayRevenue: todaySales[0].today_revenue || 0,
        todayOrders: todaySales[0].today_orders || 0,
        periodDays: days,
        totalAbandoned: cartsResult[0].total_abandoned || 0,
        recoveredCarts: cartsResult[0].recovered_carts || 0,
        totalUsers: usersResult[0].total_users || 0,
        aov: ordersResult[0].total_orders > 0 ? (ordersResult[0].total_revenue / ordersResult[0].total_orders).toFixed(2) : 0,
        ltv: usersResult[0].total_users > 0 ? (ordersResult[0].total_revenue / usersResult[0].total_users).toFixed(2) : 0,
        salesChartData,
        orderStatusData,
        topProducts,
        courierToday,
        pendingReturns
      }
    });

  } catch (error: any) {
    console.error('[Admin API] Stats Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching stats' });
  }
});

export default router;
