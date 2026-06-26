import express from 'express';
import { dbPool, productDbPool } from '../../db';

const router = express.Router();

// GET /api/admin/stats/overview
router.get('/overview', async (req, res) => {
  try {
    // Total Orders & Revenue
    const [ordersResult]: any = await dbPool.execute(`
      SELECT 
        COUNT(id) as total_orders, 
        SUM(total_payable) as total_revenue,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_orders,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_orders,
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

    // Today's Sales
    const [todaySales]: any = await dbPool.execute(`
      SELECT SUM(total_payable) as today_revenue, COUNT(id) as today_orders 
      FROM bf_orders 
      WHERE DATE(created_at) = CURDATE()
    `);

    // Last 7 days revenue for Bar Chart
    const [last7Days]: any = await dbPool.execute(`
      SELECT DATE(created_at) as date, SUM(total_payable) as revenue, COUNT(id) as orders
      FROM bf_orders
      WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)
      GROUP BY DATE(created_at)
      ORDER BY date ASC
    `);

    // Format chart data for frontend
    const salesChartData = last7Days.map((day: any) => ({
      name: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
      sales: Number(day.revenue || 0),
      orders: Number(day.orders || 0)
    }));

    // Pie chart data
    const orderStatusData = [
      { name: 'Pending', value: Number(ordersResult[0].pending_orders || 0), color: '#F59E0B' },
      { name: 'Processing', value: Number(ordersResult[0].processing_orders || 0), color: '#3B82F6' },
      { name: 'Completed', value: Number(ordersResult[0].completed_orders || 0), color: '#10B981' },
      { name: 'Cancelled', value: Number(ordersResult[0].cancelled_orders || 0), color: '#EF4444' }
    ].filter(item => item.value > 0);

    res.json({
      ok: true,
      stats: {
        totalOrders: ordersResult[0].total_orders || 0,
        totalRevenue: ordersResult[0].total_revenue || 0,
        pendingOrders: ordersResult[0].pending_orders || 0,
        completedOrders: ordersResult[0].completed_orders || 0,
        todayRevenue: todaySales[0].today_revenue || 0,
        todayOrders: todaySales[0].today_orders || 0,
        totalAbandoned: cartsResult[0].total_abandoned || 0,
        recoveredCarts: cartsResult[0].recovered_carts || 0,
        totalUsers: usersResult[0].total_users || 0,
        salesChartData,
        orderStatusData
      }
    });

  } catch (error: any) {
    console.error('[Admin API] Stats Error:', error.message);
    res.status(500).json({ ok: false, msg: 'Server error fetching stats' });
  }
});

export default router;
